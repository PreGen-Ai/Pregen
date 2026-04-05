import Course from "../models/CourseModel.js";
import CourseActivity from "../models/CourseActivityModel.js";
import CourseSection from "../models/CourseSectionModel.js";
import Classroom from "../models/Classroom.js";
import LessonContent from "../models/LessonContent.js";
import Subject from "../models/Subject.js";
import { createCourseDocument } from "../services/documents/createCourseDocument.js";
import {
  canAccessCourse,
  getRequestTenantId,
  isAdminLike,
  isTeacherLike,
  isValidObjectId,
  serializeCourse,
  toId,
} from "../utils/academicContract.js";

const CONTENT_TYPES = new Set(["document", "link", "video", "embed", "text"]);
const MODULE_STATUSES = new Set(["draft", "published"]);

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

function roleCanEdit(req) {
  return isTeacherLike(req) || isAdminLike(req);
}

async function getCourseForLessons(courseId) {
  if (!isValidObjectId(courseId)) return null;
  return Course.findById(courseId).select(
    "_id tenantId createdBy deleted title subjectId classroomId",
  );
}

async function validateLessonRelations({ tenantId, subjectId, classroomId }) {
  if (subjectId) {
    const subject = await Subject.findOne({
      _id: subjectId,
      tenantId,
      deleted: false,
    }).lean();
    if (!subject) throw new Error("Invalid subjectId for this tenant");
  }

  if (classroomId) {
    const classroom = await Classroom.findOne({
      _id: classroomId,
      tenantId,
      deletedAt: null,
    }).lean();
    if (!classroom) throw new Error("Invalid classroomId for this tenant");
  }
}

async function getNextModulePosition(courseId) {
  const row = await CourseSection.findOne({ courseId, deleted: false })
    .sort({ position: -1 })
    .select("position")
    .lean();
  return Number(row?.position || 0) + 1;
}

async function getNextContentPosition(sectionId) {
  const row = await LessonContent.findOne({ sectionId, deleted: false })
    .sort({ position: -1 })
    .select("position")
    .lean();
  return Number(row?.position || 0) + 1;
}

function serializeLessonItem(item) {
  const plain = item?.toObject ? item.toObject() : { ...(item || {}) };
  const documentId = toId(plain.documentId);

  return {
    ...plain,
    documentId,
    courseId: toId(plain.courseId),
    sectionId: toId(plain.sectionId),
    subjectId: toId(plain.subjectId),
    classroomId: toId(plain.classroomId),
    previewUrl: documentId ? `/api/documents/preview/${documentId}` : null,
    downloadUrl:
      plain.downloadable && documentId ? `/api/documents/download/${documentId}` : null,
  };
}

function serializeModule(module, items = []) {
  const plain = module?.toObject ? module.toObject() : { ...(module || {}) };
  return {
    ...plain,
    courseId: toId(plain.courseId),
    createdBy: toId(plain.createdBy),
    subjectId: toId(plain.subjectId),
    classroomId: toId(plain.classroomId),
    items: items.map((item) => serializeLessonItem(item)),
  };
}

async function loadCourseLessons(courseId, includeDraft = false) {
  const sectionFilter = { courseId, deleted: false };
  const contentFilter = { courseId, deleted: false };

  if (!includeDraft) {
    sectionFilter.status = "published";
    contentFilter.status = "published";
  }

  const [sections, content] = await Promise.all([
    CourseSection.find(sectionFilter).sort({ position: 1, createdAt: 1 }).lean(),
    LessonContent.find(contentFilter)
      .populate("documentId", "name type size")
      .sort({ position: 1, createdAt: 1 })
      .lean(),
  ]);

  const grouped = content.reduce((acc, item) => {
    const key = toId(item.sectionId);
    if (!key) return acc;
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(item);
    return acc;
  }, new Map());

  return sections.map((section) =>
    serializeModule(section, grouped.get(toId(section._id)) || []),
  );
}

