import Assignment from "../models/Assignment.js";
import AssignmentAssignment from "../models/AssignmentAssignment.js";
import Submission from "../models/Submission.js";
import Quiz from "../models/quiz.js";
import QuizAssignment from "../models/QuizAssignment.js";
import QuizAttempt from "../models/QuizAttempt.js";
import Leaderboard from "../models/leaderboardModel.js";
import Course from "../models/CourseModel.js";
import {
  gradeAssignmentSubmissionWithAi,
  gradeQuizAttemptWithAi,
} from "../services/ai/assessmentGradingService.js";
import {
  applyAiReviewState,
  applyFinalApprovalState,
  applyGradingDelayState,
  ATTEMPT_STATUS,
  getCurrentFeedback,
  getCurrentScore,
  GRADING_STATUS,
  isFinalized,
  normalizeReviewStatus,
} from "../services/gradingLifecycle.js";
import {
  buildActorFromRequest,
  emitRealtimeEvent,
} from "../socket/emitter.js";
import {
  answersInputToAttemptArray,
  attemptAnswersToMap,
  buildTenantMatch,
  getCorrectAnswerValue,
  getRequestTenantId,
  getStudentAcademicContext,
  hasStudentTargetAccess,
  isValidObjectId,
  normalizeSubmissionAnswers,
  serializeAssignment,
  serializeAttemptForStudent,
  serializeQuiz,
  serializeSubmissionForStudent,
  toId,
  userFields,
} from "../utils/academicContract.js";

const requestIdFromReq = (req) =>
  req.get?.("x-request-id") || req.headers?.["x-request-id"] || null;

const quizNeedsTeacherReview = (quiz) =>
  Array.isArray(quiz?.questions) &&
  quiz.questions.some((question) =>
    ["essay", "short_answer", "file_upload"].includes(
      String(question?.questionType || question?.type || "").trim().toLowerCase(),
    ),
  );

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

const getAssignmentTargetScope = async ({ studentId, courseIds, classroomIds, tenantId }) =>
  AssignmentAssignment.find({
    status: "assigned",
    ...buildTenantMatch(tenantId),
    $or: [
      { studentId },
      {
        studentId: null,
        classId: { $in: classroomIds.length ? classroomIds : [null] },
      },
      {
        studentId: null,
        classId: null,
        workspaceId: { $in: courseIds.length ? courseIds : [null] },
      },
    ],
  }).lean();

const getQuizTargetScope = async ({ studentId, courseIds, classroomIds, tenantId }) =>
  QuizAssignment.find({
    status: "assigned",
    ...buildTenantMatch(tenantId),
    $or: [
      { studentId },
      {
        studentId: null,
        classId: { $in: classroomIds.length ? classroomIds : [null] },
      },
      {
        studentId: null,
        classId: null,
        workspaceId: { $in: courseIds.length ? courseIds : [null] },
      },
    ],
  }).lean();

const pickPreferredTarget = (rows) => {
  const byOwner = new Map();

  const scoreRow = (row) => {
    if (row.studentId) return 3;
    if (row.classId) return 2;
    return 1;
  };

  rows
    .slice()
    .sort((a, b) => {
      const diff = scoreRow(b) - scoreRow(a);
      if (diff !== 0) return diff;
      return new Date(a.assignedAt || 0) - new Date(b.assignedAt || 0);
    })
    .forEach((row) => {
      const ownerId = toId(row.assignmentId || row.quizId);
      if (!ownerId || byOwner.has(ownerId)) return;
      byOwner.set(ownerId, row);
    });

  return byOwner;
};

const buildStudentFacingSubmission = (submission) => {
  return serializeSubmissionForStudent(submission);
};

const buildStudentFacingAttempt = (attempt) => {
  return serializeAttemptForStudent(attempt);
};

