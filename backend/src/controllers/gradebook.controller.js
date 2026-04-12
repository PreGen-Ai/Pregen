import Assignment from "../models/Assignment.js";
import Course from "../models/CourseModel.js";
import Quiz from "../models/quiz.js";
import QuizAttempt from "../models/QuizAttempt.js";
import Submission from "../models/Submission.js";
import {
  buildActorFromRequest,
  emitRealtimeEvent,
} from "../socket/emitter.js";
import { writeAuditLog } from "../services/auditLogService.js";
import {
  applyFinalApprovalState,
  applyTeacherReviewState,
  ATTEMPT_STATUS,
  getCurrentFeedback,
  getCurrentScore,
  GRADING_STATUS,
  normalizeReviewStatus,
} from "../services/gradingLifecycle.js";
import {
  canAccessCourse,
  getAccessibleCourseIdsForUser,
  getRequestTenantId,
  getStudentAcademicContext,
  isAdminLike,
  isTeacherLike,
  isValidObjectId,
  normalizeRoleValue,
  toId,
  userFields,
} from "../utils/academicContract.js";

const requestIdFromReq = (req) =>
  req.get?.("x-request-id") || req.headers?.["x-request-id"] || null;

function sortByLatest(a, b) {
  return (
    new Date(b.updatedAt || b.submittedAt || 0) -
    new Date(a.updatedAt || a.submittedAt || 0)
  );
}

function buildSummary(items = []) {
  const finalizedItems = items.filter(
    (item) => item.status === GRADING_STATUS.FINAL,
  );
  const averageScore = finalizedItems.length
    ? Math.round(
        finalizedItems.reduce((sum, item) => sum + Number(item.score || 0), 0) /
          finalizedItems.length,
      )
    : null;

  return {
    total: items.length,
    assignments: items.filter((item) => item.kind === "assignment").length,
    quizzes: items.filter((item) => item.kind === "quiz").length,
    graded: finalizedItems.length,
    averageScore,
  };
}

function serializeSubmissionGradebook(submission) {
  const status = normalizeReviewStatus(
    submission.gradingStatus,
    GRADING_STATUS.SUBMITTED,
  );

  return {
    _id: toId(submission._id),
    kind: "assignment",
    sourceId: toId(submission._id),
    assignmentId: toId(submission.assignmentId?._id || submission.assignmentId),
    courseId: toId(submission.workspaceId?._id || submission.workspaceId),
    studentId: toId(submission.studentId?._id || submission.studentId),
    title: submission.assignmentId?.title || "Assignment",
    courseTitle: submission.workspaceId?.title || "Course",
    student:
      submission.studentId && typeof submission.studentId === "object"
        ? {
            _id: toId(submission.studentId._id),
            firstName: submission.studentId.firstName || "",
            lastName: submission.studentId.lastName || "",
            username: submission.studentId.username || "",
            email: submission.studentId.email || "",
          }
        : null,
    score: getCurrentScore(submission),
    maxScore: Number(submission.assignmentId?.maxScore || 100),
    feedback: getCurrentFeedback(submission),
    status,
    released: status === GRADING_STATUS.FINAL,
    aiScore:
      submission.aiScore === null || submission.aiScore === undefined
        ? null
        : Number(submission.aiScore),
    aiFeedback: submission.aiFeedback || "",
    finalScore:
      submission.finalScore === null || submission.finalScore === undefined
        ? null
        : Number(submission.finalScore),
    finalFeedback: submission.finalFeedback || "",
    adjustedByTeacher: Boolean(submission.adjustedByTeacher),
    teacherAdjustedAt: submission.teacherAdjustedAt || null,
    teacherApprovedAt: submission.teacherApprovedAt || null,
    teacherApprovedBy: toId(submission.teacherApprovedBy),
    submittedAt: submission.submittedAt || submission.createdAt || null,
    gradedAt: submission.gradedAt || null,
    updatedAt: submission.updatedAt || null,
  };
}

