import Assignment from "../models/Assignment.js";
import AssignmentAssignment from "../models/AssignmentAssignment.js";
import Submission from "../models/Submission.js";
import Quiz from "../models/quiz.js";
import QuizAssignment from "../models/QuizAssignment.js";
import QuizAttempt from "../models/QuizAttempt.js";
import Leaderboard from "../models/leaderboardModel.js";
import Course from "../models/CourseModel.js";
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
  serializeAssignment,
  serializeAttemptForUi,
  serializeQuiz,
  serializeSubmission,
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
          submission: submission ? serializeSubmission(submission) : null,
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
      "_id tenantId teacher workspace class dueDate status deleted",
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

    const submittedFiles = files.map((file) => ({
      name: file.originalname,
      path: file.path,
      mimetype: file.mimetype,
      size: file.size,
    }));

    const submission = await Submission.findOneAndUpdate(
      {
        assignmentId: assignment._id,
        studentId,
        workspaceId: courseId,
      },
      {
        $set: {
          tenantId: tenantId || assignment.tenantId || null,
          assignmentId: assignment._id,
          workspaceId: courseId,
          studentId,
          teacherId: assignment.teacher || null,
          classroomId: assignment.class || null,
          files: submittedFiles,
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

    return res.json({
      success: true,
      message: "Assignment submitted successfully",
      submission: serializeSubmission(submission),
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
      attempts.map((attempt) => [String(attempt.quizId), serializeAttemptForUi(attempt)]),
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
            attempt: attemptsByQuizId.get(String(quiz._id)) || null,
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
      attempt: serializeAttemptForUi(attempt),
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
      return res.json({
        success: true,
        score: attempt.score,
        passed: attempt.score >= (quiz.passingScore ?? 60),
        timeSpent: attempt.timeSpent,
        showResults: quiz.showResults,
        attempt: serializeAttemptForUi(attempt),
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
    attempt.score = percentageScore;
    attempt.submittedAt = new Date();
    attempt.status = requiresManualReview ? "submitted" : "graded";
    attempt.gradedAt = requiresManualReview ? null : new Date();
    attempt.timeSpent = Math.max(
      attempt.timeSpent || 0,
      Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000),
    );
    attempt.locked = true;

    await attempt.save();

    if (percentageScore >= (quiz.passingScore ?? 60)) {
      await updateLeaderboard(studentId, percentageScore, courseId);
    }

    if (requiresManualReview) {
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
          score: percentageScore,
        },
      });
    } else {
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

    return res.json({
      success: true,
      score: percentageScore,
      passed: percentageScore >= (quiz.passingScore ?? 60),
      timeSpent: attempt.timeSpent,
      showResults: quiz.showResults,
      attempt: serializeAttemptForUi(attempt),
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
        status: { $in: ["submitted", "graded"] },
        deleted: false,
        ...buildTenantMatch(tenantId),
      })
        .sort({ createdAt: -1 })
        .limit(200)
        .populate("quizId", "title passingScore showResults workspace teacher")
        .lean(),
    ]);

    const results = {
      assignments: submissions.map((submission) => ({
        type: "assignment",
        id: submission.assignmentId?._id || submission.assignmentId,
        title: submission.assignmentId?.title || "Assignment",
        score: submission.grade ?? submission.score ?? null,
        graded: submission.grade !== null || submission.gradedBy !== "NONE",
        submittedAt: submission.submittedAt || submission.createdAt,
        dueDate: submission.assignmentId?.dueDate || null,
        courseId: toId(submission.assignmentId?.workspace || submission.workspaceId),
      })),
      quizzes: attempts.map((attempt) => ({
        type: "quiz",
        id: attempt.quizId?._id || attempt.quizId,
        title: attempt.quizId?.title || "Quiz",
        score: attempt.score,
        passed: attempt.score >= (attempt.quizId?.passingScore ?? 60),
        submittedAt: attempt.submittedAt,
        timeSpent: attempt.timeSpent,
        courseId: toId(attempt.quizId?.workspace || attempt.workspaceId),
      })),
    };

    return res.json({ success: true, data: results });
  } catch (err) {
    console.error("Get results error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Failed to fetch results" });
  }
};

const updateLeaderboard = async (studentId, score, courseId) => {
  try {
    const filter = courseId
      ? { student: studentId, courseId }
      : { student: studentId };

    await Leaderboard.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          student: studentId,
          courseId: courseId || null,
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

    const filter = {};
    if (courseId && isValidObjectId(courseId)) {
      filter.courseId = courseId;
    }

    const leaderboard = await Leaderboard.find(filter)
      .populate("student", "firstName lastName email")
      .sort({ points: -1, updatedAt: -1 })
      .limit(limit);

    return res.json({
      success: true,
      data: leaderboard.map((entry) => ({
        student: entry.student
          ? `${entry.student.firstName} ${entry.student.lastName}`.trim()
          : "Unknown",
        email: entry.student?.email || "",
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
