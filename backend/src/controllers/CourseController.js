import Course from "../models/CourseModel.js";
import CourseMember from "../models/CourseMember.js";
import CourseSection from "../models/CourseSectionModel.js";
import CourseActivity from "../models/CourseActivityModel.js";
import Assignment from "../models/Assignment.js";
import AssignmentAssignment from "../models/AssignmentAssignment.js";
import Submission from "../models/Submission.js";
import Quiz from "../models/quiz.js";
import {
  buildActorFromRequest,
  emitRealtimeEvent,
} from "../socket/emitter.js";
import {
  buildTargetRows,
  buildTenantMatch,
  canAccessCourse,
  getRequestTenantId,
  getStudentAcademicContext,
  hasStudentTargetAccess,
  isAdminLike,
  isTeacherLike,
  isValidObjectId,
  makePagination,
  serializeAssignment,
  serializeCourse,
  serializeSubmission,
  serializeQuiz,
  toId,
  userFields,
} from "../utils/academicContract.js";

const requestIdFromReq = (req) =>
  req.get?.("x-request-id") || req.headers?.["x-request-id"] || null;

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function getAccessibleCourseIdsForUser({ userId, tenantId }) {
  const [ownedRows, memberRows] = await Promise.all([
    Course.find({
      createdBy: userId,
      deleted: false,
      ...buildTenantMatch(tenantId),
    })
      .select("_id")
      .lean(),
    CourseMember.find({
      userId,
      status: "active",
    })
      .select("courseId")
      .lean(),
  ]);

  const ownedIds = ownedRows.map((row) => toId(row._id)).filter(Boolean);
  const memberIds = memberRows.map((row) => toId(row.courseId)).filter(Boolean);
  const candidateIds = Array.from(new Set([...ownedIds, ...memberIds]));

  if (!candidateIds.length) return [];

  const tenantCourses = await Course.find({
    _id: { $in: candidateIds },
    deleted: false,
    ...buildTenantMatch(tenantId),
  })
    .select("_id")
    .lean();

  return tenantCourses.map((row) => toId(row._id)).filter(Boolean);
}

async function loadCourseMembers(courseId) {
  const rows = await CourseMember.find({ courseId, status: "active" })
    .populate("userId", userFields)
    .sort({ joinedAt: 1 })
    .lean();

  return rows.map((row) => ({
    _id: row._id,
    role: row.role,
    status: row.status,
    joinedAt: row.joinedAt,
    user: row.userId || null,
  }));
}

async function loadCourseBundle(courseId, tenantId) {
  const courseMatch = { _id: courseId, deleted: false, ...buildTenantMatch(tenantId) };

  const [course, members, sections, assignments, quizzes, activities] =
    await Promise.all([
      Course.findOne(courseMatch).populate("createdBy", userFields).lean(),
      loadCourseMembers(courseId),
      CourseSection.find({ courseId, deleted: false })
        .sort({ position: 1, createdAt: 1 })
        .lean(),
      Assignment.find({
        workspace: courseId,
        deleted: false,
        ...buildTenantMatch(tenantId),
      })
        .populate("teacher", userFields)
        .populate("class", "name grade section")
        .sort({ dueDate: 1, createdAt: -1 })
        .lean(),
      Quiz.find({
        workspace: courseId,
        deleted: false,
        ...buildTenantMatch(tenantId),
      })
        .populate("teacher", userFields)
        .populate("class", "name grade section")
        .sort({ createdAt: -1 })
        .lean(),
      CourseActivity.find({
        courseId,
        deleted: false,
        visibility: true,
      })
        .populate("userId", userFields)
        .populate("assignmentId", "title dueDate status")
        .populate("quizId", "title status")
        .populate("documentId", "title originalName")
        .sort({ createdAt: -1 })
        .limit(25)
        .lean(),
    ]);

  if (!course) return null;

  return serializeCourse(course, {
    members,
    sections,
    assignments: assignments.map((assignment) => serializeAssignment(assignment)),
    quizzes: quizzes.map((quiz) => serializeQuiz(quiz)),
    activities,
  });
}