function serializeQuizGradebook(attempt) {
  const status = normalizeReviewStatus(
    attempt.status,
    ATTEMPT_STATUS.SUBMITTED,
  );

  return {
    _id: toId(attempt._id),
    kind: "quiz",
    sourceId: toId(attempt._id),
    quizAttemptId: toId(attempt._id),
    quizId: toId(attempt.quizId?._id || attempt.quizId),
    courseId: toId(attempt.workspaceId?._id || attempt.workspaceId),
    studentId: toId(attempt.studentId?._id || attempt.studentId),
    title: attempt.quizId?.title || "Quiz",
    courseTitle: attempt.workspaceId?.title || "Course",
    student:
      attempt.studentId && typeof attempt.studentId === "object"
        ? {
            _id: toId(attempt.studentId._id),
            firstName: attempt.studentId.firstName || "",
            lastName: attempt.studentId.lastName || "",
            username: attempt.studentId.username || "",
            email: attempt.studentId.email || "",
          }
        : null,
    score: getCurrentScore(attempt),
    maxScore: Number(attempt.maxScore || attempt.quizId?.totalPoints || 0),
    feedback: getCurrentFeedback(attempt),
    status,
    released: status === GRADING_STATUS.FINAL,
    aiScore:
      attempt.aiScore === null || attempt.aiScore === undefined
        ? null
        : Number(attempt.aiScore),
    aiFeedback: attempt.aiFeedback || "",
    finalScore:
      attempt.finalScore === null || attempt.finalScore === undefined
        ? null
        : Number(attempt.finalScore),
    finalFeedback: attempt.finalFeedback || "",
    adjustedByTeacher: Boolean(attempt.adjustedByTeacher),
    teacherAdjustedAt: attempt.teacherAdjustedAt || null,
    teacherApprovedAt: attempt.teacherApprovedAt || null,
    teacherApprovedBy: toId(attempt.teacherApprovedBy),
    submittedAt: attempt.submittedAt || attempt.createdAt || null,
    gradedAt: attempt.gradedAt || null,
    updatedAt: attempt.updatedAt || null,
  };
}

async function writeReviewAudit(req, {
  tenantId = null,
  type,
  message,
  meta = {},
  level = "info",
}) {
  return writeAuditLog({
    tenantId,
    level,
    type,
    actor: req.user?._id || "system",
    message,
    meta: {
      actorRole: normalizeRoleValue(req.user?.role),
      ...meta,
    },
  });
}

async function resolveCourseScope(req, role) {
  const tenantId = getRequestTenantId(req);
  const requestedCourseId = req.query.courseId;

  if (requestedCourseId) {
    if (!isValidObjectId(requestedCourseId)) {
      throw new Error("Invalid courseId");
    }

    const course = await Course.findById(requestedCourseId).select(
      "_id tenantId createdBy deleted",
    );
    const allowed =
      role === "STUDENT"
        ? (await getStudentAcademicContext(req.user._id, tenantId)).courseIds.includes(
            String(requestedCourseId),
          )
        : await canAccessCourse({ course, req });

    if (!allowed) {
      throw new Error("Not allowed to access this course");
    }

    return [requestedCourseId];
  }

  if (role === "STUDENT") {
    return (await getStudentAcademicContext(req.user._id, tenantId)).courseIds;
  }

  return getAccessibleCourseIdsForUser({
    userId: req.user._id,
    tenantId,
  });
}

async function getTeacherOwnedWorkIds({ userId, courseIds }) {
  const [assignments, quizzes] = await Promise.all([
    Assignment.find({
      teacher: userId,
      workspace: { $in: courseIds.length ? courseIds : [null] },
      deleted: false,
    })
      .select("_id")
      .lean(),
    Quiz.find({
      teacher: userId,
      workspace: { $in: courseIds.length ? courseIds : [null] },
      deleted: false,
    })
      .select("_id")
      .lean(),
  ]);

  return {
    assignmentIds: assignments.map((row) => row._id),
    quizIds: quizzes.map((row) => row._id),
  };
}

async function loadSubmissionContext(req, submissionId) {
  const submission = await Submission.findOne({
    _id: submissionId,
    deleted: false,
  });
  if (!submission) {
    return { error: { status: 404, message: "Submission not found" } };
  }

  const assignment = await Assignment.findById(submission.assignmentId).select(
    "_id title teacher workspace deleted tenantId",
  );
  if (!assignment || assignment.deleted) {
    return { error: { status: 404, message: "Assignment not found" } };
  }

  const allowed = await canAccessCourse({ courseId: assignment.workspace, req });
  if (!allowed) {
    return { error: { status: 403, message: "Not allowed to grade this submission" } };
  }

  if (!isAdminLike(req) && toId(assignment.teacher) !== String(req.user._id)) {
    return { error: { status: 403, message: "Not allowed to grade this submission" } };
  }

  return { submission, assignment };
}

