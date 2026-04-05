import Announcement from "../models/Announcement.js";
import Classroom from "../models/Classroom.js";
import Course from "../models/CourseModel.js";
import {
  canAccessCourse,
  getAccessibleClassroomIdsForUser,
  getStudentAcademicContext,
  getRequestTenantId,
  isAdminLike,
  isTeacherLike,
  isValidObjectId,
  normalizeRoleValue,
  toId,
} from "../utils/academicContract.js";

const ALLOWED_SCOPES = new Set(["tenant", "course", "classroom"]);
const ALLOWED_CATEGORIES = new Set(["general", "deadline", "update", "reminder"]);

function defaultAudienceForScope(scope, role) {
  if (scope === "tenant" && ["ADMIN", "SUPERADMIN"].includes(role)) {
    return ["STUDENT", "TEACHER", "ADMIN"];
  }
  return ["STUDENT"];
}

function normalizeAudienceRoles(value, fallback) {
  const roles = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[,\n]/g)
        .map((item) => item.trim());

  const normalized = Array.from(
    new Set(
      roles
        .map((item) => String(item || "").trim().toUpperCase())
        .filter((item) =>
          ["STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"].includes(item),
        ),
    ),
  );

  return normalized.length ? normalized : fallback;
}

function serializeAnnouncement(doc) {
  const plain = doc?.toObject ? doc.toObject() : { ...(doc || {}) };
  return {
    ...plain,
    courseId: toId(plain.courseId),
    classroomId: toId(plain.classroomId),
    subjectId: toId(plain.subjectId),
    createdBy: toId(plain.createdBy),
  };
}

function buildActiveFilter(tenantId) {
  const now = new Date();
  return {
    tenantId,
    deleted: false,
    publishedAt: { $lte: now },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  };
}

async function canManageClassroom({ classroomId, req, tenantId }) {
  if (!isValidObjectId(classroomId)) return false;

  const baseFilter = {
    _id: classroomId,
    deletedAt: null,
    tenantId,
  };

  if (isAdminLike(req)) {
    return !!(await Classroom.exists(baseFilter));
  }

  return !!(await Classroom.exists({
    ...baseFilter,
    teacherId: req.user._id,
  }));
}

async function resolveTeacherCourseIds(req, tenantId) {
  const rows = await Course.find({
    tenantId,
    deleted: false,
  })
    .select("_id tenantId createdBy deleted")
    .lean();

  const allowedIds = [];
  for (const row of rows) {
    const allowed = await canAccessCourse({ course: row, req });
    if (allowed) {
      allowedIds.push(row._id);
    }
  }

  return allowedIds;
}

export async function listAnnouncements(req, res) {
  try {
    const tenantId = getRequestTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }

    const role = normalizeRoleValue(req.user?.role);
    const filter = buildActiveFilter(tenantId);
    const scope = String(req.query.scope || "").trim();
    if (ALLOWED_SCOPES.has(scope)) {
      filter.scope = scope;
    }

    if (isAdminLike(req)) {
      if (req.query.courseId && isValidObjectId(req.query.courseId)) {
        filter.courseId = req.query.courseId;
      }
      if (req.query.classroomId && isValidObjectId(req.query.classroomId)) {
        filter.classroomId = req.query.classroomId;
      }
    } else if (role === "STUDENT") {
      const context = await getStudentAcademicContext(req.user._id, tenantId);
      filter.audienceRoles = role;
      filter.$and = [
        {
          $or: [
            { scope: "tenant" },
            { scope: "course", courseId: { $in: context.courseIds } },
            { scope: "classroom", classroomId: { $in: context.classroomIds } },
          ],
        },
      ];
    } else {
      const [courseIds, classroomIds] = await Promise.all([
        resolveTeacherCourseIds(req, tenantId),
        getAccessibleClassroomIdsForUser({
          userId: req.user._id,
          tenantId,
          role,
        }),
      ]);

      filter.$and = [
        {
          $or: [
            { createdBy: req.user._id },
            { scope: "tenant", audienceRoles: role },
            {
              scope: "course",
              courseId: { $in: courseIds },
              audienceRoles: role,
            },
            {
              scope: "classroom",
              classroomId: { $in: classroomIds },
              audienceRoles: role,
            },
          ],
        },
      ];
    }

    const rows = await Announcement.find(filter)
      .sort({ pinned: -1, publishedAt: -1, createdAt: -1 })
      .lean();

    return res.json({ items: rows.map((row) => serializeAnnouncement(row)) });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load announcements",
      error: error.message,
    });
  }
}