async function listCoursesForUser({ req, userId, page, limit, query, publicOnly = false }) {
  const tenantId = getRequestTenantId(req);
  const { page: safePage, limit: safeLimit, skip } = makePagination(page, limit);

  const filter = {
    deleted: false,
    ...buildTenantMatch(tenantId),
  };

  if (publicOnly) {
    filter.visibility = "public";
    filter.archived = { $ne: true };
  } else if (!isAdminLike(req)) {
    const accessibleIds = await getAccessibleCourseIdsForUser({ userId, tenantId });
    filter._id = { $in: accessibleIds.length ? accessibleIds : [] };
  }

  if (query) {
    const safe = escapeRegex(query);
    filter.$or = [
      { title: { $regex: safe, $options: "i" } },
      { description: { $regex: safe, $options: "i" } },
      { code: { $regex: safe, $options: "i" } },
    ];
  }

  const [total, courses] = await Promise.all([
    Course.countDocuments(filter),
    Course.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate("createdBy", userFields)
      .lean(),
  ]);

  return {
    page: safePage,
    limit: safeLimit,
    total,
    pages: Math.ceil(total / safeLimit),
    courses: courses.map((course) => serializeCourse(course)),
  };
}

export const getCourseById = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid courseId" });
    }

    const course = await Course.findById(courseId).select(
      "_id createdBy deleted tenantId",
    );
    const allowed = await canAccessCourse({ course, req });

    if (!allowed) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const bundle = await loadCourseBundle(courseId, getRequestTenantId(req));
    if (!bundle) {
      return res.status(404).json({ message: "Course not found" });
    }

    return res.json(bundle);
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Failed to fetch course", error: err.message });
  }
};