export async function listCourseLessons(req, res) {
  try {
    const { courseId } = req.params;
    const course = await getCourseForLessons(courseId);
    if (!course || course.deleted) {
      return res.status(404).json({ message: "Course not found" });
    }

    const allowed = await canAccessCourse({ course, req });
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed to access this course" });
    }

    const modules = await loadCourseLessons(courseId, roleCanEdit(req));
    return res.json({
      course: serializeCourse(course),
      modules,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load lessons",
      error: error.message,
    });
  }
}

export async function createModule(req, res) {
  try {
    if (!roleCanEdit(req)) {
      return res.status(403).json({ message: "Only teachers and admins can create modules" });
    }

    const { courseId } = req.params;
    const course = await getCourseForLessons(courseId);
    if (!course || course.deleted) {
      return res.status(404).json({ message: "Course not found" });
    }

    const allowed = await canAccessCourse({ course, req });
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed to manage this course" });
    }

    const title = String(req.body.title || "").trim();
    if (!title) {
      return res.status(400).json({ message: "Module title is required" });
    }

    const tenantId = getRequestTenantId(req) || course.tenantId || null;
    const subjectId = req.body.subjectId || course.subjectId || null;
    const classroomId = req.body.classroomId || course.classroomId || null;
    await validateLessonRelations({ tenantId, subjectId, classroomId });

    const module = await CourseSection.create({
      tenantId,
      courseId,
      title,
      summary: String(req.body.summary || "").trim(),
      position:
        Number(req.body.position) > 0
          ? Number(req.body.position)
          : await getNextModulePosition(courseId),
      status: MODULE_STATUSES.has(String(req.body.status || "").trim())
        ? String(req.body.status).trim()
        : "published",
      createdBy: req.user._id,
      subjectId: isValidObjectId(subjectId) ? subjectId : null,
      classroomId: isValidObjectId(classroomId) ? classroomId : null,
      deleted: false,
      deletedAt: null,
    });

    return res.status(201).json({
      message: "Module created",
      module: serializeModule(module, []),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create module",
      error: error.message,
    });
  }
}

export async function updateModule(req, res) {
  try {
    if (!roleCanEdit(req)) {
      return res.status(403).json({ message: "Only teachers and admins can update modules" });
    }

    const { moduleId } = req.params;
    if (!isValidObjectId(moduleId)) {
      return res.status(400).json({ message: "Invalid module id" });
    }

    const module = await CourseSection.findOne({ _id: moduleId, deleted: false });
    if (!module) {
      return res.status(404).json({ message: "Module not found" });
    }

    const course = await getCourseForLessons(module.courseId);
    if (!course || course.deleted) {
      return res.status(404).json({ message: "Course not found" });
    }

    const allowed = await canAccessCourse({ course, req });
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed to manage this course" });
    }

    const nextTitle = String(req.body.title || module.title).trim();
    if (!nextTitle) {
      return res.status(400).json({ message: "Module title is required" });
    }

    const tenantId = getRequestTenantId(req) || course.tenantId || null;
    const subjectId = req.body.subjectId || module.subjectId || course.subjectId || null;
    const classroomId =
      req.body.classroomId || module.classroomId || course.classroomId || null;
    await validateLessonRelations({ tenantId, subjectId, classroomId });

    module.title = nextTitle;
    module.summary = String(req.body.summary ?? module.summary ?? "").trim();
    if (req.body.position !== undefined && Number(req.body.position) > 0) {
      module.position = Number(req.body.position);
    }
    if (req.body.status && MODULE_STATUSES.has(String(req.body.status).trim())) {
      module.status = String(req.body.status).trim();
    }
    module.subjectId = isValidObjectId(subjectId) ? subjectId : null;
    module.classroomId = isValidObjectId(classroomId) ? classroomId : null;
    await module.save();

    const items = await LessonContent.find({
      sectionId: module._id,
      deleted: false,
    })
      .populate("documentId", "name type size")
      .sort({ position: 1, createdAt: 1 });

    return res.json({
      message: "Module updated",
      module: serializeModule(module, items),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update module",
      error: error.message,
    });
  }
}