async function loadQuizAttemptContext(req, attemptId) {
  const attempt = await QuizAttempt.findOne({
    _id: attemptId,
    deleted: false,
  });
  if (!attempt) {
    return { error: { status: 404, message: "Quiz attempt not found" } };
  }

  const quiz = await Quiz.findById(attempt.quizId).select(
    "_id title teacher workspace deleted tenantId",
  );
  if (!quiz || quiz.deleted) {
    return { error: { status: 404, message: "Quiz not found" } };
  }

  const allowed = await canAccessCourse({ courseId: quiz.workspace, req });
  if (!allowed) {
    return { error: { status: 403, message: "Not allowed to grade this quiz attempt" } };
  }

  if (!isAdminLike(req) && toId(quiz.teacher) !== String(req.user._id)) {
    return { error: { status: 403, message: "Not allowed to grade this quiz attempt" } };
  }

  return { attempt, quiz };
}

function parseScore(value, fieldName = "score") {
  if (value === undefined || value === null || value === "") return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`${fieldName} must be between 0 and 100`);
  }

  return parsed;
}

async function persistSubmissionReview(req, submission, assignment, {
  score,
  feedback,
  approve = false,
  action = "review",
}) {
  const nextScore = parseScore(score, "grade");
  const metadata = {
    assignmentId: assignment._id,
    courseId: assignment.workspace,
  };

  if (nextScore !== undefined || feedback !== undefined || !approve) {
    applyTeacherReviewState(submission, {
      actorId: req.user?._id,
      actorRole: normalizeRoleValue(req.user?.role),
      statusField: "gradingStatus",
      score: nextScore,
      feedback,
      metadata,
    });
  }

  if (approve) {
    applyFinalApprovalState(submission, {
      actorId: req.user?._id,
      actorRole: normalizeRoleValue(req.user?.role),
      statusField: "gradingStatus",
      score: nextScore,
      feedback,
      metadata,
    });
  }

  await submission.save();

  await writeReviewAudit(req, {
    tenantId: submission.tenantId || assignment.tenantId || null,
    type: approve ? "GRADE_APPROVED" : "GRADE_REVIEW_DRAFTED",
    message: approve
      ? `Approved final grade for assignment submission ${submission._id}`
      : `Drafted teacher review for assignment submission ${submission._id}`,
    meta: {
      submissionId: submission._id,
      assignmentId: assignment._id,
      score: getCurrentScore(submission),
      approved: approve,
      action,
    },
  });

  const fresh = await Submission.findById(submission._id)
    .populate("assignmentId", "title maxScore")
    .populate("studentId", userFields)
    .populate("workspaceId", "title")
    .lean();

  const studentUserId = toId(submission.studentId);
  const teacherUserId = toId(req.user?._id);
  const courseId = toId(assignment.workspace);
  const requestId = requestIdFromReq(req);

  emitRealtimeEvent({
    type: approve ? "grade" : "teacher_review",
    status: approve ? "success" : "updated",
    requestId,
    entityType: "submission",
    entityId: submission._id,
    message: approve
      ? "Final assignment grade approved."
      : "Teacher review updated for an assignment submission.",
    actor: buildActorFromRequest(req),
    targets: {
      userIds: [studentUserId, teacherUserId].filter(Boolean),
      studentIds: studentUserId ? [studentUserId] : [],
      teacherIds: teacherUserId ? [teacherUserId] : [],
    },
    meta: {
      action,
      assignmentId: toId(submission.assignmentId),
      courseId,
      score: getCurrentScore(submission),
      feedback: getCurrentFeedback(submission),
      status: normalizeReviewStatus(submission.gradingStatus),
    },
  });

  return fresh;
}