export const getAssignments = async (req, res) => {
  try {
    const studentId = req.user._id;
    const tenantId = getRequestTenantId(req);
    const requestedCourseId = req.query.courseId || null;
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const cursor = req.query.cursor || null;

    if (requestedCourseId && !isValidObjectId(requestedCourseId)) {
      return res.status(400).json({ success: false, error: "Invalid courseId" });
    }

    const context = await getStudentAcademicContext(studentId, tenantId);
    const courseIds = requestedCourseId
      ? context.courseIds.filter((id) => String(id) === String(requestedCourseId))
      : context.courseIds;

    if (requestedCourseId && !courseIds.length) {
      return res
        .status(403)
        .json({ success: false, message: "Not enrolled in this course" });
    }

    if (!courseIds.length) {
      return res.json({
        success: true,
        data: [],
        cursor: { next: null },
        count: 0,
      });
    }

    const [targetRows, targetScopeIds] = await Promise.all([
      getAssignmentTargetScope({
        studentId,
        courseIds,
        classroomIds: context.classroomIds,
        tenantId,
      }),
      AssignmentAssignment.distinct("assignmentId", {
        status: "assigned",
        ...buildTenantMatch(tenantId),
        workspaceId: { $in: courseIds },
      }),
    ]);

    const preferredTargets = pickPreferredTarget(targetRows);
    const targetedIds = Array.from(preferredTargets.keys());

    const assignmentFilter = {
      deleted: false,
      status: "published",
      ...buildTenantMatch(tenantId),
      $or: [
        { _id: { $in: targetedIds.length ? targetedIds : [null] } },
        {
          workspace: { $in: courseIds },
          _id: { $nin: targetScopeIds.length ? targetScopeIds : [null] },
        },
      ],
    };
    applyCursor(assignmentFilter, cursor);

    const assignments = await Assignment.find(assignmentFilter)
      .populate("teacher", userFields)
      .populate("class", "name grade section")
      .sort({ dueDate: 1, createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    const submissions = await Submission.find({
      assignmentId: {
        $in: assignments.length ? assignments.map((assignment) => assignment._id) : [null],
      },
      studentId,
      deleted: false,
    }).lean();

    const submissionsByAssignmentId = new Map(
      submissions.map((submission) => [String(submission.assignmentId), submission]),
    );

    return res.json({
      success: true,
      data: assignments.map((assignment) => {
        const target = preferredTargets.get(String(assignment._id)) || null;
        const submission = submissionsByAssignmentId.get(String(assignment._id)) || null;
        return serializeAssignment(assignment, {
          dueDate: target?.dueDate || assignment.dueDate,
          assignedAt: target?.assignedAt || assignment.createdAt,
          targetId: target?._id || null,
          submission: submission ? buildStudentFacingSubmission(submission) : null,
        });
      }),
      cursor: { next: makeNextCursor(assignments, limit) },
      count: assignments.length,
    });
  } catch (err) {
    console.error("Get assignments error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch assignments" });
  }
};

export const submitAssignment = async (req, res) => {
  try {
    const studentId = req.user._id;
    const assignmentId = req.body.assignmentId;
    const files = req.files || [];
    const tenantId = getRequestTenantId(req);

    if (!isValidObjectId(assignmentId)) {
      return res
        .status(400)
        .json({ success: false, error: "assignmentId is required" });
    }

    const assignment = await Assignment.findById(assignmentId).select(
      "_id tenantId title description instructions type maxScore subject curriculum teacher workspace class dueDate status deleted",
    );
    if (!assignment || assignment.deleted) {
      return res
        .status(404)
        .json({ success: false, error: "Assignment not found" });
    }

    if (assignment.status !== "published") {
      return res
        .status(400)
        .json({ success: false, error: "Assignment is not available" });
    }

    if (assignment.dueDate && new Date() > new Date(assignment.dueDate)) {
      return res
        .status(400)
        .json({ success: false, error: "Assignment due date has passed" });
    }

    const courseId = toId(assignment.workspace);
    if (!courseId || !isValidObjectId(courseId)) {
      return res.status(409).json({
        success: false,
        error: "Assignment is missing a valid course relationship",
      });
    }

    const context = await getStudentAcademicContext(studentId, tenantId);
    if (!context.courseIds.includes(String(courseId))) {
      return res
        .status(403)
        .json({ success: false, error: "Not enrolled in this course" });
    }

    const hasAccess = await hasStudentTargetAccess({
      TargetModel: AssignmentAssignment,
      key: "assignmentId",
      ownerId: assignment._id,
      studentId,
      courseId,
      classroomIds: context.classroomIds,
      tenantId,
    });

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        error: "Assignment is not assigned to this student",
      });
    }

    const existingSubmission = await Submission.findOne({
      assignmentId: assignment._id,
      studentId,
      workspaceId: courseId,
      deleted: false,
    });
    if (existingSubmission) {
      return res.status(409).json({
        success: false,
        error: "Assignment has already been submitted",
      });
    }

    const submittedFiles = files.map((file) => ({
      name: file.originalname,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size,
    }));
    const structuredAnswers = normalizeSubmissionAnswers(req.body.answers);
    const textSubmission = String(req.body.textSubmission || "").trim();

    console.info("[assessment] assignment submission received", {
      assignmentId: toId(assignment._id),
      studentId: toId(studentId),
      courseId,
      hasTextSubmission: Boolean(textSubmission),
      hasStructuredAnswers: structuredAnswers !== null,
      fileCount: submittedFiles.length,
    });

    const submission = await Submission.create({
      tenantId: tenantId || assignment.tenantId || null,
      assignmentId: assignment._id,
      workspaceId: courseId,
      studentId,
      teacherId: assignment.teacher || null,
      classroomId: assignment.class || null,
      files: submittedFiles,
      answers: structuredAnswers,
      textSubmission,
      submittedAt: new Date(),
      gradingStatus: "submitted",
      gradedBy: "NONE",
      deleted: false,
      deletedAt: null,
      grade: null,
      score: 0,
    });

    let responseStatus = 202;
    let responseMessage =
      "Assignment submitted successfully. Teacher review is pending.";

    try {
      const aiResult = await gradeAssignmentSubmissionWithAi({
        assignment,
        submission,
        tenantId: tenantId || assignment.tenantId || null,
        actorUserId: req.user?._id || studentId,
      });

      applyAiReviewState(submission, {
        statusField: "gradingStatus",
        score: aiResult.score,
        feedback: aiResult.feedback,
        metadata: {
          assignmentId: assignment._id,
          gradedQuestions: aiResult.gradedQuestions.length,
        },
        reportId: aiResult.reportId,
      });
      await submission.save();
      responseMessage =
        "Assignment submitted successfully. AI review is awaiting teacher approval.";
    } catch (error) {
      applyGradingDelayState(submission, {
        statusField: "gradingStatus",
        error: error?.message || "AI grading delayed",
        metadata: {
          assignmentId: assignment._id,
          upstreamStatus:
            error?.upstreamStatus ||
            (error?.status >= 500 ? error.status : null),
        },
      });
      await submission.save();
      responseMessage =
        "Assignment submitted successfully. Grading is delayed and queued for teacher review.";
    }

    const requestId = requestIdFromReq(req);
    const studentUserId = toId(studentId);
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

    return res.status(responseStatus).json({
      success: true,
      message: responseMessage,
      submission: buildStudentFacingSubmission(submission),
      submissionId: submission._id,
    });
  } catch (err) {
    console.error("Submit assignment error:", err);
    emitRealtimeEvent({
      type: "submission",
      status: "failed",
      requestId: requestIdFromReq(req),
      entityType: "submission",
      entityId: req.body?.assignmentId || null,
      message: "Assignment submission failed. Please try again.",
      actor: buildActorFromRequest(req),
      targets: {
        userIds: req.user?._id ? [String(req.user._id)] : [],
        studentIds: req.user?._id ? [String(req.user._id)] : [],
      },
      meta: {
        assignmentId: req.body?.assignmentId || null,
      },
    });
    return res
      .status(500)
      .json({ success: false, error: "Failed to submit assignment" });
  }
};