export async function deleteModule(req, res) {
  try {
    if (!roleCanEdit(req)) {
      return res.status(403).json({ message: "Only teachers and admins can delete modules" });
    }

    const { moduleId } = req.params;
    if (!isValidObjectId(moduleId)) {
      return res.status(400).json({ message: "Invalid module id" });
    }

    const module = await CourseSection.findOne({ _id: moduleId, deleted: false });
    if (!module) {
      return res.status(404).json({ message: "Module not found" });
    }

    const course = await getCourseForLessons(module.courseId);
    if (!course || course.deleted) {
      return res.status(404).json({ message: "Course not found" });
    }

    const allowed = await canAccessCourse({ course, req });
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed to manage this course" });
    }

    module.deleted = true;
    module.deletedAt = new Date();
    await module.save();

    await LessonContent.updateMany(
      { sectionId: module._id, deleted: false },
      { $set: { deleted: true, deletedAt: new Date() } },
    );

    return res.json({ message: "Module deleted" });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete module",
      error: error.message,
    });
  }
}

export async function createLessonContent(req, res) {
  try {
    if (!roleCanEdit(req)) {
      return res.status(403).json({ message: "Only teachers and admins can add lesson content" });
    }

    const { moduleId } = req.params;
    if (!isValidObjectId(moduleId)) {
      return res.status(400).json({ message: "Invalid module id" });
    }

    const module = await CourseSection.findOne({ _id: moduleId, deleted: false });
    if (!module) {
      return res.status(404).json({ message: "Module not found" });
    }

    const course = await getCourseForLessons(module.courseId);
    if (!course || course.deleted) {
      return res.status(404).json({ message: "Course not found" });
    }

    const allowed = await canAccessCourse({ course, req });
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed to manage this course" });
    }

    const title = String(req.body.title || "").trim();
    if (!title) {
      return res.status(400).json({ message: "Lesson content title is required" });
    }

    const requestedType = String(req.body.contentType || "").trim().toLowerCase();
    const contentType = req.file
      ? "document"
      : CONTENT_TYPES.has(requestedType)
        ? requestedType
        : "";

    if (!contentType) {
      return res.status(400).json({
        message: "contentType must be one of document, link, video, embed, or text",
      });
    }

    const description = String(req.body.description || "").trim();
    const url = String(req.body.url || "").trim();
    const textContent = String(req.body.textContent || "").trim();

    if (contentType === "document" && !req.file) {
      return res.status(400).json({ message: "A document file is required for document content" });
    }

    if (["link", "video", "embed"].includes(contentType) && !isHttpUrl(url)) {
      return res.status(400).json({ message: "A valid http(s) URL is required" });
    }

    if (contentType === "text" && !textContent) {
      return res.status(400).json({ message: "textContent is required for text lesson content" });
    }

    const tenantId = getRequestTenantId(req) || course.tenantId || null;
    const subjectId = module.subjectId || course.subjectId || null;
    const classroomId = module.classroomId || course.classroomId || null;

    let document = null;
    if (req.file) {
      document = await createCourseDocument({
        file: req.file,
        courseId: course._id,
        userId: req.user._id,
        description,
        tags: ["lesson-content", title],
      });

      await CourseActivity.create({
        type: "resource",
        userId: req.user._id,
        documentId: document._id,
        courseId: course._id,
        sectionId: module._id,
        visibility: true,
        meta: { title, contentType: "document" },
      });
    }

    const content = await LessonContent.create({
      tenantId,
      courseId: course._id,
      sectionId: module._id,
      subjectId: isValidObjectId(subjectId) ? subjectId : null,
      classroomId: isValidObjectId(classroomId) ? classroomId : null,
      title,
      description,
      contentType,
      documentId: document?._id || null,
      url: ["link", "video", "embed"].includes(contentType) ? url : "",
      textContent: contentType === "text" ? textContent : "",
      position:
        Number(req.body.position) > 0
          ? Number(req.body.position)
          : await getNextContentPosition(module._id),
      status: MODULE_STATUSES.has(String(req.body.status || "").trim())
        ? String(req.body.status).trim()
        : "published",
      downloadable:
        req.body.downloadable !== undefined
          ? String(req.body.downloadable).toLowerCase() !== "false"
          : contentType === "document",
      createdBy: req.user._id,
      deleted: false,
      deletedAt: null,
    });

    const freshContent = await LessonContent.findById(content._id)
      .populate("documentId", "name type size")
      .lean();

    return res.status(201).json({
      message: "Lesson content created",
      content: serializeLessonItem(freshContent),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create lesson content",
      error: error.message,
    });
  }
}

