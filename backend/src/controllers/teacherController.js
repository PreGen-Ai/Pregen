import Assignment from "../models/Assignment.js";
import AssignmentAssignment from "../models/AssignmentAssignment.js";
import Submission from "../models/Submission.js";
import Quiz from "../models/quiz.js";
import QuizAssignment from "../models/QuizAssignment.js";
import QuizAttempt from "../models/QuizAttempt.js";
import Announcement from "../models/Announcement.js";
import LessonContent from "../models/LessonContent.js";
import Course from "../models/CourseModel.js";
import CourseActivity from "../models/CourseActivityModel.js";
import CourseSection from "../models/CourseSectionModel.js";
import CourseMember from "../models/CourseMember.js";
import Classroom from "../models/Classroom.js";
import User from "../models/userModel.js";
import {
  buildActorFromRequest,
  emitRealtimeEvent,
} from "../socket/emitter.js";
import {
  buildTargetRows,
  buildTenantMatch,
  canAccessCourse,
  getAccessibleCourseIdsForUser,
  isAdminLike,
  getRequestTenantId,
  isTeacherLike,
  isValidObjectId,
  serializeAssignment,
  serializeQuiz,
  serializeSubmission,
  serializeAttemptForUi,
  toId,
  userFields,
} from "../utils/academicContract.js";
import { GRADING_STATUS, normalizeReviewStatus } from "../services/gradingLifecycle.js";

const requestIdFromReq = (req) =>
  req.get?.("x-request-id") || req.headers?.["x-request-id"] || null;

const STATUS_VALUES = ["draft", "published", "closed"];
const QUIZ_TYPES = new Set([
  "multiple_choice",
  "true_false",
  "short_answer",
  "essay",
  "file_upload",
]);

const applyCursor = (filter, cursor) => {
  if (!cursor) return;

  const [createdAtStr, id] = String(cursor).split("|");
  const createdAt = new Date(createdAtStr);

  if (Number.isNaN(createdAt.getTime()) || !id) return;

  filter.$or = [
    { createdAt: { $lt: createdAt } },
    { createdAt, _id: { $lt: id } },
  ];
};

const makeNextCursor = (docs, limit) => {
  if (!docs || docs.length < limit) return null;
  const last = docs[docs.length - 1];
  return `${last.createdAt.toISOString()}|${last._id}`;
};

const normalizeStatus = (value, fallback = "draft") =>
  STATUS_VALUES.includes(String(value || "").trim().toLowerCase())
    ? String(value).trim().toLowerCase()
    : fallback;

const normalizeString = (value) => String(value || "").trim();

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const ensureTeacherRequest = (req, res) => {
  if (!isTeacherLike(req)) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return false;
  }
  return true;
};

async function ensureCourseAccess({ req, courseId }) {
  if (!courseId) {
    return { error: { status: 400, message: "courseId is required" } };
  }

  if (!isValidObjectId(courseId)) {
    return { error: { status: 400, message: "Invalid courseId" } };
  }

  const course = await Course.findById(courseId).select(
    "_id title createdBy deleted tenantId classroomId subjectId",
  );
  if (!course || course.deleted) {
    return { error: { status: 404, message: "Course not found" } };
  }

  const allowed = await canAccessCourse({ course, req });
  if (!allowed) {
    return { error: { status: 403, message: "Not allowed" } };
  }

  return { course };
}

async function validateTargeting({
  tenantId,
  course,
  classroomId = null,
  studentIds = [],
}) {
  const normalizedStudentIds = Array.from(
    new Set(
      (Array.isArray(studentIds) ? studentIds : [])
        .map((value) => (isValidObjectId(value) ? String(value) : null))
        .filter(Boolean),
    ),
  );

  let classroom = null;
  if (classroomId) {
    if (!isValidObjectId(classroomId)) {
      return { error: { status: 400, message: "Invalid classroomId" } };
    }

    classroom = await Classroom.findOne({
      _id: classroomId,
      tenantId,
      deletedAt: null,
    }).lean();

    if (!classroom) {
      return { error: { status: 404, message: "Classroom not found" } };
    }

    if (course?.classroomId && String(course.classroomId) !== String(classroomId)) {
      return {
        error: {
          status: 400,
          message: "Selected classroom does not belong to the target course",
        },
      };
    }
  }

  if (!normalizedStudentIds.length) {
    return {
      classroomId: classroom ? classroom._id : null,
      studentIds: [],
      classroom,
    };
  }

  const students = await User.find({
    _id: { $in: normalizedStudentIds },
    role: "STUDENT",
    tenantId,
    deleted: { $ne: true },
  })
    .select("_id")
    .lean();

  if (students.length !== normalizedStudentIds.length) {
    return {
      error: {
        status: 400,
        message: "One or more targeted students are invalid or outside this tenant",
      },
    };
  }

  const courseMemberships = await CourseMember.find({
    courseId: course._id,
    userId: { $in: normalizedStudentIds },
    role: "student",
    status: "active",
  })
    .select("userId")
    .lean();
  const memberIds = new Set(courseMemberships.map((row) => toId(row.userId)));

  if (memberIds.size !== normalizedStudentIds.length) {
    return {
      error: {
        status: 400,
        message: "All targeted students must be actively enrolled in the selected course",
      },
    };
  }

  if (classroom) {
    const classroomStudentIds = new Set(
      (classroom.studentIds || []).map((value) => toId(value)).filter(Boolean),
    );
    const outsideClassroom = normalizedStudentIds.filter(
      (studentId) => !classroomStudentIds.has(studentId),
    );
    if (outsideClassroom.length) {
      return {
        error: {
          status: 400,
          message: "All targeted students must belong to the selected classroom",
        },
      };
    }
  }

  return {
    classroomId: classroom ? classroom._id : null,
    studentIds: normalizedStudentIds,
    classroom,
  };
}

