import Classroom from "../../models/Classroom.js";
import User from "../../models/userModel.js";
import Course from "../../models/CourseModel.js";
import CourseMember from "../../models/CourseMember.js";
import { getTenantId } from "../../middleware/authMiddleware.js";
import { writeAuditLog } from "../../services/auditLogService.js";

async function writeClassAudit(req, {
  tenantId = null,
  type,
  message,
  meta = {},
}) {
  return writeAuditLog({
    tenantId,
    type,
    actor: req.user?._id || "system",
    message,
    meta: {
      actorRole: req.userRole || req.user?.role || "",
      ...meta,
    },
  });
}

function normalizeObjectIdList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

async function listLinkedCourses(classroomId) {
  if (!classroomId) return [];

  return Course.find({
    classroomId,
    deleted: false,
  })
    .select("_id")
    .lean();
}

async function syncTeacherMembershipsForCourses(courseIds, teacherId) {
  const normalizedCourseIds = normalizeObjectIdList(courseIds);

  if (!normalizedCourseIds.length) return;

  if (!teacherId) {
    await CourseMember.updateMany(
      {
        courseId: { $in: normalizedCourseIds },
        role: "teacher",
      },
      { $set: { status: "removed" } },
    );
    return;
  }

  await CourseMember.updateMany(
    {
      courseId: { $in: normalizedCourseIds },
      role: "teacher",
      userId: { $ne: teacherId },
    },
    { $set: { status: "removed" } },
  );

  await CourseMember.bulkWrite(
    normalizedCourseIds.map((courseId) => ({
      updateOne: {
        filter: { courseId, userId: teacherId },
        update: {
          $set: { role: "teacher", status: "active" },
          $setOnInsert: { joinedAt: new Date() },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

async function syncStudentMembershipsForCourses(courseIds, studentIds = []) {
  const normalizedCourseIds = normalizeObjectIdList(courseIds);
  if (!normalizedCourseIds.length) return;

  const normalizedStudentIds = normalizeObjectIdList(studentIds);

  if (!normalizedStudentIds.length) {
    await CourseMember.updateMany(
      {
        courseId: { $in: normalizedCourseIds },
        role: "student",
      },
      { $set: { status: "removed" } },
    );
    return;
  }

  await CourseMember.updateMany(
    {
      courseId: { $in: normalizedCourseIds },
      role: "student",
      userId: { $nin: normalizedStudentIds },
    },
    { $set: { status: "removed" } },
  );

  const ops = [];
  for (const courseId of normalizedCourseIds) {
    for (const studentId of normalizedStudentIds) {
      ops.push({
        updateOne: {
          filter: { courseId, userId: studentId },
          update: {
            $set: { role: "student", status: "active" },
            $setOnInsert: { joinedAt: new Date() },
          },
          upsert: true,
        },
      });
    }
  }

  await CourseMember.bulkWrite(ops, { ordered: false });
}

export async function listClasses(req, res) {
  try {
    const tenantId = getTenantId(req);
    const filter = { ...(tenantId ? { tenantId } : {}), deletedAt: null };

    const items = await Classroom.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ items });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to list classes", error: String(e) });
  }
}

export async function createClass(req, res) {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }
    const { name, grade = "", section = "" } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: "Class name is required" });

    const doc = await Classroom.create({
      tenantId,
      name: name.trim(),
      grade,
      section,
      studentIds: [],
      deletedAt: null,
    });

    await writeClassAudit(req, {
      tenantId,
      type: "CLASS_CREATED",
      message: `Created class ${doc.name}`,
      meta: { classId: doc._id, grade, section },
    });

    return res.status(201).json({ message: "Created", class: doc });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to create class", error: String(e) });
  }
}

export async function assignTeacher(req, res) {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }
    const { id } = req.params;
    const { teacherId } = req.body;
    if (!teacherId)
      return res.status(400).json({ message: "teacherId is required" });

    // Validate teacher exists and has TEACHER role
    const teacher = await User.findOne({
      _id: teacherId,
      deleted: { $ne: true },
    }).lean();

    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }
    if (String(teacher.role || "").toUpperCase() !== "TEACHER") {
      return res
        .status(400)
        .json({ message: "User is not a teacher. Only users with role TEACHER can be assigned." });
    }

    const filter = {
      _id: id,
      tenantId,
      deletedAt: null,
    };
    const doc = await Classroom.findOneAndUpdate(
      filter,
      { teacherId },
      { new: true },
    );
    if (!doc) return res.status(404).json({ message: "Class not found" });

    // Add this tenant to the teacher's tenantIds (teachers can be in multiple tenants)
    await User.updateOne(
      { _id: teacherId },
      { $addToSet: { tenantIds: tenantId } },
    );

    // Auto-enroll teacher as CourseMember in any course linked to this classroom.
    // This ensures the teacher's course list is populated so they can create
    // assignments without the "Select a course first" error.
    try {
      const linkedCourses = await listLinkedCourses(doc._id);
      await syncTeacherMembershipsForCourses(
        linkedCourses.map((course) => course._id),
        teacher._id,
      );
    } catch (memberErr) {
      // Non-fatal: log but don't fail the overall assignment
      console.error("assignTeacher: failed to sync CourseMember records:", memberErr);
    }

    await writeClassAudit(req, {
      tenantId,
      type: "CLASS_TEACHER_ASSIGNED",
      message: `Assigned teacher ${teacher.email} to class ${doc.name}`,
      meta: { classId: doc._id, teacherId: teacher._id },
    });

    return res.json({ message: "Teacher assigned", class: doc });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to assign teacher", error: String(e) });
  }
}