export const getQuizzes = async (req, res) => {
  try {
    const studentId = req.user._id;
    const tenantId = getRequestTenantId(req);
    const requestedCourseId = req.query.courseId || null;
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const cursor = req.query.cursor || null;

    if (requestedCourseId && !isValidObjectId(requestedCourseId)) {
      return res.status(400).json({ success: false, error: "Invalid courseId" });
    }

    const context = await getStudentAcademicContext(studentId, tenantId);
    const courseIds = requestedCourseId
      ? context.courseIds.filter((id) => String(id) === String(requestedCourseId))
      : context.courseIds;

    if (requestedCourseId && !courseIds.length) {
      return res
        .status(403)
        .json({ success: false, message: "Not enrolled in this course" });
    }

    if (!courseIds.length) {
      return res.json({
        success: true,
        data: [],
        cursor: { next: null },
        count: 0,
      });
    }

    const [targetRows, targetScopeIds] = await Promise.all([
      getQuizTargetScope({
        studentId,
        courseIds,
        classroomIds: context.classroomIds,
        tenantId,
      }),
      QuizAssignment.distinct("quizId", {
        status: "assigned",
        ...buildTenantMatch(tenantId),
        workspaceId: { $in: courseIds },
      }),
    ]);

    const preferredTargets = pickPreferredTarget(targetRows);
    const targetedIds = Array.from(preferredTargets.keys());

    const quizFilter = {
      deleted: false,
      status: "published",
      ...buildTenantMatch(tenantId),
      $or: [
        { _id: { $in: targetedIds.length ? targetedIds : [null] } },
        {
          workspace: { $in: courseIds },
          _id: { $nin: targetScopeIds.length ? targetScopeIds : [null] },
        },
      ],
    };
    applyCursor(quizFilter, cursor);

    const quizzes = await Quiz.find(quizFilter)
      .select("-questions.correctAnswer")
      .populate("teacher", userFields)
      .populate("class", "name grade section")
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    const attempts = await QuizAttempt.find({
      quizId: { $in: quizzes.map((quiz) => quiz._id) },
      studentId,
      deleted: false,
    }).lean();

    const attemptsByQuizId = new Map(
      attempts.map((attempt) => [String(attempt.quizId), attempt]),
    );

    return res.json({
      success: true,
      data: quizzes.map((quiz) => {
        const target = preferredTargets.get(String(quiz._id)) || null;
        return serializeQuiz(quiz, {
          extras: {
            dueDate: target?.dueDate || null,
            assignedAt: target?.assignedAt || quiz.createdAt,
            targetId: target?._id || null,
            attempt: attemptsByQuizId.get(String(quiz._id))
              ? buildStudentFacingAttempt(attemptsByQuizId.get(String(quiz._id)))
              : null,
          },
        });
      }),
      cursor: { next: makeNextCursor(quizzes, limit) },
      count: quizzes.length,
    });
  } catch (err) {
    console.error("Get quizzes error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch quizzes" });
  }
};

