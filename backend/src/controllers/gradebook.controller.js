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
  getReviewStatus,
  isReleasedToStudent,
  normalizeReviewStatus,
  normalizeTeacherReviewStatus,
  REVIEW_STATUS,
  setReviewStatus,
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
import {
  buildAssignmentQuestionReviews,
  buildQuizQuestionReviews,
  computeQuestionReviewPercentage,
  mergeStoredQuestionReviews,
  summarizeQuestionReviewScores,
} from "../utils/reviewWorkflow.js";

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
    (item) => item.reviewStatus === REVIEW_STATUS.RETURNED,
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
  const reviewStatus = getReviewStatus(submission, "gradingStatus");

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
    reviewStatus,
    released: isReleasedToStudent(submission, "gradingStatus"),
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
  const reviewStatus = getReviewStatus(attempt, "status");

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
    reviewStatus,
    released: isReleasedToStudent(attempt, "status"),
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

  // Tenant isolation — always enforced
  const tenantId = getRequestTenantId(req);
  if (
    tenantId &&
    assignment.tenantId &&
    String(assignment.tenantId) !== String(tenantId)
  ) {
    return { error: { status: 403, message: "Not allowed to grade this submission" } };
  }

  if (isAdminLike(req)) {
    return { submission, assignment };
  }

  // Teacher must own the assignment OR be an active course member
  const ownsAssignment = toId(assignment.teacher) === String(req.user._id);
  const courseAccessible = await canAccessCourse({ courseId: assignment.workspace, req });
  if (!ownsAssignment && !courseAccessible) {
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

  // Tenant isolation — always enforced
  const tenantId = getRequestTenantId(req);
  if (
    tenantId &&
    quiz.tenantId &&
    String(quiz.tenantId) !== String(tenantId)
  ) {
    return { error: { status: 403, message: "Not allowed to grade this quiz attempt" } };
  }

  if (isAdminLike(req)) {
    return { attempt, quiz };
  }

  // Teacher must own the quiz OR be an active course member
  const ownsQuiz = toId(quiz.teacher) === String(req.user._id);
  const courseAccessible = await canAccessCourse({ courseId: quiz.workspace, req });
  if (!ownsQuiz && !courseAccessible) {
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

function normalizeFeedback(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function parseQuestionScore(value, maxScore, fieldName = "question score") {
  if (value === undefined || value === null || value === "") return null;

  const parsed = Number(value);
  const safeMax = Math.max(Number(maxScore || 0), 0);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > safeMax) {
    throw new Error(`${fieldName} must be between 0 and ${safeMax}`);
  }

  return parsed;
}

function buildSubmissionReviewQuestions(submission, assignment) {
  const fallbackRows = buildAssignmentQuestionReviews({
    assignment,
    submission,
  });
  return mergeStoredQuestionReviews(fallbackRows, submission.questionReviews || []);
}

function buildQuizReviewQuestions(attempt, quiz) {
  const fallbackRows = buildQuizQuestionReviews({
    quiz,
    attempt,
  });
  return mergeStoredQuestionReviews(fallbackRows, attempt.questionReviews || []);
}

function applyTeacherQuestionReviewUpdates(currentRows = [], updates = []) {
  const normalizedRows = mergeStoredQuestionReviews(currentRows, currentRows);
  if (!Array.isArray(updates) || !updates.length) {
    return normalizedRows;
  }

  const byQuestionId = new Map(
    normalizedRows.map((row) => [String(row.questionId), { ...row }]),
  );

  for (const update of updates) {
    const questionId = String(update?.questionId || update?.id || "").trim();
    if (!questionId) {
      throw new Error("Each question review update must include questionId");
    }

    const current = byQuestionId.get(questionId);
    if (!current) {
      throw new Error(`Question ${questionId} was not found on this submission`);
    }

    if (Object.prototype.hasOwnProperty.call(update, "teacherScore")) {
      current.teacherScore = parseQuestionScore(
        update.teacherScore,
        current.maxScore,
        `teacherScore for ${questionId}`,
      );
    }

    if (Object.prototype.hasOwnProperty.call(update, "teacherFeedback")) {
      current.teacherFeedback = normalizeFeedback(update.teacherFeedback) || "";
    }

    byQuestionId.set(questionId, current);
  }

  return normalizedRows.map((row) => byQuestionId.get(String(row.questionId)) || row);
}

function resolveReviewMutation({
  record,
  score,
  feedback,
  reviewStatus,
  questionUpdates,
}) {
  const updatedQuestions = applyTeacherQuestionReviewUpdates(
    record.questionReviews || [],
    questionUpdates,
  );
  const hasQuestionUpdates = Array.isArray(questionUpdates) && questionUpdates.length > 0;
  const derivedScore = hasQuestionUpdates
    ? computeQuestionReviewPercentage(updatedQuestions, getCurrentScore(record))
    : undefined;
  const explicitScore = parseScore(score, "score");

  return {
    updatedQuestions,
    effectiveScore:
      explicitScore !== undefined
        ? explicitScore
        : derivedScore !== undefined
          ? derivedScore
          : getCurrentScore(record),
    effectiveFeedback:
      feedback === undefined ? getCurrentFeedback(record) : normalizeFeedback(feedback) || "",
    reviewStatus: normalizeTeacherReviewStatus(
      reviewStatus,
      getReviewStatus(record),
    ),
  };
}

function clearReturnedState(record = {}) {
  record.finalScore = null;
  record.finalFeedback = "";
  record.teacherApprovedAt = null;
  record.teacherApprovedBy = null;
  record.returnedAt = null;
  if (record.grade !== undefined) {
    record.grade = null;
  }
  if (record.gradedBy !== undefined && record.gradedBy === "TEACHER") {
    record.gradedBy = record.aiScore !== null && record.aiScore !== undefined
      ? "AI"
      : "NONE";
  }
}

async function persistSubmissionReview(req, submission, assignment, {
  score,
  feedback,
  reviewStatus,
  questionUpdates = [],
  approve = false,
  action = "review",
}) {
  submission.questionReviews = buildSubmissionReviewQuestions(submission, assignment);
  const mutation = resolveReviewMutation({
    record: submission,
    score: score === undefined ? undefined : score,
    feedback,
    reviewStatus,
    questionUpdates,
  });
  const metadata = {
    assignmentId: assignment._id,
    courseId: assignment.workspace,
  };
  const shouldFinalize =
    approve || mutation.reviewStatus === REVIEW_STATUS.RETURNED;

  submission.questionReviews = mutation.updatedQuestions;

  if (
    mutation.effectiveScore !== null ||
    feedback !== undefined ||
    questionUpdates.length ||
    !shouldFinalize
  ) {
    applyTeacherReviewState(submission, {
      actorId: req.user?._id,
      actorRole: normalizeRoleValue(req.user?.role),
      statusField: "gradingStatus",
      score: mutation.effectiveScore,
      feedback: mutation.effectiveFeedback,
      metadata,
    });
  }

  setReviewStatus(
    submission,
    shouldFinalize ? REVIEW_STATUS.RETURNED : mutation.reviewStatus,
  );

  if (!shouldFinalize) {
    clearReturnedState(submission);
  }

  if (shouldFinalize) {
    applyFinalApprovalState(submission, {
      actorId: req.user?._id,
      actorRole: normalizeRoleValue(req.user?.role),
      statusField: "gradingStatus",
      score: mutation.effectiveScore,
      feedback: mutation.effectiveFeedback,
      metadata,
    });
  }

  await submission.save();

  await writeReviewAudit(req, {
    tenantId: submission.tenantId || assignment.tenantId || null,
    type: shouldFinalize ? "GRADE_APPROVED" : "GRADE_REVIEW_DRAFTED",
    message: shouldFinalize
      ? `Approved final grade for assignment submission ${submission._id}`
      : `Drafted teacher review for assignment submission ${submission._id}`,
    meta: {
      submissionId: submission._id,
      assignmentId: assignment._id,
      score: getCurrentScore(submission),
      approved: shouldFinalize,
      action,
      reviewStatus: submission.reviewStatus,
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
    type: shouldFinalize ? "grade" : "teacher_review",
    status: shouldFinalize ? "success" : "updated",
    requestId,
    entityType: "submission",
    entityId: submission._id,
    message: shouldFinalize
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
      reviewStatus: submission.reviewStatus,
    },
  });

  return fresh;
}

async function persistQuizReview(req, attempt, quiz, {
  score,
  feedback,
  reviewStatus,
  questionUpdates = [],
  approve = false,
  action = "review",
}) {
  attempt.questionReviews = buildQuizReviewQuestions(attempt, quiz);
  const mutation = resolveReviewMutation({
    record: attempt,
    score,
    feedback,
    reviewStatus,
    questionUpdates,
  });
  const metadata = {
    quizId: quiz._id,
    courseId: quiz.workspace,
  };
  const shouldFinalize =
    approve || mutation.reviewStatus === REVIEW_STATUS.RETURNED;

  attempt.questionReviews = mutation.updatedQuestions;

  if (
    mutation.effectiveScore !== null ||
    feedback !== undefined ||
    questionUpdates.length ||
    !shouldFinalize
  ) {
    applyTeacherReviewState(attempt, {
      actorId: req.user?._id,
      actorRole: normalizeRoleValue(req.user?.role),
      statusField: "status",
      score: mutation.effectiveScore,
      feedback: mutation.effectiveFeedback,
      metadata,
    });
  }

  setReviewStatus(
    attempt,
    shouldFinalize ? REVIEW_STATUS.RETURNED : mutation.reviewStatus,
  );

  if (!shouldFinalize) {
    clearReturnedState(attempt);
  }

  if (shouldFinalize) {
    applyFinalApprovalState(attempt, {
      actorId: req.user?._id,
      actorRole: normalizeRoleValue(req.user?.role),
      statusField: "status",
      score: mutation.effectiveScore,
      feedback: mutation.effectiveFeedback,
      metadata,
    });
    attempt.locked = true;
  }

  await attempt.save();

  await writeReviewAudit(req, {
    tenantId: attempt.tenantId || quiz.tenantId || null,
    type: shouldFinalize ? "QUIZ_GRADE_APPROVED" : "QUIZ_REVIEW_DRAFTED",
    message: shouldFinalize
      ? `Approved final quiz grade for attempt ${attempt._id}`
      : `Drafted teacher review for quiz attempt ${attempt._id}`,
    meta: {
      attemptId: attempt._id,
      quizId: quiz._id,
      score: getCurrentScore(attempt),
      approved: shouldFinalize,
      action,
      reviewStatus: attempt.reviewStatus,
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
    type: shouldFinalize ? "grade" : "teacher_review",
    status: shouldFinalize ? "success" : "updated",
    requestId,
    entityType: "quiz_attempt",
    entityId: attempt._id,
    message: shouldFinalize
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
      reviewStatus: attempt.reviewStatus,
    },
  });

  return fresh;
}

export async function listGradebook(req, res) {
  try {
    const role = normalizeRoleValue(req.user?.role);
    const tenantId = getRequestTenantId(req);
    const requestedCourseId = req.query.courseId || null;
    const requestedStudentId = req.query.studentId || null;

    if (requestedCourseId && !isValidObjectId(requestedCourseId)) {
      return res.status(400).json({ message: "Invalid courseId" });
    }
    if (requestedStudentId && !isValidObjectId(requestedStudentId)) {
      return res.status(400).json({ message: "Invalid studentId" });
    }

    // Validate explicit courseId access when provided
    if (requestedCourseId) {
      const course = await Course.findById(requestedCourseId).select(
        "_id tenantId createdBy deleted",
      );
      if (!course || course.deleted) {
        return res.status(404).json({ message: "Course not found" });
      }
      if (
        tenantId &&
        course.tenantId &&
        String(course.tenantId) !== String(tenantId)
      ) {
        return res.status(403).json({ message: "Not allowed to access this course" });
      }
      if (role === "STUDENT") {
        const ctx = await getStudentAcademicContext(req.user._id, tenantId);
        if (!ctx.courseIds.includes(String(requestedCourseId))) {
          return res.status(403).json({ message: "Not allowed to access this course" });
        }
      }
    }

    let submissionFilter = { deleted: false };
    let attemptFilter = { deleted: false, status: { $ne: "in_progress" } };

    if (tenantId) {
      submissionFilter.tenantId = tenantId;
      attemptFilter.tenantId = tenantId;
    }

    if (role === "STUDENT") {
      // Students see only their own submissions/attempts in their enrolled courses
      const ctx = await getStudentAcademicContext(req.user._id, tenantId);
      const courseIds = requestedCourseId
        ? [requestedCourseId]
        : ctx.courseIds;

      if (!courseIds.length) {
        return res.json({ items: [], summary: buildSummary([]) });
      }

      submissionFilter.workspaceId = { $in: courseIds };
      submissionFilter.studentId = req.user._id;
      attemptFilter.workspaceId = { $in: courseIds };
      attemptFilter.studentId = req.user._id;
    } else if (role === "TEACHER") {
      // Teachers see all submissions/attempts for assessments they created.
      // Do NOT gate on courseIds — teachers may create quizzes/assignments in courses
      // they are not formally a CourseMember of.
      const teacherFilter = {
        teacher: req.user._id,
        deleted: false,
      };
      if (tenantId) teacherFilter.tenantId = tenantId;
      if (requestedCourseId) teacherFilter.workspace = requestedCourseId;

      const [ownedAssignments, ownedQuizzes] = await Promise.all([
        Assignment.find(teacherFilter).select("_id").lean(),
        Quiz.find(teacherFilter).select("_id").lean(),
      ]);

      const assignmentIds = ownedAssignments.map((a) => a._id);
      const quizIds = ownedQuizzes.map((q) => q._id);

      // If teacher has no owned content at all, short-circuit (no rows possible)
      if (!assignmentIds.length && !quizIds.length) {
        return res.json({ items: [], summary: buildSummary([]) });
      }

      delete submissionFilter.tenantId; // already scoped via assignment ownership
      delete attemptFilter.tenantId;

      submissionFilter.assignmentId = {
        $in: assignmentIds.length ? assignmentIds : [null],
      };
      attemptFilter.quizId = {
        $in: quizIds.length ? quizIds : [null],
      };

      if (requestedStudentId) {
        submissionFilter.studentId = requestedStudentId;
        attemptFilter.studentId = requestedStudentId;
      }
    } else {
      // ADMIN / SUPERADMIN: tenant-scoped, optionally filtered by course
      if (requestedCourseId) {
        submissionFilter.workspaceId = requestedCourseId;
        attemptFilter.workspaceId = requestedCourseId;
      }
      if (requestedStudentId) {
        submissionFilter.studentId = requestedStudentId;
        attemptFilter.studentId = requestedStudentId;
      }
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
      ...submissions.map((s) => serializeSubmissionGradebook(s)),
      ...attempts.map((a) => serializeQuizGradebook(a)),
    ].sort(sortByLatest);

    if (role === "STUDENT") {
      items = items.map((item) =>
        item.released
          ? {
              ...item,
              aiScore: null,
              aiFeedback: "",
              teacherAdjustedScore: null,
              teacherAdjustedFeedback: "",
            }
          : {
              ...item,
              score: null,
              feedback: "",
              aiScore: null,
              aiFeedback: "",
              teacherAdjustedScore: null,
              teacherAdjustedFeedback: "",
              finalScore: null,
              finalFeedback: "",
            },
      );
    }

    return res.json({
      items,
      summary: buildSummary(items),
    });
  } catch (error) {
    const isClientError =
      /Invalid courseId|Invalid studentId|Not allowed|not found/i.test(
        error.message,
      );
    return res.status(isClientError ? 403 : 500).json({
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
      reviewStatus: req.body?.reviewStatus || REVIEW_STATUS.REVIEWED,
      questionUpdates: req.body?.questions || req.body?.questionReviews || [],
      approve: false,
      action: "draft_review",
    });

    return res.json({
      message: "Submission review updated",
      item: serializeSubmissionGradebook(fresh),
    });
  } catch (error) {
    const status = /between 0 and/.test(error.message) ? 400 : 500;
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
      reviewStatus: REVIEW_STATUS.RETURNED,
      questionUpdates: req.body?.questions || req.body?.questionReviews || [],
      approve: true,
      action: "approve",
    });

    return res.json({
      message: "Submission grade approved",
      item: serializeSubmissionGradebook(fresh),
    });
  } catch (error) {
    const status = /between 0 and|required/.test(error.message) ? 400 : 500;
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
      reviewStatus: req.body?.reviewStatus || REVIEW_STATUS.REVIEWED,
      questionUpdates: req.body?.questions || req.body?.questionReviews || [],
      approve: false,
      action: "draft_review",
    });

    return res.json({
      message: "Quiz review updated",
      item: serializeQuizGradebook(fresh),
    });
  } catch (error) {
    const status = /between 0 and/.test(error.message) ? 400 : 500;
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
      reviewStatus: REVIEW_STATUS.RETURNED,
      questionUpdates: req.body?.questions || req.body?.questionReviews || [],
      approve: true,
      action: "approve",
    });

    return res.json({
      message: "Quiz attempt approved",
      item: serializeQuizGradebook(fresh),
    });
  } catch (error) {
    const status = /between 0 and|required/.test(error.message) ? 400 : 500;
    return res.status(status).json({
      message: "Failed to approve quiz attempt",
      error: error.message,
    });
  }
}