export const createCourse = async (req, res) => {
  try {
    if (!isTeacherLike(req)) {
      return res
        .status(403)
        .json({ message: "Only teachers, admins, and superadmins can create courses." });
    }

    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const shortName = String(req.body.shortName || "").trim();
    const visibility = req.body.visibility === "public" ? "public" : "private";

    if (!title) {
      return res.status(400).json({ message: "title is required" });
    }

    const tenantId = getRequestTenantId(req);
    const course = await Course.create({
      title,
      description,
      shortName,
      visibility,
      tenantId,
      createdBy: req.user._id,
      type: "course",
    });

    await CourseMember.findOneAndUpdate(
      { courseId: course._id, userId: req.user._id },
      {
        $set: {
          role: normalizeCourseRole(req.user?.role),
          status: "active",
        },
        $setOnInsert: { joinedAt: new Date() },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const output = await Course.findById(course._id)
      .populate("createdBy", userFields)
      .lean();

    return res.status(201).json(serializeCourse(output));
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Failed to create course", error: err.message });
  }
};

function normalizeCourseRole(role) {
  return String(role || "").trim().toUpperCase() === "TEACHER"
    ? "teacher"
    : "admin";
}

export const assignToCourse = async (req, res) => {
  try {
    if (!isTeacherLike(req)) {
      return res
        .status(403)
        .json({ message: "Only teachers, admins, and superadmins can assign course work." });
    }

    const { courseId } = req.params;
    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid courseId" });
    }

    const course = await Course.findById(courseId).select(
      "_id createdBy deleted tenantId",
    );
    if (!course || course.deleted) {
      return res.status(404).json({ message: "Course not found" });
    }

    const allowed = await canAccessCourse({ course, req });
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const instructions = String(req.body.instructions || "").trim();
    const dueDateValue = req.body.dueDate ? new Date(req.body.dueDate) : null;
    const classroomId = req.body.classroomId || req.body.classId || null;
    const studentIds =
      req.body.studentIds ||
      req.body.assignToStudentIds ||
      req.body.assignedStudents ||
      [];

    if (!title || !description || !dueDateValue || Number.isNaN(dueDateValue.getTime())) {
      return res.status(400).json({
        message: "title, description, and a valid dueDate are required",
      });
    }

    const assignment = await Assignment.create({
      tenantId: getRequestTenantId(req) || course.tenantId || null,
      title,
      description,
      instructions,
      dueDate: dueDateValue,
      teacher: req.user._id,
      workspace: courseId,
      class: isValidObjectId(classroomId) ? classroomId : null,
      type: req.body.type || "text_submission",
      maxScore: Number(req.body.maxScore || 100),
      allowedFileTypes: Array.isArray(req.body.allowedFileTypes)
        ? req.body.allowedFileTypes
        : [],
      maxFileSize: Number(req.body.maxFileSize || 10),
      maxFiles: Number(req.body.maxFiles || 5),
      status:
        req.body.status && ["draft", "published", "closed"].includes(req.body.status)
          ? req.body.status
          : "published",
      materials: Array.isArray(req.body.materials) ? req.body.materials : [],
    });

    const targetRows = buildTargetRows({
      key: "assignmentId",
      ownerId: assignment._id,
      courseId,
      classroomId,
      studentIds,
      dueDate: dueDateValue,
      tenantId: getRequestTenantId(req) || course.tenantId || null,
    });

    if (targetRows.length) {
      await AssignmentAssignment.insertMany(targetRows, { ordered: false });
    }

    const requestedSectionId = req.body.sectionId;
    const sectionId =
      requestedSectionId &&
      isValidObjectId(requestedSectionId) &&
      (await CourseSection.exists({
        _id: requestedSectionId,
        courseId,
        deleted: false,
      }))
        ? requestedSectionId
        : null;

    await CourseActivity.create({
      type: "assignment",
      userId: req.user._id,
      assignmentId: assignment._id,
      courseId,
      sectionId,
      visibility: true,
    });

    const output = await Assignment.findById(assignment._id)
      .populate("teacher", userFields)
      .populate("class", "name grade section")
      .lean();

    return res.status(201).json({
      success: true,
      message: "Assignment created",
      assignment: serializeAssignment(output),
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to assign", error: err.message });
  }
};

export const addActivityToSection = async (req, res) => {
  try {
    if (!isTeacherLike(req)) {
      return res
        .status(403)
        .json({ message: "Only teachers, admins, and superadmins can add activities." });
    }

    const { courseId, sectionId } = req.params;
    if (!isValidObjectId(courseId) || !isValidObjectId(sectionId)) {
      return res.status(400).json({ message: "Invalid courseId/sectionId" });
    }

    const course = await Course.findById(courseId).select(
      "_id createdBy deleted tenantId",
    );
    if (!course || course.deleted) {
      return res.status(404).json({ message: "Course not found" });
    }

    const allowed = await canAccessCourse({ course, req });
    if (!allowed) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const section = await CourseSection.findOne({
      _id: sectionId,
      courseId,
      deleted: false,
    });
    if (!section) {
      return res.status(404).json({ message: "Section not found" });
    }

    const type = String(req.body.type || "").trim();
    const assignmentId = req.body.assignmentId || req.body.assignment || null;
    const quizId = req.body.quizId || req.body.quiz || null;
    const documentId = req.body.documentId || req.body.document || null;

    if (!["assignment", "quiz", "resource"].includes(type)) {
      return res.status(400).json({ message: "Unsupported activity type" });
    }

    const activity = await CourseActivity.create({
      type,
      userId: req.user._id,
      assignmentId: isValidObjectId(assignmentId) ? assignmentId : null,
      quizId: isValidObjectId(quizId) ? quizId : null,
      documentId: isValidObjectId(documentId) ? documentId : null,
      courseId,
      sectionId,
      visibility: req.body.visibility !== false,
      meta:
        req.body.meta && typeof req.body.meta === "object" ? req.body.meta : {},
    });

    return res.status(201).json({
      success: true,
      message: "Activity added",
      activity,
    });
  } catch (err) {
    return res
      .status(500)
      .json({ message: "Failed to add activity", error: err.message });
  }
};

export const searchCourses = async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);
    const tenantId = getRequestTenantId(req);

    const filter = {
      deleted: false,
      ...buildTenantMatch(tenantId),
    };

    if (!isAdminLike(req)) {
      const accessibleIds = await getAccessibleCourseIdsForUser({
        userId: req.user._id,
        tenantId,
      });
      filter._id = { $in: accessibleIds.length ? accessibleIds : [] };
    }

    if (q) {
      filter.$or = [
        { title: { $regex: escapeRegex(q), $options: "i" } },
        { description: { $regex: escapeRegex(q), $options: "i" } },
        { code: { $regex: escapeRegex(q), $options: "i" } },
      ];
    }

    const results = await Course.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(limit)
      .populate("createdBy", userFields)
      .lean();

    return res.json(results.map((course) => serializeCourse(course)));
  } catch (error) {
    return res.status(500).json({ message: "Failed to search", error: error.message });
  }
};