export const getCourseRoster = async (req, res) => {
  try {
    if (!ensureTeacherRequest(req, res)) return;

    const courseCheck = await ensureCourseAccess({
      req,
      courseId: req.params.courseId,
    });
    if (courseCheck?.error) {
      return res.status(courseCheck.error.status).json({
        success: false,
        message: courseCheck.error.message,
      });
    }

    const course = courseCheck.course;
    const [students, classroom] = await Promise.all([
      CourseMember.find({
        courseId: course._id,
        role: "student",
        status: "active",
      })
        .populate("userId", userFields)
        .lean(),
      course.classroomId
        ? Classroom.findById(course.classroomId).lean()
        : Promise.resolve(null),
    ]);

    return res.json({
      success: true,
      course: {
        _id: course._id,
        title: course.title,
        classroomId: toId(course.classroomId),
        subjectId: toId(course.subjectId),
      },
      classrooms: classroom ? [classroom] : [],
      students: students
        .map((membership) => membership.userId)
        .filter(Boolean),
    });
  } catch (err) {
    console.error("Get course roster error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to load course roster",
    });
  }
};

async function ensureAssignmentAccess({ assignmentId, req, withContent = false }) {
  if (!isValidObjectId(assignmentId)) {
    return { error: { status: 400, message: "Invalid assignmentId" } };
  }

  let query = Assignment.findById(assignmentId)
    .populate("teacher", userFields)
    .populate("class", "name grade section")
    .populate("workspace", "title name code classroomId subjectId");

  if (!withContent) {
    query = query.select("-submissions");
  }

  const assignment = await query;

  if (!assignment || assignment.deleted) {
    return { error: { status: 404, message: "Assignment not found" } };
  }

  const assignmentOwnerId = toId(
    assignment.teacherId || assignment.teacher || assignment.createdBy,
  );

  if (assignmentOwnerId !== String(req.user._id) && !isAdminLike(req)) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  const allowed = await canAccessCourse({
    courseId: toId(assignment.workspace),
    req,
  });
  if (!allowed) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  return { assignment };
}

async function ensureQuizAccess({ quizId, req }) {
  if (!isValidObjectId(quizId)) {
    return { error: { status: 400, message: "Invalid quizId" } };
  }

  const quiz = await Quiz.findById(quizId)
    .populate("teacher", userFields)
    .populate("class", "name grade section")
    .populate("workspace", "title name code classroomId subjectId");

  if (!quiz || quiz.deleted) {
    return { error: { status: 404, message: "Quiz not found" } };
  }

  const quizOwnerId = toId(quiz.teacherId || quiz.teacher || quiz.createdBy);

  if (quizOwnerId !== String(req.user._id) && !isAdminLike(req)) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  const allowed = await canAccessCourse({
    courseId: toId(quiz.workspace),
    req,
  });
  if (!allowed) {
    return { error: { status: 403, message: "Forbidden" } };
  }

  return { quiz };
}

async function resolveTargetStudentIds({
  targetRows,
  courseId = null,
  classroomId = null,
}) {
  const directStudentIds = new Set();
  const classIds = new Set();
  let includeCourseMembers = false;

  for (const row of targetRows || []) {
    const studentId = toId(row.studentId);
    const classId = toId(row.classId);
    const workspaceId = toId(row.workspaceId);

    if (studentId) directStudentIds.add(studentId);
    else if (classId) classIds.add(classId);
    else if (workspaceId || courseId) includeCourseMembers = true;
  }

  if (classroomId) classIds.add(String(classroomId));

  const [classrooms, memberships] = await Promise.all([
    classIds.size
      ? Classroom.find({
          _id: { $in: Array.from(classIds) },
          deletedAt: null,
        })
          .select("studentIds")
          .lean()
      : Promise.resolve([]),
    includeCourseMembers && courseId
      ? CourseMember.find({
          courseId,
          role: "student",
          status: "active",
        })
          .select("userId")
          .lean()
      : Promise.resolve([]),
  ]);

  for (const classroom of classrooms) {
    for (const studentId of classroom.studentIds || []) {
      const normalized = toId(studentId);
      if (normalized) directStudentIds.add(normalized);
    }
  }

  for (const membership of memberships) {
    const normalized = toId(membership.userId);
    if (normalized) directStudentIds.add(normalized);
  }

  return Array.from(directStudentIds);
}

function groupRowsByOwner(rows, key) {
  return rows.reduce((map, row) => {
    const ownerId = toId(row[key]);
    if (!ownerId) return map;
    const current = map.get(ownerId) || [];
    current.push(row);
    map.set(ownerId, current);
    return map;
  }, new Map());
}

function pickSelectedStudentIds(targetRows) {
  return Array.from(
    new Set(
      (targetRows || [])
        .map((row) => toId(row.studentId))
        .filter(Boolean),
    ),
  );
}

function summarizeSubmissionState({ targetStudentIds, studentWork }) {
  const submittedStudentIds = new Set(
    studentWork
      .map((row) => toId(row.studentId))
      .filter(Boolean),
  );

  return {
    targetedStudents: targetStudentIds.length,
    submitted: studentWork.length,
    graded: studentWork.filter(
      (row) => {
        const status = normalizeReviewStatus(
          row.gradingStatus || row.status,
          GRADING_STATUS.SUBMITTED,
        );
        return status === GRADING_STATUS.FINAL;
      },
    ).length,
    missing: Math.max(
      targetStudentIds.length - submittedStudentIds.size,
      0,
    ),
  };
}