export async function updateSubmissionGrade(req, res) {
  try {
    if (!isTeacherLike(req)) {
      return res.status(403).json({ message: "Only teachers and admins can update grades" });
    }

    const { submissionId } = req.params;
    if (!isValidObjectId(submissionId)) {
      return res.status(400).json({ message: "Invalid submission id" });
    }

    const found = await loadSubmissionContext(req, submissionId);
    if (found?.error) {
      return res.status(found.error.status).json({ message: found.error.message });
    }

    const requestedReviewStatus = normalizeTeacherReviewStatus(
      req.body?.reviewStatus,
      REVIEW_STATUS.REVIEWED,
    );
    const fresh = await persistSubmissionReview(req, found.submission, found.assignment, {
      score: req.body?.grade ?? req.body?.score,
      feedback: req.body?.feedback ?? req.body?.finalFeedback,
      reviewStatus: requestedReviewStatus,
      questionUpdates: req.body?.questions || req.body?.questionReviews || [],
      approve:
        Boolean(req.body?.approve || req.body?.releaseToStudent) ||
        requestedReviewStatus === REVIEW_STATUS.RETURNED,
      action: "patch_review",
    });

    return res.json({
      message: "Submission review updated",
      item: serializeSubmissionGradebook(fresh),
    });
  } catch (error) {
    const status = /between 0 and/.test(error.message) ? 400 : 500;
    return res.status(status).json({
      message: "Failed to update submission review",
      error: error.message,
    });
  }
}

