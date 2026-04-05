import Course from "../../models/CourseModel.js";
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
          .select("name grade section")
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

async function syncSubjectCourses({ tenantId, subjectId, courseIds }) {
  await Course.updateMany(
    {
      tenantId,
      subjectId,
      ...(courseIds.length ? { _id: { $nin: courseIds } } : {}),
    },
    { $set: { subjectId: null } },
  );

  if (!courseIds.length) return;

  await Course.updateMany(
    { _id: { $in: courseIds }, tenantId, deleted: false },
    { $set: { subjectId } },
  );
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

    await validateSubjectRelations({ tenantId, ...payload });

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
      subjectId: subject._id,
      courseIds: payload.courseIds,
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

    const payload = normalizeSubjectPayload(req.body);
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

    await validateSubjectRelations({ tenantId, ...payload });

    subject.name = payload.name;
    subject.code = payload.code;
    subject.description = payload.description;
    subject.status = payload.status;
    subject.teacherIds = payload.teacherIds;
    subject.classroomIds = payload.classroomIds;
    await subject.save();

    await syncSubjectCourses({
      tenantId,
      subjectId: subject._id,
      courseIds: payload.courseIds,
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