function normalizeQuizQuestion(rawQuestion, index) {
  const questionType = String(
    rawQuestion?.questionType || rawQuestion?.type || "multiple_choice",
  )
    .trim()
    .toLowerCase();

  if (!QUIZ_TYPES.has(questionType)) {
    throw new Error(`Question ${index + 1} has an invalid type`);
  }

  const questionText = normalizeString(
    rawQuestion?.questionText || rawQuestion?.question,
  );
  if (!questionText) {
    throw new Error(`Question ${index + 1} is missing question text`);
  }

  const points = toPositiveNumber(
    rawQuestion?.points ?? rawQuestion?.max_score,
    questionType === "essay" ? 10 : 1,
  );

  let options = [];
  let correctAnswer = rawQuestion?.correctAnswer ?? rawQuestion?.correct_answer;

  if (questionType === "multiple_choice") {
    const rawOptions = Array.isArray(rawQuestion?.options)
      ? rawQuestion.options
      : [];

    options = rawOptions
      .map((option) =>
        typeof option === "string"
          ? { text: normalizeString(option), isCorrect: false }
          : {
              text: normalizeString(option?.text || option?.label || option),
              isCorrect: Boolean(option?.isCorrect),
            },
      )
      .filter((option) => option.text);

    if (options.length < 2) {
      throw new Error(
        `Question ${index + 1} needs at least two multiple-choice options`,
      );
    }

    if (correctAnswer === undefined || correctAnswer === null) {
      const firstCorrectIndex = options.findIndex((option) => option.isCorrect);
      correctAnswer =
        firstCorrectIndex >= 0
          ? String.fromCharCode(65 + firstCorrectIndex)
          : "A";
    }

    const normalizedCorrectAnswer = String(correctAnswer).trim().toUpperCase();
    const answerIndex = normalizedCorrectAnswer.charCodeAt(0) - 65;

    options = options.map((option, optionIndex) => ({
      text: option.text,
      isCorrect: optionIndex === answerIndex,
    }));

    correctAnswer = normalizedCorrectAnswer;
  } else if (questionType === "true_false") {
    correctAnswer =
      String(correctAnswer || "true").trim().toLowerCase() === "false"
        ? "false"
        : "true";
  } else {
    correctAnswer = normalizeString(
      correctAnswer || rawQuestion?.expected_answer || "",
    );
  }

  return {
    questionText,
    questionType,
    options,
    correctAnswer,
    difficulty: String(rawQuestion?.difficulty || "medium")
      .trim()
      .toLowerCase(),
    explanation: normalizeString(rawQuestion?.explanation || ""),
    points,
    fileUploadConfig: rawQuestion?.fileUploadConfig || {},
  };
}

export const createAssignment = async (req, res) => {
  try {
    if (!ensureTeacherRequest(req, res)) return;

    const title = normalizeString(req.body.title);
    const description = normalizeString(req.body.description);
    const instructions = normalizeString(req.body.instructions);
    const dueDateValue = req.body.dueDate ? new Date(req.body.dueDate) : null;
    const courseId = req.body.courseId || req.body.workspaceId || null;
    const classroomId = req.body.classroomId || req.body.classId || null;
    const tenantId = getRequestTenantId(req);

    if (
      !title ||
      !description ||
      !dueDateValue ||
      Number.isNaN(dueDateValue.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: "title, description, and a valid dueDate are required",
      });
    }
    if (dueDateValue <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "dueDate must be in the future",
      });
    }

    const courseCheck = await ensureCourseAccess({ req, courseId });
    if (courseCheck?.error) {
      return res.status(courseCheck.error.status).json({
        success: false,
        message: courseCheck.error.message,
      });
    }
    const targetValidation = await validateTargeting({
      tenantId: tenantId || courseCheck.course?.tenantId || null,
      course: courseCheck.course,
      classroomId,
      studentIds:
        req.body.studentIds ||
        req.body.assignToStudentIds ||
        req.body.assignedStudents ||
        [],
    });
    if (targetValidation?.error) {
      return res.status(targetValidation.error.status).json({
        success: false,
        message: targetValidation.error.message,
      });
    }

    const assignment = await Assignment.create({
      tenantId: tenantId || courseCheck.course?.tenantId || null,
      title,
      description,
      instructions,
      dueDate: dueDateValue,
      teacher: req.user._id,
      workspace: courseId,
      class: targetValidation.classroomId,
      type: req.body.type || "text_submission",
      maxScore: toPositiveNumber(req.body.maxScore, 100),
      allowedFileTypes: Array.isArray(req.body.allowedFileTypes)
        ? req.body.allowedFileTypes
        : [],
      maxFileSize: toPositiveNumber(req.body.maxFileSize, 10),
      maxFiles: toPositiveNumber(req.body.maxFiles, 5),
      status: normalizeStatus(req.body.status, "published"),
      materials: Array.isArray(req.body.materials) ? req.body.materials : [],
    });

    const targetRows = buildTargetRows({
      key: "assignmentId",
      ownerId: assignment._id,
      courseId,
      classroomId: targetValidation.classroomId,
      studentIds: targetValidation.studentIds,
      dueDate: dueDateValue,
      tenantId: tenantId || courseCheck.course?.tenantId || null,
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

    if (courseId) {
      await CourseActivity.create({
        type: "assignment",
        userId: req.user._id,
        assignmentId: assignment._id,
        courseId,
        sectionId,
        visibility: true,
      });
    }

    const output = await Assignment.findById(assignment._id)
      .populate("teacher", userFields)
      .populate("class", "name grade section")
      .populate("workspace", "title name code classroomId subjectId")
      .lean();

    if (assignment.status === "published") {
      const targetStudentIds = await resolveTargetStudentIds({
        targetRows,
        courseId,
        classroomId: targetValidation.classroomId,
      });

      emitRealtimeEvent({
        type: "assignment_publish",
        status: "success",
        requestId: requestIdFromReq(req),
        entityType: "assignment",
        entityId: assignment._id,
        message: `${assignment.title} is now available.`,
        actor: buildActorFromRequest(req),
        targets: {
          studentIds: targetStudentIds,
        },
        meta: {
          action: "assignment_published",
          assignmentId: toId(assignment._id),
          courseId: toId(courseId),
          classroomId: toId(classroomId),
          dueDate: assignment.dueDate,
        },
      });
    }

    return res.status(201).json({
      success: true,
      data: serializeAssignment(output),
      message: "Assignment created successfully",
    });
  } catch (err) {
    console.error("Create assignment error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to create assignment",
    });
  }
};

