import Quiz from "../models/quiz.js";
import QuizAssignment from "../models/QuizAssignment.js";
import QuizAttempt from "../models/QuizAttempt.js";
import {
  buildActorFromRequest,
  emitRealtimeEvent,
} from "../socket/emitter.js";
import {
  buildTenantMatch,
  computeQuizAttemptExpiry,
  getRequestTenantId,
  getStudentAcademicContext,
  gradeQuizAnswers,
  hasStudentTargetAccess,
  isValidObjectId,
  serializeAttemptForUi,
  serializeQuiz,
  toId,
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

const targetMatchesStudent = ({ target, studentId, classroomIds, courseIds }) => {
  if (!target) return false;

  const targetStudentId = toId(target.studentId);
  const targetClassId = toId(target.classId);
  const targetCourseId = toId(target.workspaceId);

  if (targetStudentId) return String(targetStudentId) === String(studentId);
  if (targetClassId) return classroomIds.includes(String(targetClassId));
  if (targetCourseId) return courseIds.includes(String(targetCourseId));
  return false;
};

const pickPreferredTarget = (rows) => {
  const byQuiz = new Map();

  const rank = (row) => {
    if (row.studentId) return 3;
    if (row.classId) return 2;
    return 1;
  };

  rows
    .slice()
    .sort((a, b) => {
      const diff = rank(b) - rank(a);
      if (diff !== 0) return diff;
      return new Date(a.assignedAt || 0) - new Date(b.assignedAt || 0);
    })
    .forEach((row) => {
      const quizId = toId(row.quizId?._id || row.quizId);
      if (!quizId || byQuiz.has(quizId)) return;
      byQuiz.set(quizId, row);
    });

  return byQuiz;
};

const buildAssignedItem = ({ target = null, quiz, attempt = null }) => {
  const classInfo = target?.classId || quiz?.class || null;
  const startAt = target?.assignedAt || quiz?.createdAt || null;
  const endAt = target?.dueDate || null;
  const uiAttempt = attempt ? serializeAttemptForUi(attempt) : null;
  const expiresAt =
    uiAttempt && attempt && quiz
      ? computeQuizAttemptExpiry({
          attempt,
          quiz,
          targetDueDate: endAt,
        })
      : null;

  return {
    _id: toId(target?._id || quiz?._id),
    quizId: quiz ? { _id: quiz._id, title: quiz.title } : null,
    classId: classInfo || null,
    startAt,
    startsAt: startAt,
    endAt,
    endsAt: endAt,
    durationMinutes: Number(quiz?.timeLimit || 0),
    attempt: uiAttempt
      ? {
          ...uiAttempt,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
        }
      : null,
  };
};

async function resolveQuizReference({ assignmentId, studentId, tenantId }) {
  const context = await getStudentAcademicContext(studentId, tenantId);

  let target = null;
  if (isValidObjectId(assignmentId)) {
    target = await QuizAssignment.findById(assignmentId)
      .populate("classId", "name grade section")
      .lean();
  }

  if (target) {
    const targetCourseId = toId(target.workspaceId);
    if (
      targetCourseId &&
      (!context.courseIds.includes(String(targetCourseId)) ||
        !targetMatchesStudent({
          target,
          studentId,
          classroomIds: context.classroomIds,
          courseIds: context.courseIds,
        }))
    ) {
      return null;
    }

    return {
      target,
      quizId: toId(target.quizId),
      courseId: targetCourseId,
      context,
    };
  }

  if (!isValidObjectId(assignmentId)) return null;

  const quiz = await Quiz.findById(assignmentId).select(
    "_id tenantId workspace class status deleted",
  );
  if (!quiz || quiz.deleted || quiz.status !== "published") return null;

  const courseId = toId(quiz.workspace);
  if (!courseId || !context.courseIds.includes(String(courseId))) return null;

  const hasAccess = await hasStudentTargetAccess({
    TargetModel: QuizAssignment,
    key: "quizId",
    ownerId: quiz._id,
    studentId,
    courseId,
    classroomIds: context.classroomIds,
    tenantId,
  });

  if (!hasAccess) return null;

  return {
    target: null,
    quizId: String(quiz._id),
    courseId,
    context,
  };
}

export const getStudentAssignedQuizzes = async (req, res) => {
  try {
    const studentId = req.user._id;
    const tenantId = getRequestTenantId(req);
    const context = await getStudentAcademicContext(studentId, tenantId);

    if (!context.courseIds.length) {
      return res.json({ success: true, items: [] });
    }

    const [targetRows, scopedTargetQuizIds] = await Promise.all([
      QuizAssignment.find({
        status: "assigned",
        ...buildTenantMatch(tenantId),
        $or: [
          { studentId },
          {
            studentId: null,
            classId: {
              $in: context.classroomIds.length ? context.classroomIds : [null],
            },
          },
          {
            studentId: null,
            classId: null,
            workspaceId: { $in: context.courseIds },
          },
        ],
      })
        .populate({
          path: "quizId",
          match: {
            status: "published",
            deleted: false,
            ...buildTenantMatch(tenantId),
          },
          select: "title timeLimit workspace class createdAt showResults passingScore",
          populate: { path: "class", select: "name grade section" },
        })
        .populate("classId", "name grade section")
        .lean(),
      QuizAssignment.distinct("quizId", {
        status: "assigned",
        ...buildTenantMatch(tenantId),
        workspaceId: { $in: context.courseIds },
      }),
    ]);

    const validTargetRows = targetRows.filter((row) => row.quizId);
    const preferredTargets = pickPreferredTarget(validTargetRows);
    const targetedQuizIds = Array.from(preferredTargets.keys());

    const directQuizzes = await Quiz.find({
      workspace: { $in: context.courseIds },
      _id: { $nin: scopedTargetQuizIds.length ? scopedTargetQuizIds : [null] },
      status: "published",
      deleted: false,
      ...buildTenantMatch(tenantId),
    })
      .select("title timeLimit workspace class createdAt showResults passingScore")
      .populate("class", "name grade section")
      .lean();

    const allQuizIds = [
      ...targetedQuizIds,
      ...directQuizzes.map((quiz) => String(quiz._id)),
    ];

    const attempts = await QuizAttempt.find({
      quizId: { $in: allQuizIds.length ? allQuizIds : [null] },
      studentId,
      deleted: false,
    }).lean();

    const attemptsByQuizId = new Map(
      attempts.map((attempt) => [String(attempt.quizId), attempt]),
    );

    const targetedItems = Array.from(preferredTargets.values()).map((target) =>
      buildAssignedItem({
        target,
        quiz: target.quizId,
        attempt: attemptsByQuizId.get(String(target.quizId._id)) || null,
      }),
    );

    const directItems = directQuizzes.map((quiz) =>
      buildAssignedItem({
        target: null,
        quiz,
        attempt: attemptsByQuizId.get(String(quiz._id)) || null,
      }),
    );

    const items = [...targetedItems, ...directItems].sort((a, b) => {
      const aTime = new Date(a.endAt || a.startAt || 0).getTime();
      const bTime = new Date(b.endAt || b.startAt || 0).getTime();
      return aTime - bTime;
    });

    return res.json({ success: true, items });
  } catch (err) {
    console.error("getStudentAssignedQuizzes error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load assigned quizzes" });
  }
};