export async function updateQuizAttemptGrade(req, res) {
  try {
    if (!isTeacherLike(req)) {
      return res.status(403).json({ message: "Only teachers and admins can update grades" });
    }

    const { attemptId } = req.params;
    if (!isValidObjectId(attemptId)) {
      return res.status(400).json({ message: "Invalid attempt id" });
    }

    const found = await loadQuizAttemptContext(req, attemptId);
    if (found?.error) {
      return res.status(found.error.status).json({ message: found.error.message });
    }

    const requestedReviewStatus = normalizeTeacherReviewStatus(
      req.body?.reviewStatus,
      REVIEW_STATUS.REVIEWED,
    );
    const fresh = await persistQuizReview(req, found.attempt, found.quiz, {
      score: req.body?.score,
      feedback: req.body?.feedback ?? req.body?.finalFeedback,
      reviewStatus: requestedReviewStatus,
      questionUpdates: req.body?.questions || req.body?.questionReviews || [],
      approve:
        Boolean(req.body?.approve || req.body?.releaseToStudent) ||
        requestedReviewStatus === REVIEW_STATUS.RETURNED,
      action: "patch_review",
    });

    return res.json({
      message: "Quiz review updated",
      item: serializeQuizGradebook(fresh),
    });
  } catch (error) {
    const status = /between 0 and/.test(error.message) ? 400 : 500;
    return res.status(status).json({
      message: "Failed to update quiz review",
      error: error.message,
    });
  }
}