export const updateAssignment = async (req, res) => {
  try {
    if (!ensureTeacherRequest(req, res)) return;

    const found = await ensureAssignmentAccess({
      assignmentId: req.params.assignmentId,
      req,
    });
    if (found?.error) {
      return res.status(found.error.status).json({
        success: false,
        message: found.error.message,
      });
    }

    const assignment = found.assignment;
    const nextCourseId =
      req.body.courseId !== undefined || req.body.workspaceId !== undefined
        ? req.body.courseId || req.body.workspaceId || null
        : toId(assignment.workspace);
    const nextClassroomId =
      req.body.classroomId !== undefined || req.body.classId !== undefined
        ? req.body.classroomId || req.body.classId || null
        : toId(assignment.class);

    const courseCheck = await ensureCourseAccess({ req, courseId: nextCourseId });
    if (courseCheck?.error) {
      return res.status(courseCheck.error.status).json({
        success: false,
        message: courseCheck.error.message,
      });
    }

    if (req.body.title !== undefined) assignment.title = normalizeString(req.body.title);
    if (req.body.description !== undefined) {
      assignment.description = normalizeString(req.body.description);
    }
    if (req.body.instructions !== undefined) {
      assignment.instructions = normalizeString(req.body.instructions);
    }
    if (req.body.dueDate !== undefined) {
      const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
      if (!dueDate || Number.isNaN(dueDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "A valid dueDate is required",
        });
      }
      if (dueDate <= new Date()) {
        return res.status(400).json({
          success: false,
          message: "dueDate must be in the future",
        });
      }
      assignment.dueDate = dueDate;
    }
    if (req.body.type !== undefined) assignment.type = req.body.type;
    if (req.body.maxScore !== undefined) {
      assignment.maxScore = toPositiveNumber(req.body.maxScore, assignment.maxScore);
    }
    if (req.body.maxFileSize !== undefined) {
      assignment.maxFileSize = toPositiveNumber(req.body.maxFileSize, assignment.maxFileSize);
    }
    if (req.body.maxFiles !== undefined) {
      assignment.maxFiles = toPositiveNumber(req.body.maxFiles, assignment.maxFiles);
    }
    if (req.body.allowedFileTypes !== undefined) {
      assignment.allowedFileTypes = Array.isArray(req.body.allowedFileTypes)
        ? req.body.allowedFileTypes
        : [];
    }
    if (req.body.materials !== undefined) {
      assignment.materials = Array.isArray(req.body.materials) ? req.body.materials : [];
    }
    if (req.body.status !== undefined) {
      assignment.status = normalizeStatus(req.body.status, assignment.status);
    }
    const targetValidation = await validateTargeting({
      tenantId: getRequestTenantId(req) || courseCheck.course?.tenantId || null,
      course: courseCheck.course,
      classroomId: nextClassroomId,
      studentIds:
        req.body.studentIds ||
        req.body.assignToStudentIds ||
        req.body.assignedStudents ||
        [],
    });
    if (targetValidation?.error) {
      return res.status(targetValidation.error.status).json({
        success: false,
        message: targetValidation.error.message,
      });
    }
    assignment.workspace = nextCourseId;
    assignment.class = targetValidation.classroomId;
    await assignment.save();

    const shouldReplaceTargets =
      req.body.studentIds !== undefined ||
      req.body.assignToStudentIds !== undefined ||
      req.body.assignedStudents !== undefined ||
      req.body.courseId !== undefined ||
      req.body.workspaceId !== undefined ||
      req.body.classroomId !== undefined ||
      req.body.classId !== undefined ||
      req.body.dueDate !== undefined;

    if (shouldReplaceTargets) {
      await AssignmentAssignment.deleteMany({ assignmentId: assignment._id });
      const targetRows = buildTargetRows({
        key: "assignmentId",
        ownerId: assignment._id,
        courseId: nextCourseId,
        classroomId: targetValidation.classroomId,
        studentIds: targetValidation.studentIds,
        dueDate: assignment.dueDate,
        tenantId: getRequestTenantId(req) || courseCheck.course?.tenantId || null,
      });
      if (targetRows.length) {
        await AssignmentAssignment.insertMany(targetRows, { ordered: false });
      }
    }

    const output = await Assignment.findById(assignment._id)
      .populate("teacher", userFields)
      .populate("class", "name grade section")
      .populate("workspace", "title name code classroomId subjectId")
      .lean();

    return res.json({
      success: true,
      data: serializeAssignment(output),
      message: "Assignment updated successfully",
    });
  } catch (err) {
    console.error("Update assignment error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to update assignment",
    });
  }
};

