import Course from "../../models/CourseModel.js";
import CourseMember from "../../models/CourseMember.js";
import Classroom from "../../models/Classroom.js";
import Subject from "../../models/Subject.js";
import User from "../../models/userModel.js";
import {
  getRequestTenantId,
  isValidObjectId,
  toId,
  userFields,
} from "../../utils/academicContract.js";

const ACTIVE_STATUS = new Set(["active", "archived"]);

function normalizeIdArray(values) {
  const raw = Array.isArray(values)
    ? values
    : String(values || "")
        .split(/[,\n]/g)
        .map((value) => value.trim());

  return Array.from(
    new Set(raw.map((value) => String(value || "").trim()).filter(isValidObjectId)),
  );
}

function normalizeSubjectPayload(body = {}) {
  return {
    name: String(body.name || "").trim(),
    code: String(body.code || "")
      .trim()
      .toUpperCase(),
    description: String(body.description || "").trim(),
    status: ACTIVE_STATUS.has(String(body.status || "").trim())
      ? String(body.status).trim()
      : "active",
    teacherIds: normalizeIdArray(body.teacherIds),
    classroomIds: normalizeIdArray(body.classroomIds),
    courseIds: normalizeIdArray(body.courseIds),
  };
}

async function validateSubjectRelations({
  tenantId,
  teacherIds = [],
  classroomIds = [],
  courseIds = [],
}) {
  const [teachers, classrooms, courses] = await Promise.all([
    teacherIds.length
      ? User.find({
          _id: { $in: teacherIds },
          deleted: { $ne: true },
          role: "TEACHER",
          $or: [{ tenantId }, { tenantIds: tenantId }],
        })
          .select(userFields)
          .lean()
      : [],
    classroomIds.length
      ? Classroom.find({
          _id: { $in: classroomIds },
          tenantId,
          deletedAt: null,
        })
          .select("name grade section teacherId studentIds")
          .lean()
      : [],
    courseIds.length
      ? Course.find({
          _id: { $in: courseIds },
          tenantId,
          deleted: false,
        })
          .select("title shortName classroomId subjectId")
          .lean()
      : [],
  ]);

  if (teachers.length !== teacherIds.length) {
    throw new Error("Some teacherIds are invalid for this tenant");
  }

  if (classrooms.length !== classroomIds.length) {
    throw new Error("Some classroomIds are invalid for this tenant");
  }

  if (courses.length !== courseIds.length) {
    throw new Error("Some courseIds are invalid for this tenant");
  }

  return { teachers, classrooms, courses };
}

function buildWorkspaceTitle(subject, classroom) {
  if (!classroom) return subject.name;

  const classLabel = [classroom.name, classroom.grade, classroom.section]
    .filter(Boolean)
    .join(" ");

  return classLabel ? `${subject.name} - ${classLabel}` : subject.name;
}

function buildWorkspaceShortName(subject, classroom) {
  const base = subject.code || subject.name;
  const suffix = classroom?.name || classroom?.section || "";
  return String([base, suffix].filter(Boolean).join(" - "))
    .trim()
    .slice(0, 50);
}

async function syncCourseMemberships({
  courseId,
  teacherIds = [],
  studentIds = [],
}) {
  const normalizedTeacherIds = normalizeIdArray(teacherIds);
  const normalizedStudentIds = normalizeIdArray(studentIds);

  await CourseMember.updateMany(
    {
      courseId,
      role: "teacher",
      ...(normalizedTeacherIds.length
        ? { userId: { $nin: normalizedTeacherIds } }
        : {}),
    },
    { $set: { status: "removed" } },
  );

  await CourseMember.updateMany(
    {
      courseId,
      role: "student",
      ...(normalizedStudentIds.length
        ? { userId: { $nin: normalizedStudentIds } }
        : {}),
    },
    { $set: { status: "removed" } },
  );

  const ops = [];

  for (const teacherId of normalizedTeacherIds) {
    ops.push({
      updateOne: {
        filter: { courseId, userId: teacherId },
        update: {
          $set: { role: "teacher", status: "active" },
          $setOnInsert: { joinedAt: new Date() },
        },
        upsert: true,
      },
    });
  }

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

  if (ops.length) {
    await CourseMember.bulkWrite(ops, { ordered: false });
  }
}