export const getAssignedQuizContent = async (req, res) => {
  try {
    const studentId = req.user._id;
    const tenantId = getRequestTenantId(req);
    const resolved = await resolveQuizReference({
      assignmentId: req.params.assignmentId,
      studentId,
      tenantId,
    });

    if (!resolved) {
      return res
        .status(404)
        .json({ success: false, message: "Assigned quiz not found" });
    }

    const attempt = await QuizAttempt.findOne({
      quizId: resolved.quizId,
      studentId,
      deleted: false,
    });

    const includeAnswers = ["submitted", "graded"].includes(
      String(attempt?.status || "").toLowerCase(),
    );

    const quiz = await Quiz.findById(resolved.quizId)
      .select(includeAnswers ? "+questions.correctAnswer" : "-questions.correctAnswer")
      .populate("class", "name grade section");

    if (!quiz || quiz.deleted || quiz.status !== "published") {
      return res.status(404).json({ success: false, message: "Quiz not found" });
    }

    return res.json({
      success: true,
      assignment: buildAssignedItem({
        target: resolved.target,
        quiz,
        attempt,
      }),
      quiz: serializeQuiz(quiz, { includeAnswers }),
    });
  } catch (err) {
    console.error("getAssignedQuizContent error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load quiz content" });
  }
};

export const startAssignedQuiz = async (req, res) => {
  try {
    const studentId = req.user._id;
    const tenantId = getRequestTenantId(req);
    const resolved = await resolveQuizReference({
      assignmentId: req.params.assignmentId,
      studentId,
      tenantId,
    });

    if (!resolved) {
      return res
        .status(404)
        .json({ success: false, message: "Assigned quiz not found" });
    }

    const quiz = await Quiz.findById(resolved.quizId).select(
      "title timeLimit workspace class status deleted tenantId",
    );

    if (!quiz || quiz.deleted || quiz.status !== "published") {
      return res.status(404).json({ success: false, message: "Quiz not found" });
    }

    let attempt = await QuizAttempt.findOne({
      quizId: resolved.quizId,
      studentId,
      deleted: false,
    });

    if (attempt && attempt.status !== "in_progress") {
      return res
        .status(400)
        .json({ success: false, message: "Quiz already submitted" });
    }

    if (!attempt) {
      attempt = await QuizAttempt.create({
        tenantId: tenantId || quiz.tenantId || null,
        quizId: resolved.quizId,
        quizAssignmentId: resolved.target?._id || null,
        workspaceId: resolved.courseId || quiz.workspace || null,
        studentId,
        status: "in_progress",
        startedAt: new Date(),
        locked: false,
      });
    }

    const expiresAt = computeQuizAttemptExpiry({
      attempt,
      quiz,
      targetDueDate: resolved.target?.dueDate || null,
    });

    return res.json({
      success: true,
      attempt: {
        ...serializeAttemptForUi(attempt),
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
      },
    });
  } catch (err) {
    console.error("startAssignedQuiz error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to start quiz" });
  }
};