export const startQuiz = async (req, res) => {
  try {
    const studentId = req.user._id;
    const tenantId = getRequestTenantId(req);
    const { quizId } = req.params;

    if (!isValidObjectId(quizId)) {
      return res.status(400).json({ success: false, error: "Invalid quizId" });
    }

    const quiz = await Quiz.findById(quizId)
      .select("-questions.correctAnswer")
      .populate("teacher", userFields);

    if (!quiz || quiz.deleted) {
      return res.status(404).json({ success: false, error: "Quiz not found" });
    }

    if (quiz.status !== "published") {
      return res
        .status(400)
        .json({ success: false, error: "Quiz not available" });
    }

    const courseId = toId(quiz.workspace);
    if (!courseId || !isValidObjectId(courseId)) {
      return res.status(409).json({
        success: false,
        error: "Quiz is missing a valid course relationship",
      });
    }

    const context = await getStudentAcademicContext(studentId, tenantId);
    if (!context.courseIds.includes(String(courseId))) {
      return res
        .status(403)
        .json({ success: false, error: "Not enrolled in this course" });
    }

    const hasAccess = await hasStudentTargetAccess({
      TargetModel: QuizAssignment,
      key: "quizId",
      ownerId: quiz._id,
      studentId,
      courseId,
      classroomIds: context.classroomIds,
      tenantId,
    });

    if (!hasAccess) {
      return res
        .status(403)
        .json({ success: false, error: "Quiz is not assigned to this student" });
    }

    let attempt = await QuizAttempt.findOne({
      quizId,
      studentId,
      deleted: false,
    });

    if (attempt && attempt.status !== "in_progress") {
      return res.status(400).json({
        success: false,
        error: "You already submitted this quiz",
      });
    }

    if (!attempt) {
      attempt = await QuizAttempt.create({
        tenantId: tenantId || quiz.tenantId || null,
        quizId,
        workspaceId: courseId,
        studentId,
        status: "in_progress",
        startedAt: new Date(),
        locked: false,
      });
    }

    return res.json({
      success: true,
      attemptId: attempt._id,
      attempt: buildStudentFacingAttempt(attempt),
      quiz: serializeQuiz(quiz, { includeAnswers: false }),
    });
  } catch (err) {
    console.error("Start quiz error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to start quiz" });
  }
};

