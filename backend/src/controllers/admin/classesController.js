import Classroom from "../../models/Classroom.js";
import User from "../../models/userModel.js";
import Course from "../../models/CourseModel.js";
import CourseMember from "../../models/CourseMember.js";
import Subject from "../../models/Subject.js";
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

/**
 * Create (or update) a Course record linking a subject to a classroom.
 * Safe to call even if the course already exists — returns existing or newly created.
 */
async function upsertSubjectClassCourse({ tenantId, subject, classroom, actorUserId }) {
  const existing = await Course.findOne({
    tenantId,
    subjectId: subject._id,
    classroomId: classroom._id,
    deleted: false,
  }).lean();

  if (existing) return existing;

  const classLabel = [classroom.name, classroom.grade, classroom.section]
    .filter(Boolean)
    .join(" ");
  const title = classLabel ? `${subject.name} - ${classLabel}` : subject.name;
  const shortName = `${subject.code || subject.name} - ${classroom.name}`.slice(0, 50);

  return Course.create({
    title,
    shortName,
    description: subject.description || "",
    tenantId,
    subjectId: subject._id,
    classroomId: classroom._id,
    createdBy: actorUserId,
    visibility: "private",
    type: "course",
  });
}

export async function listClasses(req, res) {
  try {
    const tenantId = getTenantId(req);
    const filter = { ...(tenantId ? { tenantId } : {}), deletedAt: null };

    const items = await Classroom.find(filter).sort({ createdAt: -1 }).lean();

    // --- Batch-fetch related users (teachers + students) ---
    const allTeacherIds = [...new Set(
      items.map((cls) => cls.teacherId).filter(Boolean).map(String),
    )];
    const allStudentIds = [...new Set(
      items.flatMap((cls) => (cls.studentIds || []).map(String)),
    )];

    const [teacherDocs, studentDocs] = await Promise.all([
      allTeacherIds.length
        ? User.find({ _id: { $in: allTeacherIds } })
            .select("firstName lastName email role")
            .lean()
        : [],
      allStudentIds.length
        ? User.find({ _id: { $in: allStudentIds } })
            .select("firstName lastName email role")
            .lean()
        : [],
    ]);

    const teacherById = new Map(teacherDocs.map((t) => [String(t._id), t]));
    const studentById = new Map(studentDocs.map((s) => [String(s._id), s]));

    // --- Build classroom → subject map via Subject.classroomIds ---
    // (Subjects store classroomIds[], not the other way round)
    const subjectDocs = tenantId
      ? await Subject.find({ tenantId, deleted: false })
          .select("name code classroomIds")
          .lean()
      : [];

    const classroomSubjectMap = new Map();
    for (const subj of subjectDocs) {
      for (const clsId of subj.classroomIds || []) {
        // A classroom may appear in multiple subjects; keep the first match
        if (!classroomSubjectMap.has(String(clsId))) {
          classroomSubjectMap.set(String(clsId), subj);
        }
      }
    }

    // --- Build classroom → all subjects map (one-to-many) ---
    const classroomSubjectsMap = new Map();
    for (const subj of subjectDocs) {
      for (const clsId of subj.classroomIds || []) {
        const key = String(clsId);
        if (!classroomSubjectsMap.has(key)) classroomSubjectsMap.set(key, []);
        classroomSubjectsMap.get(key).push(subj);
      }
    }

    // --- Enrich each classroom ---
    const enriched = items.map((cls) => ({
      ...cls,
      teacher: cls.teacherId ? (teacherById.get(String(cls.teacherId)) || null) : null,
      students: (cls.studentIds || [])
        .map((id) => studentById.get(String(id)))
        .filter(Boolean),
      // Primary subject (backwards-compat with frontend `cls.subject?.name`)
      subject: classroomSubjectMap.get(String(cls._id)) || null,
      // All subjects assigned to this class
      subjects: classroomSubjectsMap.get(String(cls._id)) || [],
    }));

    return res.json({ items: enriched });
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

    const { name, grade = "", section = "", teacherId, subjectId } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: "Class name is required" });

    // --- Create the classroom ---
    const doc = await Classroom.create({
      tenantId,
      name: name.trim(),
      grade,
      section,
      studentIds: [],
      deletedAt: null,
    });

    // --- Optionally assign teacher inline ---
    if (teacherId) {
      try {
        // BUG FIX: validate teacher exists AND belongs to this tenant
        const teacher = await User.findOne({
          _id: teacherId,
          deleted: { $ne: true },
          $or: [{ tenantId }, { tenantIds: tenantId }],
        }).lean();

        if (teacher && String(teacher.role || "").toUpperCase() === "TEACHER") {
          await Classroom.updateOne({ _id: doc._id }, { teacherId: teacher._id });
          doc.teacherId = teacher._id;

          await User.updateOne(
            { _id: teacherId },
            { $addToSet: { tenantIds: tenantId } },
          );

          // Sync CourseMember in any courses already linked to this classroom
          const linkedCourses = await listLinkedCourses(doc._id);
          await syncTeacherMembershipsForCourses(
            linkedCourses.map((c) => c._id),
            teacher._id,
          );
        }
      } catch (err) {
        // Non-fatal — class is created, teacher assignment failed silently
        console.error("createClass: teacher assignment failed:", err.message);
      }
    }

    // --- Optionally link to subject and provision Course ---
    if (subjectId) {
      try {
        const subject = await Subject.findOne({
          _id: subjectId,
          tenantId,
          deleted: false,
        }).lean();

        if (subject) {
          // Add this classroom to the Subject's classroomIds
          await Subject.updateOne(
            { _id: subjectId },
            { $addToSet: { classroomIds: doc._id } },
          );

          // Provision the Course workspace for subject+classroom
          // Use toObject() so schema fields (name, grade, _id) are plain-object
          // properties — spreading a Mongoose Document doesn't copy schema fields.
          const classroomPlain = doc.toObject ? doc.toObject() : { ...doc };
          const course = await upsertSubjectClassCourse({
            tenantId,
            subject,
            classroom: classroomPlain,
            actorUserId: req.user?._id,
          });

          // Sync teacher into course if we just assigned one
          if (doc.teacherId) {
            await syncTeacherMembershipsForCourses([course._id], doc.teacherId);
          }
        }
      } catch (err) {
        console.error("createClass: subject linkage failed:", err.message);
      }
    }

    await writeClassAudit(req, {
      tenantId,
      type: "CLASS_CREATED",
      message: `Created class ${doc.name}`,
      meta: { classId: doc._id, grade, section, teacherId, subjectId },
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

    // BUG FIX: validate teacher exists AND belongs to this tenant
    // (teachers can be multi-tenant so check both tenantId and tenantIds)
    const teacher = await User.findOne({
      _id: teacherId,
      deleted: { $ne: true },
      $or: [{ tenantId }, { tenantIds: tenantId }],
    }).lean();

    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found in this tenant" });
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
    try {
      const linkedCourses = await listLinkedCourses(doc._id);
      await syncTeacherMembershipsForCourses(
        linkedCourses.map((course) => course._id),
        teacher._id,
      );
    } catch (memberErr) {
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