export const saveQuizAttemptAnswers = async (req, res) => {
  try {
    const studentId = req.user._id;
    const tenantId = getRequestTenantId(req);
    const attemptId = req.params.attemptId;

    if (!isValidObjectId(attemptId)) {
      return res.status(400).json({ success: false, message: "Invalid attemptId" });
    }

    const attempt = await QuizAttempt.findById(attemptId);
    if (!attempt || String(attempt.studentId) !== String(studentId) || attempt.deleted) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }

    if (attempt.status !== "in_progress") {
      return res
        .status(400)
        .json({ success: false, message: "Attempt is not editable" });
    }

    const quiz = await Quiz.findById(attempt.quizId).select(
      "title timeLimit workspace class status deleted tenantId questions",
    );

    if (!quiz || quiz.deleted || quiz.status !== "published") {
      return res.status(404).json({ success: false, message: "Quiz not found" });
    }

    const hasAccess = await hasStudentTargetAccess({
      TargetModel: QuizAssignment,
      key: "quizId",
      ownerId: quiz._id,
      studentId,
      courseId: toId(quiz.workspace),
      classroomIds: (await getStudentAcademicContext(studentId, tenantId)).classroomIds,
      tenantId,
    });

    if (!hasAccess) {
      return res
        .status(403)
        .json({ success: false, message: "Quiz is not assigned to this student" });
    }

    const graded = gradeQuizAnswers(quiz, req.body.answers || {});
    attempt.answers = graded.processedAnswers.map((answer) => ({
      ...answer,
      isCorrect: null,
      pointsEarned: 0,
    }));
    await attempt.save();

    const target =
      attempt.quizAssignmentId && isValidObjectId(attempt.quizAssignmentId)
        ? await QuizAssignment.findById(attempt.quizAssignmentId).lean()
        : null;
    const expiresAt = computeQuizAttemptExpiry({
      attempt,
      quiz,
      targetDueDate: target?.dueDate || null,
    });

    return res.json({
      success: true,
      attempt: {
        ...serializeAttemptForUi(attempt),
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
      },
    });
  } catch (err) {
    console.error("saveQuizAttemptAnswers error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to save quiz answers" });
  }
};

export const submitQuizAttempt = async (req, res) => {
  try {
    const studentId = req.user._id;
    const attemptId = req.params.attemptId;
    const requestId = requestIdFromReq(req);

    if (!isValidObjectId(attemptId)) {
      return res.status(400).json({ success: false, message: "Invalid attemptId" });
    }

    const attempt = await QuizAttempt.findById(attemptId);
    if (!attempt || String(attempt.studentId) !== String(studentId) || attempt.deleted) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }

    const quiz = await Quiz.findById(attempt.quizId).select("+questions.correctAnswer");
    if (!quiz || quiz.deleted || quiz.status !== "published") {
      return res.status(404).json({ success: false, message: "Quiz not found" });
    }

    if (attempt.status !== "in_progress") {
      return res.json({
        success: true,
        score: attempt.score,
        attempt: serializeAttemptForUi(attempt),
      });
    }

    const graded = gradeQuizAnswers(
      quiz,
      req.body.answers || attempt.answers || {},
    );
    const requiresManualReview = quizNeedsTeacherReview(quiz);
    const courseId = toId(attempt.workspaceId || quiz.workspace);
    const classroomId = toId(quiz.class);
    const teacherUserId = toId(quiz.teacher);

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

    attempt.answers = graded.processedAnswers;
    attempt.pointsEarnedTotal = graded.pointsEarnedTotal;
    attempt.maxScore = graded.totalPoints;
    attempt.score = graded.percentageScore;
    attempt.submittedAt = new Date();
    attempt.status = requiresManualReview ? "submitted" : "graded";
    attempt.gradedAt = requiresManualReview ? null : new Date();
    attempt.timeSpent = Math.max(
      attempt.timeSpent || 0,
      Math.floor((Date.now() - new Date(attempt.startedAt).getTime()) / 1000),
    );
    attempt.locked = true;

    await attempt.save();

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
          score: graded.percentageScore,
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
          score: graded.percentageScore,
          passed: graded.percentageScore >= (quiz.passingScore ?? 60),
        },
      });
    }

    return res.json({
      success: true,
      score: graded.percentageScore,
      attempt: serializeAttemptForUi(attempt),
    });
  } catch (err) {
    console.error("submitQuizAttempt error:", err);
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
        attemptId: req.params?.attemptId || null,
      },
    });
    return res
      .status(500)
      .json({ success: false, message: "Failed to submit quiz attempt" });
  }
};