async function syncSubjectCourses({
  tenantId,
  subject,
  courseIds = [],
  classrooms = [],
  courses = [],
  actorUserId,
}) {
  const managedCourseIds = new Set(normalizeIdArray(courseIds));
  const explicitCourseByClassroomId = new Map(
    (courses || [])
      .map((course) => [toId(course.classroomId), course])
      .filter(([classroomId]) => classroomId),
  );
  const courseClassroomOverrides = new Map();
  const selectedClassroomIds = new Set(
    (classrooms || []).map((classroom) => toId(classroom._id)).filter(Boolean),
  );

  for (const classroom of classrooms || []) {
    const classroomId = toId(classroom._id);
    let course = explicitCourseByClassroomId.get(classroomId);

    if (!course) {
      course = await Course.findOne({
        tenantId,
        subjectId: subject._id,
        classroomId,
        deleted: false,
      })
        .select("_id classroomId")
        .lean();
    }

    if (!course) {
      course = await Course.create({
        title: buildWorkspaceTitle(subject, classroom),
        shortName: buildWorkspaceShortName(subject, classroom),
        description: subject.description || "",
        tenantId,
        subjectId: subject._id,
        classroomId,
        createdBy: actorUserId,
        visibility: "private",
        type: "course",
      });
    }

    managedCourseIds.add(String(course._id));
    courseClassroomOverrides.set(String(course._id), classroom);
  }

  await Course.updateMany(
    {
      tenantId,
      subjectId: subject._id,
      ...(managedCourseIds.size
        ? { _id: { $nin: Array.from(managedCourseIds) } }
        : {}),
    },
    { $set: { subjectId: null } },
  );

  if (!managedCourseIds.size) return [];

  const managedCourses = await Course.find({
    _id: { $in: Array.from(managedCourseIds) },
    tenantId,
    deleted: false,
  })
    .select("_id classroomId")
    .lean();

  const classroomIdsToHydrate = Array.from(
    new Set(
      managedCourses
        .map((course) => toId(course.classroomId))
        .filter(
          (classroomId) =>
            classroomId && !selectedClassroomIds.has(String(classroomId)),
        ),
    ),
  );

  const extraClassrooms = classroomIdsToHydrate.length
    ? await Classroom.find({
        _id: { $in: classroomIdsToHydrate },
        tenantId,
        deletedAt: null,
      })
        .select("name grade section teacherId studentIds")
        .lean()
    : [];

  const classroomById = new Map(
    [...(classrooms || []), ...extraClassrooms].map((classroom) => [
      toId(classroom._id),
      classroom,
    ]),
  );

  const subjectTeacherIds = normalizeIdArray(subject.teacherIds);

  for (const course of managedCourses) {
    const courseId = String(course._id);
    const classroom =
      courseClassroomOverrides.get(courseId) ||
      classroomById.get(toId(course.classroomId)) ||
      null;

    const updates = { subjectId: subject._id };
    if (classroom) {
      updates.classroomId = classroom._id;
      updates.title = buildWorkspaceTitle(subject, classroom);
      updates.shortName = buildWorkspaceShortName(subject, classroom);
      updates.description = subject.description || "";
    }

    await Course.updateOne({ _id: course._id }, { $set: updates });

    await syncCourseMemberships({
      courseId: course._id,
      teacherIds: [
        ...subjectTeacherIds,
        ...(classroom?.teacherId ? [classroom.teacherId] : []),
      ],
      studentIds: classroom?.studentIds || [],
    });
  }

  return Array.from(managedCourseIds);
}

async function serializeSubject(subjectDoc) {
  const subject = subjectDoc?.toObject ? subjectDoc.toObject() : { ...(subjectDoc || {}) };

  const [teachers, classrooms, courses] = await Promise.all([
    subject.teacherIds?.length
      ? User.find({
          _id: { $in: subject.teacherIds },
          deleted: { $ne: true },
        })
          .select(userFields)
          .lean()
      : [],
    subject.classroomIds?.length
      ? Classroom.find({
          _id: { $in: subject.classroomIds },
          deletedAt: null,
        })
          .select("name grade section")
          .lean()
      : [],
    Course.find({
      tenantId: subject.tenantId,
      subjectId: subject._id,
      deleted: false,
    })
      .select("title shortName classroomId")
      .lean(),
  ]);

  return {
    ...subject,
    teacherIds: (subject.teacherIds || []).map(toId).filter(Boolean),
    classroomIds: (subject.classroomIds || []).map(toId).filter(Boolean),
    courseIds: courses.map((course) => toId(course._id)).filter(Boolean),
    teachers,
    classrooms,
    courses,
    counts: {
      teachers: teachers.length,
      classrooms: classrooms.length,
      courses: courses.length,
    },
  };
}

export async function listSubjects(req, res) {
  try {
    const tenantId = getRequestTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }

    const q = String(req.query.q || "").trim();
    const status = String(req.query.status || "").trim();
    const filter = {
      tenantId,
      deleted: false,
    };

    if (q) {
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { code: { $regex: q, $options: "i" } },
      ];
    }

    if (ACTIVE_STATUS.has(status)) {
      filter.status = status;
    }

    const rows = await Subject.find(filter).sort({ createdAt: -1 }).lean();
    const items = await Promise.all(rows.map((row) => serializeSubject(row)));
    return res.json({ items });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to list subjects",
      error: error.message,
    });
  }
}