export async function getSubmissionDetail(req, res) {
  try {
    if (!isTeacherLike(req)) {
      return res.status(403).json({ message: "Only teachers and admins can view submission details" });
    }

    const { submissionId } = req.params;
    if (!isValidObjectId(submissionId)) {
      return res.status(400).json({ message: "Invalid submission id" });
    }

    const found = await loadSubmissionContext(req, submissionId);
    if (found?.error) {
      return res.status(found.error.status).json({ message: found.error.message });
    }

    const submission = await Submission.findById(submissionId)
      .populate("assignmentId", "title description instructions maxScore type")
      .populate("studentId", userFields)
      .populate("workspaceId", "title")
      .lean();

    const gradingStatus = normalizeReviewStatus(submission.gradingStatus, GRADING_STATUS.SUBMITTED);
    const reviewQuestions = buildSubmissionReviewQuestions(
      submission,
      submission.assignmentId,
    );
    const questionSummary = summarizeQuestionReviewScores(reviewQuestions);
    const reviewStatus = getReviewStatus(submission, "gradingStatus");

    return res.json({
      submission: {
        _id: toId(submission._id),
        kind: "assignment",
        title: submission.assignmentId?.title || "Assignment",
        courseTitle: submission.workspaceId?.title || "",
        student: submission.studentId || null,
        assignment: submission.assignmentId || null,
        textSubmission: submission.textSubmission || "",
        answers: submission.answers || null,
        files: submission.files || [],
        questions: reviewQuestions,
        submittedAt: submission.submittedAt || submission.createdAt || null,
        gradingStatus,
        reviewStatus,
        status: reviewStatus,
        released: isReleasedToStudent(submission, "gradingStatus"),
        score: getCurrentScore(submission),
        maxScore: Number(submission.assignmentId?.maxScore || 100),
        feedback: getCurrentFeedback(submission),
        aiScore: submission.aiScore ?? null,
        aiFeedback: submission.aiFeedback || "",
        aiGradedAt: submission.aiGradedAt || null,
        teacherAdjustedScore: submission.teacherAdjustedScore ?? null,
        teacherAdjustedFeedback: submission.teacherAdjustedFeedback || "",
        finalScore: submission.finalScore ?? null,
        finalFeedback: submission.finalFeedback || "",
        adjustedByTeacher: Boolean(submission.adjustedByTeacher),
        teacherApprovedAt: submission.teacherApprovedAt || null,
        reviewedAt: submission.reviewedAt || null,
        returnedAt: submission.returnedAt || null,
        questionSummary,
        gradingAudit: (submission.gradingAudit || []).slice(-10),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load submission detail", error: error.message });
  }
}

export async function getQuizAttemptDetail(req, res) {
  try {
    if (!isTeacherLike(req)) {
      return res.status(403).json({ message: "Only teachers and admins can view attempt details" });
    }

    const { attemptId } = req.params;
    if (!isValidObjectId(attemptId)) {
      return res.status(400).json({ message: "Invalid attempt id" });
    }

    const found = await loadQuizAttemptContext(req, attemptId);
    if (found?.error) {
      return res.status(found.error.status).json({ message: found.error.message });
    }

    const [attempt, quiz] = await Promise.all([
      QuizAttempt.findById(attemptId)
        .populate("studentId", userFields)
        .populate("workspaceId", "title")
        .lean(),
      Quiz.findById(found.attempt.quizId)
        .select("+questions +questions.correctAnswer")
        .lean(),
    ]);

    const gradingStatus = normalizeReviewStatus(attempt.status, ATTEMPT_STATUS.SUBMITTED);

    // Build review questions. If the quiz definition is unavailable or has no
    // questions, fall back to the question reviews snapshotted at submit time so
    // the teacher still sees answers and can grade them.
    let reviewQuestions = buildQuizReviewQuestions(attempt, quiz);
    if (
      !reviewQuestions.length &&
      Array.isArray(attempt.questionReviews) &&
      attempt.questionReviews.length
    ) {
      reviewQuestions = mergeStoredQuestionReviews(
        attempt.questionReviews,
        attempt.questionReviews,
      );
    }

    const questionSummary = summarizeQuestionReviewScores(reviewQuestions);
    const reviewStatus = getReviewStatus(attempt, "status");

    return res.json({
      attempt: {
        _id: toId(attempt._id),
        kind: "quiz",
        title: quiz?.title || "Quiz",
        courseTitle: attempt.workspaceId?.title || "",
        student: attempt.studentId || null,
        questions: reviewQuestions,
        timeSpent: attempt.timeSpent || 0,
        submittedAt: attempt.submittedAt || attempt.createdAt || null,
        gradingStatus,
        reviewStatus,
        status: reviewStatus,
        released: isReleasedToStudent(attempt, "status"),
        score: getCurrentScore(attempt),
        maxScore: Number(attempt.maxScore || quiz?.totalPoints || 0),
        feedback: getCurrentFeedback(attempt),
        aiScore: attempt.aiScore ?? null,
        aiFeedback: attempt.aiFeedback || "",
        aiGradedAt: attempt.aiGradedAt || null,
        teacherAdjustedScore: attempt.teacherAdjustedScore ?? null,
        teacherAdjustedFeedback: attempt.teacherAdjustedFeedback || "",
        finalScore: attempt.finalScore ?? null,
        finalFeedback: attempt.finalFeedback || "",
        adjustedByTeacher: Boolean(attempt.adjustedByTeacher),
        teacherApprovedAt: attempt.teacherApprovedAt || null,
        reviewedAt: attempt.reviewedAt || null,
        returnedAt: attempt.returnedAt || null,
        questionSummary,
        gradingAudit: (attempt.gradingAudit || []).slice(-10),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load quiz attempt detail", error: error.message });
  }
}

function buildStudentVisibleQuestions(reviewQuestions = []) {
  return reviewQuestions.map((question) => ({
    position: question.position,
    questionId: question.questionId,
    questionType: question.questionType,
    questionText: question.questionText,
    prompt: question.prompt || "",
    options: question.options || [],
    correctAnswer: question.correctAnswer ?? null,
    explanation: question.explanation || "",
    studentAnswer: question.studentAnswer ?? null,
    uploadedFiles: question.uploadedFiles || [],
    maxScore: question.maxScore,
    teacherScore: question.teacherScore ?? null,
    teacherFeedback: question.teacherFeedback || "",
    aiScore: question.aiScore ?? null,
    aiFeedback: question.aiFeedback || "",
    autoScore: question.autoScore ?? null,
    isCorrect: question.isCorrect ?? null,
  }));
}

export async function getMySubmissionDetail(req, res) {
  try {
    const submissionId = req.params.submissionId;
    if (!isValidObjectId(submissionId)) {
      return res.status(400).json({ message: "Invalid submission id" });
    }

    const submission = await Submission.findOne({
      _id: submissionId,
      studentId: req.user._id,
      deleted: false,
    })
      .populate("assignmentId", "title description instructions maxScore type")
      .populate("workspaceId", "title")
      .lean();

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    const released = isReleasedToStudent(submission, "gradingStatus");
    if (!released) {
      return res.status(403).json({ message: "This submission has not been returned yet" });
    }

    const tenantId = getRequestTenantId(req);
    if (submission.tenantId && submission.tenantId !== tenantId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const assignment = submission.assignmentId || null;
    const reviewQuestions = buildSubmissionReviewQuestions(submission, assignment);
    const questionSummary = summarizeQuestionReviewScores(reviewQuestions);

    return res.json({
      submission: {
        _id: toId(submission._id),
        kind: "assignment",
        title: assignment?.title || "Assignment",
        courseTitle: submission.workspaceId?.title || "",
        submittedAt: submission.submittedAt || submission.createdAt || null,
        reviewStatus: submission.reviewStatus,
        released: true,
        score: getCurrentScore(submission),
        maxScore: Number(assignment?.maxScore || 100),
        feedback: getCurrentFeedback(submission),
        finalScore: submission.finalScore ?? null,
        finalFeedback: submission.finalFeedback || "",
        teacherApprovedAt: submission.teacherApprovedAt || null,
        returnedAt: submission.returnedAt || null,
        questions: buildStudentVisibleQuestions(reviewQuestions),
        questionSummary,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load submission detail", error: error.message });
  }
}

export async function getMyQuizAttemptDetail(req, res) {
  try {
    const attemptId = req.params.attemptId;
    if (!isValidObjectId(attemptId)) {
      return res.status(400).json({ message: "Invalid attempt id" });
    }

    const attempt = await QuizAttempt.findOne({
      _id: attemptId,
      studentId: req.user._id,
      deleted: false,
    })
      .populate("workspaceId", "title")
      .lean();

    if (!attempt) {
      return res.status(404).json({ message: "Quiz attempt not found" });
    }

    const released = isReleasedToStudent(attempt, "status");
    if (!released) {
      return res.status(403).json({ message: "This quiz attempt has not been returned yet" });
    }

    const tenantId = getRequestTenantId(req);
    if (attempt.tenantId && attempt.tenantId !== tenantId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const quiz = await Quiz.findById(attempt.quizId)
      .select("+questions.correctAnswer")
      .lean();

    const reviewQuestions = buildQuizReviewQuestions(attempt, quiz);
    const questionSummary = summarizeQuestionReviewScores(reviewQuestions);

    return res.json({
      attempt: {
        _id: toId(attempt._id),
        kind: "quiz",
        title: quiz?.title || "Quiz",
        courseTitle: attempt.workspaceId?.title || "",
        timeSpent: attempt.timeSpent || 0,
        submittedAt: attempt.submittedAt || attempt.createdAt || null,
        reviewStatus: attempt.reviewStatus,
        released: true,
        score: getCurrentScore(attempt),
        maxScore: Number(attempt.maxScore || quiz?.totalPoints || 0),
        feedback: getCurrentFeedback(attempt),
        finalScore: attempt.finalScore ?? null,
        finalFeedback: attempt.finalFeedback || "",
        teacherApprovedAt: attempt.teacherApprovedAt || null,
        returnedAt: attempt.returnedAt || null,
        questions: buildStudentVisibleQuestions(reviewQuestions),
        questionSummary,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load quiz attempt detail", error: error.message });
  }
}