export const listTeacherAssignments = async (req, res) => {
  try {
    if (!ensureTeacherRequest(req, res)) return;

    const tenantId = getRequestTenantId(req);
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const cursor = req.query.cursor || null;
    const courseId = req.query.courseId || null;

    const filter = {
      teacher: req.user._id,
      deleted: false,
      ...buildTenantMatch(tenantId),
    };

    if (courseId) {
      if (!isValidObjectId(courseId)) {
        return res.status(400).json({ success: false, message: "Invalid courseId" });
      }
      filter.workspace = courseId;
    }

    applyCursor(filter, cursor);

    const assignments = await Assignment.find(filter)
      .populate("teacher", userFields)
      .populate("class", "name grade section")
      .populate("workspace", "title name code classroomId subjectId")
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    const assignmentIds = assignments.map((assignment) => assignment._id);
    const [targetRows, submissions] = await Promise.all([
      AssignmentAssignment.find({
        assignmentId: { $in: assignmentIds.length ? assignmentIds : [null] },
        ...buildTenantMatch(tenantId),
      }).lean(),
      Submission.find({
        assignmentId: { $in: assignmentIds.length ? assignmentIds : [null] },
        deleted: false,
      })
        .populate("studentId", userFields)
        .lean(),
    ]);

    const targetsByAssignmentId = groupRowsByOwner(targetRows, "assignmentId");
    const submissionsByAssignmentId = groupRowsByOwner(submissions, "assignmentId");

    const items = await Promise.all(
      assignments.map(async (assignment) => {
        const ownerId = String(assignment._id);
        const targetRowsForAssignment = targetsByAssignmentId.get(ownerId) || [];
        const targetStudentIds = await resolveTargetStudentIds({
          targetRows: targetRowsForAssignment,
          courseId: toId(assignment.workspace),
          classroomId: toId(assignment.class),
        });
        const summary = summarizeSubmissionState({
          targetStudentIds,
          studentWork: submissionsByAssignmentId.get(ownerId) || [],
        });

        return serializeAssignment(assignment, {
          selectedStudentIds: pickSelectedStudentIds(targetRowsForAssignment),
          counts: summary,
        });
      }),
    );

    return res.json({
      success: true,
      data: items,
      cursor: { next: makeNextCursor(assignments, limit) },
      count: items.length,
    });
  } catch (err) {
    console.error("List teacher assignments error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch teacher assignments",
    });
  }
};

export const getAssignmentSubmissions = async (req, res) => {
  try {
    if (!ensureTeacherRequest(req, res)) return;

    const found = await ensureAssignmentAccess({
      assignmentId: req.params.assignmentId,
      req,
      withContent: true,
    });
    if (found?.error) {
      return res.status(found.error.status).json({
        success: false,
        message: found.error.message,
      });
    }

    const assignment = found.assignment;
    const targetRows = await AssignmentAssignment.find({
      assignmentId: assignment._id,
      ...buildTenantMatch(getRequestTenantId(req)),
    }).lean();

    const targetStudentIds = await resolveTargetStudentIds({
      targetRows,
      courseId: toId(assignment.workspace),
      classroomId: toId(assignment.class),
    });

    const submissions = await Submission.find({
      assignmentId: assignment._id,
      deleted: false,
    })
      .populate("studentId", userFields)
      .sort({ submittedAt: -1 })
      .lean();

    const submittedStudentIds = new Set(
      submissions.map((submission) => toId(submission.studentId)).filter(Boolean),
    );

    const missingStudents = targetStudentIds.length
      ? await User.find({
          _id: { $in: targetStudentIds.filter((id) => !submittedStudentIds.has(id)) },
        })
          .select(userFields)
          .lean()
      : [];

    return res.json({
      success: true,
      assignment: serializeAssignment(assignment, {
        selectedStudentIds: pickSelectedStudentIds(targetRows),
      }),
      submissions: submissions.map((submission) => ({
        ...serializeSubmission(submission),
        student: submission.studentId || null,
      })),
      missingStudents,
      summary: summarizeSubmissionState({
        targetStudentIds,
        studentWork: submissions,
      }),
    });
  } catch (err) {
    console.error("Get assignment submissions error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch assignment submissions",
    });
  }
};