export const submitQuiz = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { quizId, attemptId } = req.params;
    const tenantId = getRequestTenantId(req);
    const requestId = requestIdFromReq(req);

    if (!isValidObjectId(quizId) || !isValidObjectId(attemptId)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid quizId or attemptId" });
    }

    const quiz = await Quiz.findById(quizId).select("+questions.correctAnswer");
    if (!quiz || quiz.deleted) {
      return res.status(404).json({ success: false, error: "Quiz not found" });
    }

    const attempt = await QuizAttempt.findById(attemptId);
    if (!attempt || String(attempt.studentId) !== String(studentId)) {
      return res
        .status(404)
        .json({ success: false, error: "Quiz attempt not found" });
    }

    if (String(attempt.quizId) !== String(quizId)) {
      return res
        .status(400)
        .json({ success: false, error: "Attempt does not belong to quiz" });
    }

    if (attempt.status !== "in_progress") {
      const released = isFinalized(attempt, "status");
      return res.json({
        success: true,
        score: released ? getCurrentScore(attempt) : null,
        passed:
          released && getCurrentScore(attempt) !== null
            ? getCurrentScore(attempt) >= (quiz.passingScore ?? 60)
            : false,
        timeSpent: attempt.timeSpent,
        showResults: quiz.showResults,
        attempt: buildStudentFacingAttempt(attempt),
      });
    }

    const rawAnswers = answersInputToAttemptArray(quiz, req.body.answers);
    let pointsEarnedTotal = 0;

    const processedAnswers = rawAnswers.map((answer) => {
      const question = quiz.questions.id(answer.questionId);
      if (!question) return null;

      let isCorrect = null;
      let pointsEarned = 0;

      if (question.questionType === "multiple_choice") {
        const expected = String(getCorrectAnswerValue(question) || "")
          .trim()
          .toUpperCase();
        const submitted = String(answer.answer || "")
          .trim()
          .toUpperCase();
        isCorrect = expected && submitted ? expected === submitted : false;
      } else if (question.questionType === "true_false") {
        const expected = String(getCorrectAnswerValue(question) || "")
          .trim()
          .toLowerCase();
        const submitted = String(answer.answer || "")
          .trim()
          .toLowerCase();
        isCorrect = expected === submitted;
      }

      if (isCorrect) {
        pointsEarned = Number(question.points || 0);
        pointsEarnedTotal += pointsEarned;
      }

      return {
        questionId: question._id,
        answer: answer.answer ?? null,
        uploadedFiles: Array.isArray(answer.uploadedFiles) ? answer.uploadedFiles : [],
        isCorrect,
        pointsEarned,
      };
    }).filter(Boolean);

    const totalPoints =
      Number(quiz.totalPoints) ||
      quiz.questions.reduce((sum, question) => sum + Number(question.points || 0), 0);
    const percentageScore =
      totalPoints > 0 ? Math.round((pointsEarnedTotal / totalPoints) * 10000) / 100 : 0;
    const requiresManualReview = quizNeedsTeacherReview(quiz);
    const courseId = toId(quiz.workspace);
    const teacherUserId = toId(quiz.teacher);
    const classroomId = toId(quiz.class);

    emitRealtimeEvent({
      type: "grading",
      status: "started",
      requestId,
      entityType: "quiz_attempt",
      entityId: attempt._id,
      message: requiresManualReview
        ? "Quiz submission received. Teacher review is required."
        : "Quiz submission received. Grading is in progress.",
      actor: buildActorFromRequest(req),
      targets: {
        userIds: [String(studentId)],
        studentIds: [String(studentId)],
        teacherIds: teacherUserId ? [teacherUserId] : [],
      },
      meta: {
        quizId: toId(quiz._id),
        courseId,
        classroomId,
        requiresManualReview,
      },
    });

    attempt.tenantId = attempt.tenantId || tenantId || quiz.tenantId || null;
    attempt.workspaceId = attempt.workspaceId || quiz.workspace || null;
    attempt.answers = processedAnswers;
    attempt.pointsEarnedTotal = pointsEarnedTotal;
    attempt.maxScore = totalPoints;
    attempt.submittedAt = new Date();
    attempt.timeSpent = Math.max(
      attempt.timeSpent || 0,
      Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000),
    );
    attempt.locked = true;

    let responseStatus = 202;
    let responseMessage =
      "Quiz submitted successfully. Teacher review is pending.";
    let responseScore = null;
    let responsePassed = false;

    if (requiresManualReview) {
      attempt.status = "submitted";

      try {
        const aiResult = await gradeQuizAttemptWithAi({
          quiz,
          attempt,
          tenantId: tenantId || quiz.tenantId || null,
          actorUserId: req.user?._id || studentId,
        });

        applyAiReviewState(attempt, {
          statusField: "status",
          score: aiResult.score,
          feedback: aiResult.feedback,
          metadata: {
            quizId: quiz._id,
            gradedQuestions: aiResult.gradedQuestions.length,
          },
          reportId: aiResult.reportId,
        });
        responseMessage =
          "Quiz submitted successfully. AI review is awaiting teacher approval.";
      } catch (error) {
        applyGradingDelayState(attempt, {
          statusField: "status",
          error: error?.message || "AI grading delayed",
          metadata: {
            quizId: quiz._id,
            upstreamStatus:
              error?.upstreamStatus ||
              (error?.status >= 500 ? error.status : null),
          },
        });
        responseMessage =
          "Quiz submitted successfully. Grading is delayed and queued for teacher review.";
      }

      await attempt.save();

      emitRealtimeEvent({
        type: "teacher_review",
        status: "updated",
        requestId,
        entityType: "quiz_attempt",
        entityId: attempt._id,
        message: "A submitted quiz attempt is waiting for teacher review.",
        actor: buildActorFromRequest(req),
        targets: {
          teacherIds: teacherUserId ? [teacherUserId] : [],
        },
        meta: {
          action: "submitted_for_review",
          quizId: toId(quiz._id),
          studentId: toId(studentId),
          courseId,
          classroomId,
          score: getCurrentScore(attempt),
        },
      });
    } else {
      applyFinalApprovalState(attempt, {
        actorId: null,
        actorRole: "SYSTEM",
        statusField: "status",
        score: percentageScore,
        feedback: "Automatically finalized from objective quiz scoring.",
        metadata: {
          quizId: quiz._id,
          scoringMode: "objective_only",
        },
        source: "system",
      });
      await attempt.save();

      if (percentageScore >= (quiz.passingScore ?? 60)) {
        await updateLeaderboard(studentId, percentageScore, {
          tenantId: tenantId || quiz.tenantId || null,
          courseId,
          classId: classroomId,
          subject: quiz.subject || null,
        });
      }

      responseStatus = 200;
      responseMessage = "Quiz graded successfully.";
      responseScore = percentageScore;
      responsePassed = percentageScore >= (quiz.passingScore ?? 60);

      emitRealtimeEvent({
        type: "grading",
        status: "success",
        requestId,
        entityType: "quiz_attempt",
        entityId: attempt._id,
        message: "Quiz graded successfully.",
        actor: buildActorFromRequest(req),
        targets: {
          userIds: [String(studentId)],
          studentIds: [String(studentId)],
          teacherIds: teacherUserId ? [teacherUserId] : [],
        },
        meta: {
          quizId: toId(quiz._id),
          courseId,
          classroomId,
          score: percentageScore,
          passed: percentageScore >= (quiz.passingScore ?? 60),
        },
      });
    }

    return res.status(responseStatus).json({
      success: true,
      message: responseMessage,
      score: responseScore,
      passed: responsePassed,
      timeSpent: attempt.timeSpent,
      showResults: quiz.showResults,
      attempt: buildStudentFacingAttempt(attempt),
    });
  } catch (err) {
    console.error("Submit quiz error:", err);
    emitRealtimeEvent({
      type: "grading",
      status: "failed",
      requestId: requestIdFromReq(req),
      entityType: "quiz_attempt",
      entityId: req.params?.attemptId || null,
      message: "Quiz submission or grading failed. Please try again.",
      actor: buildActorFromRequest(req),
      targets: {
        userIds: req.user?._id ? [String(req.user._id)] : [],
        studentIds: req.user?._id ? [String(req.user._id)] : [],
      },
      meta: {
        quizId: req.params?.quizId || null,
        attemptId: req.params?.attemptId || null,
      },
    });
    return res
      .status(500)
      .json({ success: false, error: "Failed to submit quiz" });
  }
};