export const getCourseActivity = async (req, res) => {
  try {
    const { courseId } = req.params;
    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid courseId" });
    }

    const course = await Course.findById(courseId).select(
      "_id createdBy deleted tenantId",
    );
    const allowed = await canAccessCourse({ course, req });

    if (!allowed) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const tenantId = getRequestTenantId(req);
    const [totalAssignments, totalQuizzes, totalSubmissions, recentActivity] =
      await Promise.all([
        Assignment.countDocuments({
          workspace: courseId,
          deleted: false,
          ...buildTenantMatch(tenantId),
        }),
        Quiz.countDocuments({
          workspace: courseId,
          deleted: false,
          ...buildTenantMatch(tenantId),
        }),
        Submission.countDocuments({
          workspaceId: courseId,
          deleted: false,
          ...buildTenantMatch(tenantId),
        }),
        CourseActivity.find({
          courseId,
          deleted: false,
          visibility: true,
        })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
      ]);

    return res.json({
      courseId,
      totalAssignments,
      totalQuizzes,
      totalSubmissions,
      recentActivity,
      lastUpdated: new Date(),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch activity", error: error.message });
  }
};

export const setCourseArchived = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course || course.deleted) {
      return res.status(404).json({ message: "Course not found" });
    }

    const allowed = await canAccessCourse({ course, req });
    if (!allowed || !isTeacherLike(req)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    course.archived = !!req.body.archived;
    await course.save();

    return res.json({
      message: `Course ${course.archived ? "archived" : "unarchived"} successfully`,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to update archive", error: error.message });
  }
};

export const getCoursesByUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    if (!isAdminLike(req) && String(req.user._id) !== String(userId)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const tenantId = getRequestTenantId(req);
    const courseIds = await getAccessibleCourseIdsForUser({ userId, tenantId });

    const courses = await Course.find({
      _id: { $in: courseIds.length ? courseIds : [] },
      deleted: false,
      ...buildTenantMatch(tenantId),
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .populate("createdBy", userFields)
      .lean();

    return res.json(courses.map((course) => serializeCourse(course)));
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch courses", error: error.message });
  }
};

export const deleteCourse = async (req, res) => {
  try {
    if (!isAdminLike(req)) {
      return res.status(403).json({ message: "Only admins can delete courses" });
    }

    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ message: "Not found" });
    }

    course.deleted = true;
    course.deletedAt = new Date();
    await course.save();

    return res.json({ success: true, message: "Course deleted", course });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete", error: error.message });
  }
};

export const getAllCourses = async (req, res) => {
  try {
    const out = await listCoursesForUser({
      req,
      userId: req.user._id,
      page: req.query.page,
      limit: req.query.limit,
      query: req.query.q,
    });

    return res.json(out);
  } catch (err) {
    return res.status(500).json({
      message: "Failed to fetch courses",
      error: err.message,
    });
  }
};

export const getMyCoursesList = async (req, res) => {
  try {
    const out = await listCoursesForUser({
      req,
      userId: req.user._id,
      page: req.query.page,
      limit: req.query.limit,
      query: req.query.q,
    });

    return res.json(out);
  } catch (err) {
    return res.status(500).json({
      message: "Failed to fetch my courses",
      error: err.message,
    });
  }
};

export const searchCoursesList = async (req, res) => {
  try {
    const out = await listCoursesForUser({
      req,
      userId: req.user._id,
      page: req.query.page,
      limit: req.query.limit,
      query: req.query.q,
    });

    return res.json(out);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to search courses",
      error: error.message,
    });
  }
};

export const getPublicCoursesList = async (req, res) => {
  try {
    const out = await listCoursesForUser({
      req,
      userId: req.user?._id || null,
      page: req.query.page,
      limit: req.query.limit,
      query: req.query.q,
      publicOnly: true,
    });

    return res.json(out);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch public courses",
      error: error.message,
    });
  }
};