export const createQuiz = async (req, res) => {
  try {
    if (!ensureTeacherRequest(req, res)) return;

    const title = normalizeString(req.body.title);
    const description = normalizeString(req.body.description);
    const subject = normalizeString(req.body.subject);
    const curriculum = normalizeString(req.body.curriculum || "General");
    const gradeLevel = normalizeString(req.body.gradeLevel || "All");
    const courseId = req.body.courseId || req.body.workspaceId || null;
    const classroomId = req.body.classroomId || req.body.classId || null;
    const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    const tenantId = getRequestTenantId(req);

    if (!title || !subject) {
      return res.status(400).json({
        success: false,
        message: "title and subject are required",
      });
    }

    const questionsInput = Array.isArray(req.body.questions) ? req.body.questions : [];
    if (!questionsInput.length) {
      return res.status(400).json({
        success: false,
        message: "At least one question is required",
      });
    }

    const courseCheck = await ensureCourseAccess({ req, courseId });
    if (courseCheck?.error) {
      return res.status(courseCheck.error.status).json({
        success: false,
        message: courseCheck.error.message,
      });
    }
    if (dueDate && Number.isNaN(dueDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "A valid dueDate is required",
      });
    }
    if (dueDate && dueDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "dueDate must be in the future",
      });
    }
    const targetValidation = await validateTargeting({
      tenantId: tenantId || courseCheck.course?.tenantId || null,
      course: courseCheck.course,
      classroomId,
      studentIds:
        req.body.studentIds ||
        req.body.assignToStudentIds ||
        req.body.assignedStudents ||
        [],
    });
    if (targetValidation?.error) {
      return res.status(targetValidation.error.status).json({
        success: false,
        message: targetValidation.error.message,
      });
    }

    const questions = questionsInput.map((question, index) =>
      normalizeQuizQuestion(question, index),
    );

    const quiz = await Quiz.create({
      tenantId: tenantId || courseCheck.course?.tenantId || null,
      title,
      description,
      teacher: req.user._id,
      createdBy: req.user._id,
      subject,
      curriculum,
      gradeLevel,
      workspace: courseId,
      class: targetValidation.classroomId,
      questions,
      timeLimit: toPositiveNumber(req.body.timeLimit, 30),
      maxAttempts: Math.max(toPositiveNumber(req.body.maxAttempts, 1), 1),
      passingScore: Math.min(
        Math.max(toPositiveNumber(req.body.passingScore, 60), 0),
        100,
      ),
      shuffleQuestions: Boolean(req.body.shuffleQuestions),
      showResults:
        req.body.showResults === undefined ? true : Boolean(req.body.showResults),
      status: normalizeStatus(req.body.status, "draft"),
    });

    const targetRows = buildTargetRows({
      key: "quizId",
      ownerId: quiz._id,
      courseId,
      classroomId: targetValidation.classroomId,
      studentIds: targetValidation.studentIds,
      dueDate:
        dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
      tenantId: tenantId || courseCheck.course?.tenantId || null,
    });

    if (targetRows.length) {
      await QuizAssignment.insertMany(targetRows, { ordered: false });
    }

    if (courseId) {
      await CourseActivity.create({
        type: "quiz",
        userId: req.user._id,
        quizId: quiz._id,
        courseId,
        visibility: true,
      });
    }

    const output = await Quiz.findById(quiz._id)
      .populate("teacher", userFields)
      .populate("class", "name grade section")
      .populate("workspace", "title name code classroomId subjectId")
      .select("+questions.correctAnswer")
      .lean();

    if (quiz.status === "published") {
      const targetStudentIds = await resolveTargetStudentIds({
        targetRows,
        courseId,
        classroomId: targetValidation.classroomId,
      });

      emitRealtimeEvent({
        type: "quiz_publish",
        status: "success",
        requestId: requestIdFromReq(req),
        entityType: "quiz",
        entityId: quiz._id,
        message: `${quiz.title} is now available.`,
        actor: buildActorFromRequest(req),
        targets: {
          studentIds: targetStudentIds,
        },
        meta: {
          action: "quiz_published",
          quizId: toId(quiz._id),
          courseId: toId(courseId),
          classroomId: toId(classroomId),
          dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
        },
      });
    }

    return res.status(201).json({
      success: true,
      data: serializeQuiz(output, { includeAnswers: true }),
      message: "Quiz created successfully",
    });
  } catch (err) {
    console.error("Create quiz error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Failed to create quiz",
    });
  }
};

export const updateQuiz = async (req, res) => {
  try {
    if (!ensureTeacherRequest(req, res)) return;

    const found = await ensureQuizAccess({ quizId: req.params.quizId, req });
    if (found?.error) {
      return res.status(found.error.status).json({
        success: false,
        message: found.error.message,
      });
    }

    const quiz = found.quiz;
    const nextCourseId =
      req.body.courseId !== undefined || req.body.workspaceId !== undefined
        ? req.body.courseId || req.body.workspaceId || null
        : toId(quiz.workspace);
    const nextClassroomId =
      req.body.classroomId !== undefined || req.body.classId !== undefined
        ? req.body.classroomId || req.body.classId || null
        : toId(quiz.class);

    const courseCheck = await ensureCourseAccess({ req, courseId: nextCourseId });
    if (courseCheck?.error) {
      return res.status(courseCheck.error.status).json({
        success: false,
        message: courseCheck.error.message,
      });
    }

    if (req.body.title !== undefined) quiz.title = normalizeString(req.body.title);
    if (req.body.description !== undefined) {
      quiz.description = normalizeString(req.body.description);
    }
    if (req.body.subject !== undefined) quiz.subject = normalizeString(req.body.subject);
    if (req.body.curriculum !== undefined) {
      quiz.curriculum = normalizeString(req.body.curriculum || "General");
    }
    if (req.body.gradeLevel !== undefined) {
      quiz.gradeLevel = normalizeString(req.body.gradeLevel || "All");
    }
    if (req.body.timeLimit !== undefined) {
      quiz.timeLimit = toPositiveNumber(req.body.timeLimit, quiz.timeLimit);
    }
    if (req.body.maxAttempts !== undefined) {
      quiz.maxAttempts = Math.max(toPositiveNumber(req.body.maxAttempts, quiz.maxAttempts), 1);
    }
    if (req.body.passingScore !== undefined) {
      quiz.passingScore = Math.min(
        Math.max(toPositiveNumber(req.body.passingScore, quiz.passingScore), 0),
        100,
      );
    }
    if (req.body.shuffleQuestions !== undefined) {
      quiz.shuffleQuestions = Boolean(req.body.shuffleQuestions);
    }
    if (req.body.showResults !== undefined) {
      quiz.showResults = Boolean(req.body.showResults);
    }
    if (req.body.status !== undefined) {
      quiz.status = normalizeStatus(req.body.status, quiz.status);
    }
    if (req.body.dueDate !== undefined) {
      const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
      if (!dueDate || Number.isNaN(dueDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "A valid dueDate is required",
        });
      }
      if (dueDate <= new Date()) {
        return res.status(400).json({
          success: false,
          message: "dueDate must be in the future",
        });
      }
    }
    if (req.body.questions !== undefined) {
      const questionsInput = Array.isArray(req.body.questions) ? req.body.questions : [];
      if (!questionsInput.length) {
        return res.status(400).json({
          success: false,
          message: "At least one question is required",
        });
      }
      quiz.questions = questionsInput.map((question, index) =>
        normalizeQuizQuestion(question, index),
      );
    }
    const targetValidation = await validateTargeting({
      tenantId: getRequestTenantId(req) || courseCheck.course?.tenantId || null,
      course: courseCheck.course,
      classroomId: nextClassroomId,
      studentIds:
        req.body.studentIds ||
        req.body.assignToStudentIds ||
        req.body.assignedStudents ||
        [],
    });
    if (targetValidation?.error) {
      return res.status(targetValidation.error.status).json({
        success: false,
        message: targetValidation.error.message,
      });
    }
    quiz.workspace = nextCourseId;
    quiz.class = targetValidation.classroomId;
    await quiz.save();

    const shouldReplaceTargets =
      req.body.studentIds !== undefined ||
      req.body.assignToStudentIds !== undefined ||
      req.body.assignedStudents !== undefined ||
      req.body.courseId !== undefined ||
      req.body.workspaceId !== undefined ||
      req.body.classroomId !== undefined ||
      req.body.classId !== undefined ||
      req.body.dueDate !== undefined;

    if (shouldReplaceTargets) {
      await QuizAssignment.deleteMany({ quizId: quiz._id });
      const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
      const targetRows = buildTargetRows({
        key: "quizId",
        ownerId: quiz._id,
        courseId: nextCourseId,
        classroomId: targetValidation.classroomId,
        studentIds: targetValidation.studentIds,
        dueDate:
          dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
        tenantId: getRequestTenantId(req) || courseCheck.course?.tenantId || null,
      });
      if (targetRows.length) {
        await QuizAssignment.insertMany(targetRows, { ordered: false });
      }
    }

    const output = await Quiz.findById(quiz._id)
      .populate("teacher", userFields)
      .populate("class", "name grade section")
      .populate("workspace", "title name code classroomId subjectId")
      .select("+questions.correctAnswer")
      .lean();

    return res.json({
      success: true,
      data: serializeQuiz(output, { includeAnswers: true }),
      message: "Quiz updated successfully",
    });
  } catch (err) {
    console.error("Update quiz error:", err);
    return res.status(500).json({
      success: false,
      error: err?.message || "Failed to update quiz",
    });
  }
};