export const getWorkspaces = async (req, res) => {
  try {
    const studentId = req.user._id;
    const tenantId = getRequestTenantId(req);
    const context = await getStudentAcademicContext(studentId, tenantId);

    const courses = await Course.find({
      _id: { $in: context.courseIds.length ? context.courseIds : [null] },
      deleted: false,
      archived: false,
      ...buildTenantMatch(tenantId),
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: courses,
      count: courses.length,
    });
  } catch (err) {
    console.error("Get courses error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch courses" });
  }
};

export const getResults = async (req, res) => {
  try {
    const studentId = req.user._id;
    const tenantId = getRequestTenantId(req);

    const [submissions, attempts] = await Promise.all([
      Submission.find({
        studentId,
        deleted: false,
        ...buildTenantMatch(tenantId),
      })
        .sort({ createdAt: -1 })
        .limit(200)
        .populate("assignmentId", "title dueDate teacher workspace class")
        .lean(),
      QuizAttempt.find({
        studentId,
        deleted: false,
        ...buildTenantMatch(tenantId),
      })
        .sort({ createdAt: -1 })
        .limit(200)
        .populate("quizId", "title passingScore showResults workspace teacher")
        .lean(),
    ]);

    const results = {
      assignments: submissions.map((submission) => {
      const status = normalizeReviewStatus(
        submission.gradingStatus,
        GRADING_STATUS.SUBMITTED,
      );
      const released = isFinalized(submission, "gradingStatus");
      return {
        type: "assignment",
        id: submission.assignmentId?._id || submission.assignmentId,
        title: submission.assignmentId?.title || "Assignment",
        score: released ? getCurrentScore(submission) : null,
        feedback: released ? getCurrentFeedback(submission) : "",
        graded: released,
        released,
        status,
        submittedAt: submission.submittedAt || submission.createdAt,
        dueDate: submission.assignmentId?.dueDate || null,
        courseId: toId(submission.assignmentId?.workspace || submission.workspaceId),
      };
      }),
      quizzes: attempts.map((attempt) => {
      const status = normalizeReviewStatus(
        attempt.status,
        ATTEMPT_STATUS.SUBMITTED,
      );
      const released = isFinalized(attempt, "status");
      const visibleScore = released ? getCurrentScore(attempt) : null;
      return {
        type: "quiz",
        id: attempt.quizId?._id || attempt.quizId,
        title: attempt.quizId?.title || "Quiz",
        score: visibleScore,
        feedback: released ? getCurrentFeedback(attempt) : "",
        passed:
          released && visibleScore !== null
            ? visibleScore >= (attempt.quizId?.passingScore ?? 60)
            : false,
        released,
        status,
        submittedAt: attempt.submittedAt,
        timeSpent: attempt.timeSpent,
        courseId: toId(attempt.quizId?.workspace || attempt.workspaceId),
      };
      }),
    };

    return res.json({ success: true, data: results });
  } catch (err) {
    console.error("Get results error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch results" });
  }
};