export async function createAnnouncement(req, res) {
  try {
    const tenantId = getRequestTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }

    const role = normalizeRoleValue(req.user?.role);
    if (!isTeacherLike(req)) {
      return res.status(403).json({ message: "Only teachers and admins can create announcements" });
    }

    const title = String(req.body.title || "").trim();
    const message = String(req.body.message || "").trim();
    const scope = String(req.body.scope || "").trim().toLowerCase();
    const category = ALLOWED_CATEGORIES.has(String(req.body.category || "").trim())
      ? String(req.body.category).trim()
      : "general";

    if (!title || !message) {
      return res.status(400).json({ message: "title and message are required" });
    }

    if (!ALLOWED_SCOPES.has(scope)) {
      return res.status(400).json({ message: "scope must be tenant, course, or classroom" });
    }

    if (scope === "tenant" && !isAdminLike(req)) {
      return res.status(403).json({ message: "Only admins can create tenant-wide announcements" });
    }

    let courseId = null;
    let classroomId = null;

    if (scope === "course") {
      courseId = req.body.courseId;
      if (!isValidObjectId(courseId)) {
        return res.status(400).json({ message: "courseId is required for course announcements" });
      }

      const course = await Course.findById(courseId).select("_id tenantId createdBy deleted");
      if (!course || course.deleted || String(course.tenantId || "") !== String(tenantId)) {
        return res.status(404).json({ message: "Course not found" });
      }

      const allowed = await canAccessCourse({ course, req });
      if (!allowed) {
        return res.status(403).json({ message: "Not allowed to announce to this course" });
      }
    }

    if (scope === "classroom") {
      classroomId = req.body.classroomId;
      if (!isValidObjectId(classroomId)) {
        return res.status(400).json({ message: "classroomId is required for classroom announcements" });
      }

      const allowed = await canManageClassroom({ classroomId, req, tenantId });
      if (!allowed) {
        return res.status(403).json({ message: "Not allowed to announce to this classroom" });
      }
    }

    const expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      return res.status(400).json({ message: "Invalid expiresAt" });
    }

    const announcement = await Announcement.create({
      tenantId,
      title,
      message,
      scope,
      courseId,
      classroomId,
      subjectId: isValidObjectId(req.body.subjectId) ? req.body.subjectId : null,
      audienceRoles: normalizeAudienceRoles(
        req.body.audienceRoles,
        defaultAudienceForScope(scope, role),
      ),
      category,
      pinned: String(req.body.pinned).toLowerCase() === "true",
      publishedAt: req.body.publishedAt ? new Date(req.body.publishedAt) : new Date(),
      expiresAt,
      createdBy: req.user._id,
      deleted: false,
      deletedAt: null,
    });

    return res.status(201).json({
      message: "Announcement created",
      announcement: serializeAnnouncement(announcement),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create announcement",
      error: error.message,
    });
  }
}

export async function updateAnnouncement(req, res) {
  try {
    const tenantId = getRequestTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid announcement id" });
    }

    const announcement = await Announcement.findOne({
      _id: id,
      tenantId,
      deleted: false,
    });
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    if (!isAdminLike(req) && String(announcement.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not allowed to update this announcement" });
    }

    if (req.body.title !== undefined) announcement.title = String(req.body.title || "").trim();
    if (req.body.message !== undefined) {
      announcement.message = String(req.body.message || "").trim();
    }
    if (!announcement.title || !announcement.message) {
      return res.status(400).json({ message: "title and message are required" });
    }

    if (req.body.category && ALLOWED_CATEGORIES.has(String(req.body.category).trim())) {
      announcement.category = String(req.body.category).trim();
    }
    if (req.body.pinned !== undefined) {
      announcement.pinned = String(req.body.pinned).toLowerCase() === "true";
    }
    if (req.body.expiresAt !== undefined) {
      announcement.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;
      if (announcement.expiresAt && Number.isNaN(announcement.expiresAt.getTime())) {
        return res.status(400).json({ message: "Invalid expiresAt" });
      }
    }
    if (req.body.audienceRoles !== undefined) {
      announcement.audienceRoles = normalizeAudienceRoles(
        req.body.audienceRoles,
        announcement.audienceRoles,
      );
    }

    await announcement.save();

    return res.json({
      message: "Announcement updated",
      announcement: serializeAnnouncement(announcement),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update announcement",
      error: error.message,
    });
  }
}

export async function deleteAnnouncement(req, res) {
  try {
    const tenantId = getRequestTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid announcement id" });
    }

    const announcement = await Announcement.findOne({
      _id: id,
      tenantId,
      deleted: false,
    });
    if (!announcement) {
      return res.status(404).json({ message: "Announcement not found" });
    }

    if (!isAdminLike(req) && String(announcement.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not allowed to delete this announcement" });
    }

    announcement.deleted = true;
    announcement.deletedAt = new Date();
    await announcement.save();

    return res.json({ message: "Announcement deleted" });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete announcement",
      error: error.message,
    });
  }
}