export const listTeacherQuizzes = async (req, res) => {
  try {
    if (!ensureTeacherRequest(req, res)) return;

    const tenantId = getRequestTenantId(req);
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const cursor = req.query.cursor || null;
    const courseId = req.query.courseId || null;

    const filter = {
      teacher: req.user._id,
      deleted: false,
      ...buildTenantMatch(tenantId),
    };

    if (courseId) {
      if (!isValidObjectId(courseId)) {
        return res.status(400).json({ success: false, message: "Invalid courseId" });
      }
      filter.workspace = courseId;
    }

    applyCursor(filter, cursor);

    const quizzes = await Quiz.find(filter)
      .select("+questions.correctAnswer")
      .populate("teacher", userFields)
      .populate("class", "name grade section")
      .populate("workspace", "title name code classroomId subjectId")
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    const quizIds = quizzes.map((quiz) => quiz._id);
    const [targetRows, attempts] = await Promise.all([
      QuizAssignment.find({
        quizId: { $in: quizIds.length ? quizIds : [null] },
        ...buildTenantMatch(tenantId),
      }).lean(),
      QuizAttempt.find({
        quizId: { $in: quizIds.length ? quizIds : [null] },
        deleted: false,
      })
        .populate("studentId", userFields)
        .lean(),
    ]);

    const targetsByQuizId = groupRowsByOwner(targetRows, "quizId");
    const attemptsByQuizId = groupRowsByOwner(attempts, "quizId");

    const items = await Promise.all(
      quizzes.map(async (quiz) => {
        const ownerId = String(quiz._id);
        const quizTargetRows = targetsByQuizId.get(ownerId) || [];
        const targetStudentIds = await resolveTargetStudentIds({
          targetRows: quizTargetRows,
          courseId: toId(quiz.workspace),
          classroomId: toId(quiz.class),
        });
        const summary = summarizeSubmissionState({
          targetStudentIds,
          studentWork: attemptsByQuizId.get(ownerId) || [],
        });

        return serializeQuiz(quiz, {
          includeAnswers: true,
          extras: {
            selectedStudentIds: pickSelectedStudentIds(quizTargetRows),
            counts: summary,
            dueDate:
              quizTargetRows.find((row) => row.dueDate)?.dueDate || null,
          },
        });
      }),
    );

    return res.json({
      success: true,
      data: items,
      cursor: { next: makeNextCursor(quizzes, limit) },
      count: items.length,
    });
  } catch (err) {
    console.error("List teacher quizzes error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch teacher quizzes",
    });
  }
};