const updateLeaderboard = async (studentId, score, {
  tenantId = null,
  courseId = null,
  classId = null,
  subject = null,
} = {}) => {
  try {
    const filter = {
      tenantId: tenantId || null,
      studentId,
      courseId: courseId || null,
      classId: classId || null,
      subject: subject || null,
    };

    await Leaderboard.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          tenantId: tenantId || null,
          studentId,
          courseId: courseId || null,
          classId: classId || null,
          subject: subject || null,
        },
        $inc: { points: score },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    console.error("Update leaderboard error:", err);
  }
};

export const getLeaderboard = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "10", 10), 50);
    const courseId = req.query.courseId || null;
    const tenantId = getRequestTenantId(req);
    const subject = req.query.subject || null;
    const className = req.query.className || null;

    const filter = {
      deleted: false,
      ...(tenantId ? { tenantId } : {}),
    };
    if (courseId && isValidObjectId(courseId)) {
      filter.courseId = courseId;
    }
    if (subject) filter.subject = String(subject).trim();
    if (className) filter.className = String(className).trim();

    const leaderboard = await Leaderboard.find(filter)
      .populate("studentId", "firstName lastName email")
      .sort({ points: -1, updatedAt: -1 })
      .limit(limit);

    return res.json({
      success: true,
      data: leaderboard.map((entry) => ({
        student: entry.studentId
          ? `${entry.studentId.firstName} ${entry.studentId.lastName}`.trim()
          : "Unknown",
        email: entry.studentId?.email || "",
        points: entry.points,
      })),
      count: leaderboard.length,
    });
  } catch (err) {
    console.error("Get leaderboard error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch leaderboard" });
  }
};