export async function createSubject(req, res) {
  try {
    const tenantId = getRequestTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }

    const payload = normalizeSubjectPayload(req.body);
    if (!payload.name) {
      return res.status(400).json({ message: "Subject name is required" });
    }

    const existing = await Subject.findOne({
      tenantId,
      nameKey: payload.name.toLowerCase(),
      deleted: false,
    }).lean();

    if (existing) {
      return res.status(409).json({ message: "A subject with this name already exists" });
    }

    if (payload.code) {
      const codeExists = await Subject.findOne({
        tenantId,
        code: payload.code,
        deleted: false,
      }).lean();
      if (codeExists) {
        return res.status(409).json({ message: "A subject with this code already exists" });
      }
    }

    const relations = await validateSubjectRelations({ tenantId, ...payload });

    const subject = await Subject.create({
      tenantId,
      name: payload.name,
      code: payload.code,
      description: payload.description,
      status: payload.status,
      teacherIds: payload.teacherIds,
      classroomIds: payload.classroomIds,
      deleted: false,
      deletedAt: null,
    });

    await syncSubjectCourses({
      tenantId,
      subject,
      courseIds: payload.courseIds,
      classrooms: relations.classrooms,
      courses: relations.courses,
      actorUserId: req.user?._id,
    });

    return res.status(201).json({
      message: "Subject created",
      subject: await serializeSubject(subject),
    });
  } catch (error) {
    const status =
      /invalid/.test(error.message) || /required/.test(error.message) ? 400 : 500;
    return res.status(status).json({
      message: "Failed to create subject",
      error: error.message,
    });
  }
}

export async function updateSubject(req, res) {
  try {
    const tenantId = getRequestTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid subject id" });
    }

    const subject = await Subject.findOne({
      _id: id,
      tenantId,
      deleted: false,
    });

    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    // Preserve existing classroomIds/teacherIds if the client omits them
    // (frontend edit form only sends name/code/description — omitting these
    // fields must not wipe classroom/teacher associations already on the record)
    const bodyWithPreserved = {
      ...req.body,
      classroomIds:
        req.body.classroomIds !== undefined
          ? req.body.classroomIds
          : (subject.classroomIds || []).map(String),
      teacherIds:
        req.body.teacherIds !== undefined
          ? req.body.teacherIds
          : (subject.teacherIds || []).map(String),
    };
    const payload = normalizeSubjectPayload(bodyWithPreserved);
    if (!payload.name) {
      return res.status(400).json({ message: "Subject name is required" });
    }

    const nameExists = await Subject.findOne({
      _id: { $ne: id },
      tenantId,
      nameKey: payload.name.toLowerCase(),
      deleted: false,
    }).lean();

    if (nameExists) {
      return res.status(409).json({ message: "A subject with this name already exists" });
    }

    if (payload.code) {
      const codeExists = await Subject.findOne({
        _id: { $ne: id },
        tenantId,
        code: payload.code,
        deleted: false,
      }).lean();
      if (codeExists) {
        return res.status(409).json({ message: "A subject with this code already exists" });
      }
    }

    const relations = await validateSubjectRelations({ tenantId, ...payload });

    subject.name = payload.name;
    subject.code = payload.code;
    subject.description = payload.description;
    subject.status = payload.status;
    subject.teacherIds = payload.teacherIds;
    subject.classroomIds = payload.classroomIds;
    await subject.save();

    await syncSubjectCourses({
      tenantId,
      subject,
      courseIds: payload.courseIds,
      classrooms: relations.classrooms,
      courses: relations.courses,
      actorUserId: req.user?._id || subject.createdBy,
    });

    return res.json({
      message: "Subject updated",
      subject: await serializeSubject(subject),
    });
  } catch (error) {
    const status =
      /invalid/.test(error.message) || /required/.test(error.message) ? 400 : 500;
    return res.status(status).json({
      message: "Failed to update subject",
      error: error.message,
    });
  }
}

export async function deleteSubject(req, res) {
  try {
    const tenantId = getRequestTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid subject id" });
    }

    const subject = await Subject.findOne({
      _id: id,
      tenantId,
      deleted: false,
    });

    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    subject.deleted = true;
    subject.deletedAt = new Date();
    await subject.save();

    await Course.updateMany(
      { tenantId, subjectId: subject._id, deleted: false },
      { $set: { subjectId: null } },
    );

    return res.json({ message: "Subject deleted" });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete subject",
      error: error.message,
    });
  }
}