export async function enrollStudents(req, res) {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }
    const { id } = req.params;
    const { studentIds } = req.body;
    if (!Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({ message: "studentIds must be non-empty array" });
    }

    // Validate all students exist, are STUDENT role, and belong to this tenant
    const students = await User.find({
      _id: { $in: studentIds },
      deleted: { $ne: true },
    }).lean();

    if (students.length !== studentIds.length) {
      return res.status(404).json({
        message: `Some students not found. Expected ${studentIds.length}, found ${students.length}.`,
      });
    }

    const invalidRoles = students.filter((s) => s.role !== "STUDENT");
    if (invalidRoles.length > 0) {
      return res.status(400).json({
        message: `Some users are not students: ${invalidRoles.map((u) => u.email).join(", ")}`,
      });
    }

    // Students are single-tenant: verify they all belong to this tenant
    const wrongTenant = students.filter((s) => s.tenantId !== tenantId);
    if (wrongTenant.length > 0) {
      return res.status(400).json({
        message: `Some students do not belong to this tenant: ${wrongTenant.map((u) => u.email).join(", ")}`,
      });
    }

    const filter = {
      _id: id,
      tenantId,
      deletedAt: null,
    };
    const doc = await Classroom.findOneAndUpdate(
      filter,
      { $addToSet: { studentIds: { $each: studentIds } } },
      { new: true },
    );
    if (!doc) return res.status(404).json({ message: "Class not found" });

    try {
      const linkedCourses = await listLinkedCourses(doc._id);
      await syncStudentMembershipsForCourses(
        linkedCourses.map((course) => course._id),
        doc.studentIds,
      );
    } catch (memberErr) {
      console.error("enrollStudents: failed to sync CourseMember records:", memberErr);
    }

    await writeClassAudit(req, {
      tenantId,
      type: "CLASS_STUDENTS_ENROLLED",
      message: `Enrolled ${studentIds.length} student(s) in class ${doc.name}`,
      meta: { classId: doc._id, studentIds },
    });

    return res.json({ message: "Enrolled", class: doc });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to enroll students", error: String(e) });
  }
}

/**
 * DELETE /api/admin/classes/:id/unenroll
 * Remove student(s) from a class
 * Body: { studentIds: [id, ...] }
 */
export async function unenrollStudents(req, res) {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ message: "Missing tenantId" });

    const { id } = req.params;
    const { studentIds } = req.body;
    if (!Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({ message: "studentIds[] is required" });
    }

    const doc = await Classroom.findOneAndUpdate(
      { _id: id, tenantId, deletedAt: null },
      { $pullAll: { studentIds } },
      { new: true },
    );
    if (!doc) return res.status(404).json({ message: "Class not found" });

    try {
      const linkedCourses = await listLinkedCourses(doc._id);
      await syncStudentMembershipsForCourses(
        linkedCourses.map((course) => course._id),
        doc.studentIds,
      );
    } catch (memberErr) {
      console.error("unenrollStudents: failed to sync CourseMember records:", memberErr);
    }

    await writeClassAudit(req, {
      tenantId,
      type: "CLASS_STUDENTS_UNENROLLED",
      message: `Removed ${studentIds.length} student(s) from class ${doc.name}`,
      meta: { classId: doc._id, studentIds },
    });

    return res.json({ message: "Students removed", class: doc });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to unenroll students", error: String(e) });
  }
}