async function persistQuizReview(req, attempt, quiz, {
  score,
  feedback,
  approve = false,
  action = "review",
}) {
  const nextScore = parseScore(score, "score");
  const metadata = {
    quizId: quiz._id,
    courseId: quiz.workspace,
  };

  if (nextScore !== undefined || feedback !== undefined || !approve) {
    applyTeacherReviewState(attempt, {
      actorId: req.user?._id,
      actorRole: normalizeRoleValue(req.user?.role),
      statusField: "status",
      score: nextScore,
      feedback,
      metadata,
    });
  }

  if (approve) {
    applyFinalApprovalState(attempt, {
      actorId: req.user?._id,
      actorRole: normalizeRoleValue(req.user?.role),
      statusField: "status",
      score: nextScore,
      feedback,
      metadata,
    });
    attempt.locked = true;
  }

  await attempt.save();

  await writeReviewAudit(req, {
    tenantId: attempt.tenantId || quiz.tenantId || null,
    type: approve ? "QUIZ_GRADE_APPROVED" : "QUIZ_REVIEW_DRAFTED",
    message: approve
      ? `Approved final quiz grade for attempt ${attempt._id}`
      : `Drafted teacher review for quiz attempt ${attempt._id}`,
    meta: {
      attemptId: attempt._id,
      quizId: quiz._id,
      score: getCurrentScore(attempt),
      approved: approve,
      action,
    },
  });

  const fresh = await QuizAttempt.findById(attempt._id)
    .populate("quizId", "title totalPoints")
    .populate("studentId", userFields)
    .populate("workspaceId", "title")
    .lean();

  const studentUserId = toId(attempt.studentId);
  const teacherUserId = toId(req.user?._id);
  const courseId = toId(quiz.workspace);
  const requestId = requestIdFromReq(req);

  emitRealtimeEvent({
    type: approve ? "grade" : "teacher_review",
    status: approve ? "success" : "updated",
    requestId,
    entityType: "quiz_attempt",
    entityId: attempt._id,
    message: approve
      ? "Final quiz grade approved."
      : "Teacher review updated for a quiz attempt.",
    actor: buildActorFromRequest(req),
    targets: {
      userIds: [studentUserId, teacherUserId].filter(Boolean),
      studentIds: studentUserId ? [studentUserId] : [],
      teacherIds: teacherUserId ? [teacherUserId] : [],
    },
    meta: {
      action,
      quizId: toId(attempt.quizId),
      courseId,
      score: getCurrentScore(attempt),
      feedback: getCurrentFeedback(attempt),
      status: normalizeReviewStatus(attempt.status),
    },
  });

  return fresh;
}

export async function listGradebook(req, res) {
  try {
    const role = normalizeRoleValue(req.user?.role);
    const courseIds = await resolveCourseScope(req, role);
    const studentId =
      role === "STUDENT" ? req.user._id : req.query.studentId || null;

    if (!courseIds.length) {
      return res.json({ items: [], summary: buildSummary([]) });
    }

    const submissionFilter = {
      workspaceId: { $in: courseIds },
      deleted: false,
    };
    const attemptFilter = {
      workspaceId: { $in: courseIds },
      deleted: false,
    };

    if (studentId) {
      if (!isValidObjectId(studentId)) {
        return res.status(400).json({ message: "Invalid studentId" });
      }
      submissionFilter.studentId = studentId;
      attemptFilter.studentId = studentId;
    }

    if (role === "TEACHER") {
      const owned = await getTeacherOwnedWorkIds({
        userId: req.user._id,
        courseIds,
      });
      submissionFilter.assignmentId = {
        $in: owned.assignmentIds.length ? owned.assignmentIds : [null],
      };
      attemptFilter.quizId = {
        $in: owned.quizIds.length ? owned.quizIds : [null],
      };
    }

    const [submissions, attempts] = await Promise.all([
      Submission.find(submissionFilter)
        .populate("assignmentId", "title maxScore")
        .populate("studentId", userFields)
        .populate("workspaceId", "title")
        .sort({ submittedAt: -1, createdAt: -1 })
        .lean(),
      QuizAttempt.find(attemptFilter)
        .populate("quizId", "title totalPoints teacher")
        .populate("studentId", userFields)
        .populate("workspaceId", "title")
        .sort({ submittedAt: -1, createdAt: -1 })
        .lean(),
    ]);

    let items = [
      ...submissions.map((submission) => serializeSubmissionGradebook(submission)),
      ...attempts.map((attempt) => serializeQuizGradebook(attempt)),
    ].sort(sortByLatest);

    if (role === "STUDENT") {
      items = items.map((item) =>
        item.released
          ? item
          : {
              ...item,
              score: null,
              feedback: "",
              aiScore: null,
              aiFeedback: "",
              teacherAdjustedScore: null,
              teacherAdjustedFeedback: "",
            },
      );
    }

    return res.json({
      items,
      summary: buildSummary(items),
    });
  } catch (error) {
    const status =
      /Invalid courseId/.test(error.message) || /Not allowed/.test(error.message)
        ? 403
        : 500;
    return res.status(status).json({
      message: "Failed to load gradebook",
      error: error.message,
    });
  }
}