export const submitAssignmentById = async (req, res) => {
  try {
    if (String(req.user?.role || "").trim().toUpperCase() !== "STUDENT") {
      return res.status(403).json({ message: "Only students can submit." });
    }

    const assignmentId = req.params.assignmentId;
    const routeCourseId = req.params.courseId || req.body.courseId || null;

    if (!isValidObjectId(assignmentId)) {
      return res.status(400).json({ message: "Invalid assignmentId" });
    }

    const assignment = await Assignment.findById(assignmentId).select(
      "_id tenantId teacher workspace class dueDate status deleted",
    );
    if (!assignment || assignment.deleted) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    if (assignment.status !== "published") {
      return res.status(400).json({ message: "Assignment is not available" });
    }

    if (assignment.dueDate && new Date(assignment.dueDate) < new Date()) {
      return res.status(400).json({ message: "Assignment due date has passed" });
    }

    const courseId = toId(assignment.workspace);
    if (!courseId || !isValidObjectId(courseId)) {
      return res
        .status(409)
        .json({ message: "Assignment is missing a valid course relationship" });
    }

    if (routeCourseId && String(routeCourseId) !== String(courseId)) {
      return res.status(400).json({ message: "assignmentId does not belong to the courseId route" });
    }

    const tenantId = getRequestTenantId(req) || assignment.tenantId || null;
    const context = await getStudentAcademicContext(req.user._id, tenantId);

    if (!context.courseIds.includes(String(courseId))) {
      return res.status(403).json({ message: "Not enrolled in this course" });
    }

    const hasAccess = await hasStudentTargetAccess({
      TargetModel: AssignmentAssignment,
      key: "assignmentId",
      ownerId: assignment._id,
      studentId: req.user._id,
      courseId,
      classroomIds: context.classroomIds,
      tenantId,
    });

    if (!hasAccess) {
      return res.status(403).json({ message: "Assignment is not assigned to this student" });
    }

    const files = (req.files || []).map((file) => ({
      name: file.originalname,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size,
    }));

    const submission = await Submission.findOneAndUpdate(
      {
        assignmentId: assignment._id,
        studentId: req.user._id,
        workspaceId: courseId,
      },
      {
        $set: {
          tenantId,
          workspaceId: courseId,
          assignmentId: assignment._id,
          studentId: req.user._id,
          teacherId: assignment.teacher || null,
          classroomId: assignment.class || null,
          files,
          answers: req.body.answers ?? null,
          textSubmission: String(req.body.textSubmission || "").trim(),
          submittedAt: new Date(),
          gradingStatus: "submitted",
          gradedBy: "NONE",
          deleted: false,
          deletedAt: null,
        },
        $setOnInsert: {
          grade: null,
          score: 0,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    const requestId = requestIdFromReq(req);
    const studentUserId = toId(req.user._id);
    const teacherUserId = toId(assignment.teacher);
    const classroomId = toId(assignment.class);

    emitRealtimeEvent({
      type: "submission",
      status: "success",
      requestId,
      entityType: "submission",
      entityId: submission._id,
      message: "Assignment submission received. Your teacher will review it shortly.",
      actor: buildActorFromRequest(req),
      targets: {
        userIds: [studentUserId],
        studentIds: [studentUserId],
        teacherIds: teacherUserId ? [teacherUserId] : [],
      },
      meta: {
        assignmentId: toId(assignment._id),
        courseId,
        classroomId,
        teacherId: teacherUserId,
        gradingStatus: "submitted",
      },
    });

    emitRealtimeEvent({
      type: "teacher_review",
      status: "updated",
      requestId,
      entityType: "submission",
      entityId: submission._id,
      message: "A new assignment submission is ready for teacher review.",
      actor: buildActorFromRequest(req),
      targets: {
        teacherIds: teacherUserId ? [teacherUserId] : [],
      },
      meta: {
        action: "submitted",
        assignmentId: toId(assignment._id),
        studentId: studentUserId,
        courseId,
        classroomId,
      },
    });

    return res.json({
      success: true,
      message: "Submission uploaded",
      submission: serializeSubmission(submission),
    });
  } catch (err) {
    emitRealtimeEvent({
      type: "submission",
      status: "failed",
      requestId: requestIdFromReq(req),
      entityType: "submission",
      entityId: req.params?.assignmentId || null,
      message: "Assignment submission failed. Please try again.",
      actor: buildActorFromRequest(req),
      targets: {
        userIds: req.user?._id ? [String(req.user._id)] : [],
        studentIds: req.user?._id ? [String(req.user._id)] : [],
      },
      meta: {
        assignmentId: req.params?.assignmentId || null,
        courseId: req.params?.courseId || req.body?.courseId || null,
      },
    });
    return res.status(500).json({
      message: "Failed to upload",
      error: err.message,
    });
  }
};

export const getSubmissionsForCourse = async (req, res) => {
  try {
    if (!isTeacherLike(req)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const { courseId } = req.params;
    if (!isValidObjectId(courseId)) {
      return res.status(400).json({ message: "Invalid courseId" });
    }

    const course = await Course.findById(courseId).select(
      "_id createdBy deleted tenantId",
    );
    const allowed = await canAccessCourse({ course, req });

    if (!allowed) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const { page, limit, skip } = makePagination(req.query.page, req.query.limit);
    const tenantId = getRequestTenantId(req);
    const filter = {
      workspaceId: courseId,
      deleted: false,
      ...buildTenantMatch(tenantId),
    };

    const [total, submissions] = await Promise.all([
      Submission.countDocuments(filter),
      Submission.find(filter)
        .sort({ submittedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("studentId", userFields)
        .populate("assignmentId", "title dueDate status")
        .lean(),
    ]);

    return res.json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      submissions: submissions.map((submission) =>
        serializeSubmission(submission),
      ),
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to fetch submissions",
      error: err.message,
    });
  }
};