export const getQuizResults = async (req, res) => {
  try {
    if (!ensureTeacherRequest(req, res)) return;

    const found = await ensureQuizAccess({ quizId: req.params.quizId, req });
    if (found?.error) {
      return res.status(found.error.status).json({
        success: false,
        message: found.error.message,
      });
    }

    const quiz = found.quiz;
    const targetRows = await QuizAssignment.find({
      quizId: quiz._id,
      ...buildTenantMatch(getRequestTenantId(req)),
    }).lean();

    const targetStudentIds = await resolveTargetStudentIds({
      targetRows,
      courseId: toId(quiz.workspace),
      classroomId: toId(quiz.class),
    });

    const attempts = await QuizAttempt.find({
      quizId: quiz._id,
      deleted: false,
    })
      .populate("studentId", userFields)
      .sort({ submittedAt: -1, createdAt: -1 })
      .lean();

    const attemptStudentIds = new Set(
      attempts.map((attempt) => toId(attempt.studentId)).filter(Boolean),
    );

    const missingStudents = targetStudentIds.length
      ? await User.find({
          _id: { $in: targetStudentIds.filter((id) => !attemptStudentIds.has(id)) },
        })
          .select(userFields)
          .lean()
      : [];

    return res.json({
      success: true,
      quiz: serializeQuiz(quiz, {
        includeAnswers: true,
        extras: {
          selectedStudentIds: pickSelectedStudentIds(targetRows),
          dueDate: targetRows.find((row) => row.dueDate)?.dueDate || null,
        },
      }),
      attempts: attempts.map((attempt) => ({
        ...serializeAttemptForUi(attempt),
        student: attempt.studentId || null,
      })),
      missingStudents,
      summary: summarizeSubmissionState({
        targetStudentIds,
        studentWork: attempts,
      }),
    });
  } catch (err) {
    console.error("Get quiz results error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch quiz results",
    });
  }
};

export const getTeacherDashboard = async (req, res) => {
  try {
    if (!ensureTeacherRequest(req, res)) return;

    const tenantId = getRequestTenantId(req);
    const accessibleCourseIds = await getAccessibleCourseIdsForUser({
      userId: req.user._id,
      tenantId,
      includeOwned: true,
    });

    const [
      assignments,
      quizzes,
      pendingSubmissions,
      pendingQuizAttempts,
      announcements,
      recentMaterials,
    ] = await Promise.all([
      Assignment.find({
        teacher: req.user._id,
        deleted: false,
        ...buildTenantMatch(tenantId),
      })
        .populate("workspace", "title name code")
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(5)
        .lean(),
      Quiz.find({
        teacher: req.user._id,
        deleted: false,
        ...buildTenantMatch(tenantId),
      })
        .populate("workspace", "title name code")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Submission.countDocuments({
        teacherId: req.user._id,
        deleted: false,
        gradingStatus: {
          $in: [
            "submitted",
            "ai_graded",
            "pending_teacher_review",
            "grading_delayed",
          ],
        },
        ...buildTenantMatch(tenantId),
      }),
      QuizAttempt.countDocuments({
        status: {
          $in: [
            "submitted",
            "ai_graded",
            "pending_teacher_review",
            "grading_delayed",
          ],
        },
        deleted: false,
        ...buildTenantMatch(tenantId),
      }).where("quizId").in(
        await Quiz.find({
          teacher: req.user._id,
          deleted: false,
          ...buildTenantMatch(tenantId),
        }).distinct("_id"),
      ),
      Announcement.find({
        createdBy: req.user._id,
        deleted: false,
        ...buildTenantMatch(tenantId),
      })
        .sort({ pinned: -1, publishedAt: -1 })
        .limit(5)
        .lean(),
      LessonContent.find({
        courseId: { $in: accessibleCourseIds.length ? accessibleCourseIds : [null] },
        deleted: false,
        ...buildTenantMatch(tenantId),
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    return res.json({
      success: true,
      summary: {
        courses: accessibleCourseIds.length,
        assignments: assignments.length,
        quizzes: quizzes.length,
        accessibleCourses: accessibleCourseIds.length,
        pendingGrading: pendingSubmissions + pendingQuizAttempts,
        announcements: announcements.length,
        recentMaterials: recentMaterials.length,
      },
      upcomingAssignments: assignments.map((assignment) =>
        serializeAssignment(assignment),
      ),
      recentQuizzes: quizzes.map((quiz) =>
        serializeQuiz(quiz, { includeAnswers: true }),
      ),
      recentAnnouncements: announcements,
      recentMaterials,
    });
  } catch (err) {
    console.error("Get teacher dashboard error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch teacher dashboard",
    });
  }
};

export const getTeacherContent = async (req, res) => {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    if (!isTeacherLike(req)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const tenantId = getRequestTenantId(req);
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const assignmentCursor = req.query.assignmentCursor || null;
    const quizCursor = req.query.quizCursor || null;
    const courseId = req.query.courseId || null;

    const assignmentsFilter = {
      teacher: req.user._id,
      deleted: false,
      ...buildTenantMatch(tenantId),
    };
    const quizzesFilter = {
      teacher: req.user._id,
      deleted: false,
      ...buildTenantMatch(tenantId),
    };

    if (courseId && isValidObjectId(courseId)) {
      assignmentsFilter.workspace = courseId;
      quizzesFilter.workspace = courseId;
    }

    applyCursor(assignmentsFilter, assignmentCursor);
    applyCursor(quizzesFilter, quizCursor);

    const [assignments, quizzes] = await Promise.all([
      Assignment.find(assignmentsFilter)
        .populate("teacher", userFields)
        .populate("class", "name grade section")
        .populate("workspace", "title name code classroomId subjectId")
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean(),
      Quiz.find(quizzesFilter)
        .select("+questions.correctAnswer")
        .populate("teacher", userFields)
        .populate("class", "name grade section")
        .populate("workspace", "title name code classroomId subjectId")
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .lean(),
    ]);

    return res.json({
      success: true,
      data: {
        assignments: assignments.map((assignment) => serializeAssignment(assignment)),
        quizzes: quizzes.map((quiz) =>
          serializeQuiz(quiz, { includeAnswers: true }),
        ),
      },
      cursors: {
        nextAssignmentCursor: makeNextCursor(assignments, limit),
        nextQuizCursor: makeNextCursor(quizzes, limit),
      },
      counts: {
        assignments: assignments.length,
        quizzes: quizzes.length,
      },
    });
  } catch (err) {
    console.error("Get teacher content error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch teacher content",
    });
  }
};