export async function reviewSubmission(req, res) {
  try {
    if (!isTeacherLike(req)) {
      return res.status(403).json({ message: "Only teachers and admins can review grades" });
    }

    const { submissionId } = req.params;
    if (!isValidObjectId(submissionId)) {
      return res.status(400).json({ message: "Invalid submission id" });
    }

    const found = await loadSubmissionContext(req, submissionId);
    if (found?.error) {
      return res.status(found.error.status).json({ message: found.error.message });
    }

    const fresh = await persistSubmissionReview(req, found.submission, found.assignment, {
      score: req.body?.grade ?? req.body?.score,
      feedback: req.body?.feedback,
      approve: false,
      action: "draft_review",
    });

    return res.json({
      message: "Submission review updated",
      item: serializeSubmissionGradebook(fresh),
    });
  } catch (error) {
    const status = /between 0 and 100/.test(error.message) ? 400 : 500;
    return res.status(status).json({
      message: "Failed to review submission",
      error: error.message,
    });
  }
}

export async function approveSubmission(req, res) {
  try {
    if (!isTeacherLike(req)) {
      return res.status(403).json({ message: "Only teachers and admins can approve grades" });
    }

    const { submissionId } = req.params;
    if (!isValidObjectId(submissionId)) {
      return res.status(400).json({ message: "Invalid submission id" });
    }

    const found = await loadSubmissionContext(req, submissionId);
    if (found?.error) {
      return res.status(found.error.status).json({ message: found.error.message });
    }

    const fresh = await persistSubmissionReview(req, found.submission, found.assignment, {
      score: req.body?.grade ?? req.body?.score,
      feedback: req.body?.feedback,
      approve: true,
      action: "approve",
    });

    return res.json({
      message: "Submission grade approved",
      item: serializeSubmissionGradebook(fresh),
    });
  } catch (error) {
    const status = /between 0 and 100|required/.test(error.message) ? 400 : 500;
    return res.status(status).json({
      message: "Failed to approve submission",
      error: error.message,
    });
  }
}

export async function reviewQuizAttempt(req, res) {
  try {
    if (!isTeacherLike(req)) {
      return res.status(403).json({ message: "Only teachers and admins can review grades" });
    }

    const { attemptId } = req.params;
    if (!isValidObjectId(attemptId)) {
      return res.status(400).json({ message: "Invalid attempt id" });
    }

    const found = await loadQuizAttemptContext(req, attemptId);
    if (found?.error) {
      return res.status(found.error.status).json({ message: found.error.message });
    }

    const fresh = await persistQuizReview(req, found.attempt, found.quiz, {
      score: req.body?.score,
      feedback: req.body?.feedback,
      approve: false,
      action: "draft_review",
    });

    return res.json({
      message: "Quiz review updated",
      item: serializeQuizGradebook(fresh),
    });
  } catch (error) {
    const status = /between 0 and 100/.test(error.message) ? 400 : 500;
    return res.status(status).json({
      message: "Failed to review quiz attempt",
      error: error.message,
    });
  }
}

export async function approveQuizAttempt(req, res) {
  try {
    if (!isTeacherLike(req)) {
      return res.status(403).json({ message: "Only teachers and admins can approve grades" });
    }

    const { attemptId } = req.params;
    if (!isValidObjectId(attemptId)) {
      return res.status(400).json({ message: "Invalid attempt id" });
    }

    const found = await loadQuizAttemptContext(req, attemptId);
    if (found?.error) {
      return res.status(found.error.status).json({ message: found.error.message });
    }

    const fresh = await persistQuizReview(req, found.attempt, found.quiz, {
      score: req.body?.score,
      feedback: req.body?.feedback,
      approve: true,
      action: "approve",
    });

    return res.json({
      message: "Quiz attempt approved",
      item: serializeQuizGradebook(fresh),
    });
  } catch (error) {
    const status = /between 0 and 100|required/.test(error.message) ? 400 : 500;
    return res.status(status).json({
      message: "Failed to approve quiz attempt",
      error: error.message,
    });
  }
}

export async function updateSubmissionGrade(req, res) {
  return approveSubmission(req, res);
}

export async function updateQuizAttemptGrade(req, res) {
  return approveQuizAttempt(req, res);
}