export async function updateLessonContent(req, res) {
  try {
    if (!roleCanEdit(req)) {
      return res.status(403).json({ message: "Only teachers and admins can update lesson content" });
    }

    const { contentId } = req.params;
    if (!isValidObjectId(contentId)) {
      return res.status(400).json({ message: "Invalid content id" });
    }

    const content = await LessonContent.findOne({ _id: contentId, deleted: false });
    if (!content) {
      return res.status(404).json({ message: "Lesson content not found" });
    }

    const course = await getCourseForLessons(content.courseId);
    if (!course || course.deleted) {
      return res.status(404).json({ message: "Course not found" });
    }

    const allowed = await canAccessCourse({ course, req });
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed to manage this course" });
    }

    const nextTitle = String(req.body.title || content.title).trim();
    if (!nextTitle) {
      return res.status(400).json({ message: "Lesson content title is required" });
    }

    if (req.body.url !== undefined) {
      const nextUrl = String(req.body.url || "").trim();
      if (["link", "video", "embed"].includes(content.contentType) && !isHttpUrl(nextUrl)) {
        return res.status(400).json({ message: "A valid http(s) URL is required" });
      }
      content.url = nextUrl;
    }

    if (req.body.textContent !== undefined) {
      const nextText = String(req.body.textContent || "").trim();
      if (content.contentType === "text" && !nextText) {
        return res.status(400).json({ message: "textContent is required for text lesson content" });
      }
      content.textContent = nextText;
    }

    content.title = nextTitle;
    if (req.body.description !== undefined) {
      content.description = String(req.body.description || "").trim();
    }
    if (req.body.position !== undefined && Number(req.body.position) > 0) {
      content.position = Number(req.body.position);
    }
    if (req.body.status && MODULE_STATUSES.has(String(req.body.status).trim())) {
      content.status = String(req.body.status).trim();
    }
    if (req.body.downloadable !== undefined) {
      content.downloadable = String(req.body.downloadable).toLowerCase() !== "false";
    }
    await content.save();

    const freshContent = await LessonContent.findById(content._id)
      .populate("documentId", "name type size")
      .lean();

    return res.json({
      message: "Lesson content updated",
      content: serializeLessonItem(freshContent),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update lesson content",
      error: error.message,
    });
  }
}

export async function deleteLessonContent(req, res) {
  try {
    if (!roleCanEdit(req)) {
      return res.status(403).json({ message: "Only teachers and admins can delete lesson content" });
    }

    const { contentId } = req.params;
    if (!isValidObjectId(contentId)) {
      return res.status(400).json({ message: "Invalid content id" });
    }

    const content = await LessonContent.findOne({ _id: contentId, deleted: false });
    if (!content) {
      return res.status(404).json({ message: "Lesson content not found" });
    }

    const course = await getCourseForLessons(content.courseId);
    if (!course || course.deleted) {
      return res.status(404).json({ message: "Course not found" });
    }

    const allowed = await canAccessCourse({ course, req });
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed to manage this course" });
    }

    content.deleted = true;
    content.deletedAt = new Date();
    await content.save();

    return res.json({ message: "Lesson content deleted" });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete lesson content",
      error: error.message,
    });
  }
}
