import mongoose from "mongoose";
import Course from "../models/CourseModel.js";
import CourseMember from "../models/CourseMember.js";
import Classroom from "../models/Classroom.js";

export const userFields = "firstName lastName username email role user_code";

export const isValidObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value);

export const toId = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
};

export const normalizeRoleValue = (role) => String(role || "").trim().toUpperCase();

export const isAdminLike = (reqOrRole) => {
  const role =
    typeof reqOrRole === "string"
      ? reqOrRole
      : reqOrRole?.userRole || reqOrRole?.user?.role;
  return ["ADMIN", "SUPERADMIN"].includes(normalizeRoleValue(role));
};

export const isTeacherLike = (reqOrRole) => {
  const role =
    typeof reqOrRole === "string"
      ? reqOrRole
      : reqOrRole?.userRole || reqOrRole?.user?.role;
  return ["TEACHER", "ADMIN", "SUPERADMIN"].includes(normalizeRoleValue(role));
};

export const getRequestTenantId = (req) =>
  req?.tenantId ||
  req?.get?.("x-tenant-id") ||
  req?.user?.tenantId ||
  req?.user?.orgId ||
  null;

export const buildTenantMatch = (tenantId) => {
  if (!tenantId) return {};
  return {
    $or: [{ tenantId }, { tenantId: null }, { tenantId: { $exists: false } }],
  };
};

export const makePagination = (page = 1, limit = 20) => {
  const safePage = Math.max(parseInt(page || "1", 10), 1);
  const safeLimit = Math.min(
    Math.max(parseInt(limit || "20", 10), 1),
    100,
  );
  return { page: safePage, limit: safeLimit, skip: (safePage - 1) * safeLimit };
};

export async function canAccessCourse({ course, courseId, req, userId }) {
  const effectiveCourse =
    course ||
    (courseId && isValidObjectId(courseId)
      ? await Course.findById(courseId).select("_id createdBy deleted tenantId")
      : null);

  if (!effectiveCourse || effectiveCourse.deleted) return false;

  const tenantId = getRequestTenantId(req);
  if (
    tenantId &&
    effectiveCourse.tenantId &&
    String(effectiveCourse.tenantId) !== String(tenantId)
  ) {
    return false;
  }

  if (isAdminLike(req)) return true;

  const effectiveUserId = toId(userId || req?.user?._id);
  if (!effectiveUserId) return false;

  if (String(effectiveCourse.createdBy) === effectiveUserId) return true;

  return !!(await CourseMember.exists({
    courseId: effectiveCourse._id,
    userId: effectiveUserId,
    status: "active",
  }));
}

export async function getStudentAcademicContext(studentId, tenantId = null) {
  const membershipRows = await CourseMember.find({
    userId: studentId,
    status: "active",
  })
    .select("courseId")
    .lean();

  let courseIds = membershipRows.map((row) => toId(row.courseId)).filter(Boolean);

  if (tenantId && courseIds.length) {
    const tenantCourses = await Course.find({
      _id: { $in: courseIds },
      ...buildTenantMatch(tenantId),
      deleted: false,
    })
      .select("_id")
      .lean();

    courseIds = tenantCourses.map((row) => toId(row._id)).filter(Boolean);
  }

  const classFilter = { studentIds: studentId, deletedAt: null };
  if (tenantId) classFilter.tenantId = tenantId;

  const classrooms = await Classroom.find(classFilter).select("_id").lean();
  const classroomIds = classrooms.map((row) => toId(row._id)).filter(Boolean);

  return { courseIds, classroomIds };
}

export async function getStudentTargetRows({
  TargetModel,
  key,
  ownerIds = [],
  studentId,
  courseIds = [],
  classroomIds = [],
  tenantId = null,
  extraFilter = {},
}) {
  const normalizedOwnerIds = Array.from(
    new Set(
      (Array.isArray(ownerIds) ? ownerIds : [])
        .map((value) => (isValidObjectId(value) ? String(value) : null))
        .filter(Boolean),
    ),
  );

  if (!TargetModel || !key || !normalizedOwnerIds.length) return [];

  const normalizedCourseIds = (Array.isArray(courseIds) ? courseIds : []).filter(
    (value) => isValidObjectId(value),
  );
  const normalizedClassroomIds = (
    Array.isArray(classroomIds) ? classroomIds : []
  ).filter((value) => isValidObjectId(value));

  const filter = {
    ...extraFilter,
    ...buildTenantMatch(tenantId),
    [key]: { $in: normalizedOwnerIds },
    status: "assigned",
    $or: [
      { studentId },
      {
        studentId: null,
        classId: { $in: normalizedClassroomIds.length ? normalizedClassroomIds : [null] },
      },
      {
        studentId: null,
        classId: null,
        workspaceId: { $in: normalizedCourseIds.length ? normalizedCourseIds : [null] },
      },
    ],
  };

  return TargetModel.find(filter).lean();
}

export async function hasStudentTargetAccess({
  TargetModel,
  key,
  ownerId,
  studentId,
  courseId = null,
  classroomIds = [],
  tenantId = null,
}) {
  if (!TargetModel || !key || !isValidObjectId(ownerId)) return false;

  const totalTargets = await TargetModel.countDocuments({
    [key]: ownerId,
    status: "assigned",
    ...buildTenantMatch(tenantId),
  });

  if (!totalTargets) return !!courseId;

  const normalizedClassroomIds = (
    Array.isArray(classroomIds) ? classroomIds : []
  ).filter((value) => isValidObjectId(value));

  return !!(await TargetModel.exists({
    [key]: ownerId,
    status: "assigned",
    ...buildTenantMatch(tenantId),
    $or: [
      { studentId },
      {
        studentId: null,
        classId: { $in: normalizedClassroomIds.length ? normalizedClassroomIds : [null] },
      },
      {
        studentId: null,
        classId: null,
        workspaceId: courseId || null,
      },
    ],
  }));
}

export function buildTargetRows({
  key,
  ownerId,
  courseId = null,
  classroomId = null,
  studentIds = [],
  dueDate = null,
  tenantId = null,
}) {
  if (!ownerId) return [];

  const normalizedCourseId = courseId && isValidObjectId(courseId) ? courseId : null;
  const normalizedClassroomId =
    classroomId && isValidObjectId(classroomId) ? classroomId : null;
  const normalizedStudentIds = Array.from(
    new Set(
      (Array.isArray(studentIds) ? studentIds : [])
        .map((value) => (isValidObjectId(value) ? String(value) : null))
        .filter(Boolean),
    ),
  );

  const base = {
    [key]: ownerId,
    tenantId: tenantId || null,
    workspaceId: normalizedCourseId,
    classId: normalizedClassroomId,
    dueDate: dueDate ? new Date(dueDate) : null,
  };

  if (!normalizedStudentIds.length) {
    return normalizedCourseId || normalizedClassroomId ? [base] : [];
  }

  return normalizedStudentIds.map((studentId) => ({
    ...base,
    studentId,
  }));
}

export function serializeCourse(course, extras = {}) {
  const plain = course?.toObject ? course.toObject() : { ...(course || {}) };
  return {
    ...plain,
    tenantId: plain.tenantId || null,
    createdBy: plain.createdBy || null,
    subjectId: toId(plain.subjectId),
    classroomId: toId(plain.classroomId),
    ...extras,
  };
}

export function serializeAssignment(assignment, extras = {}) {
  const plain = assignment?.toObject
    ? assignment.toObject({ virtuals: true })
    : { ...(assignment || {}) };

  const teacherId = toId(plain.teacherId || plain.teacher || plain.createdBy);
  const courseId = toId(plain.courseId || plain.workspace || plain.workspaceId);
  const classroomId = toId(
    plain.classroomId || plain.class || plain.classId,
  );

  return {
    ...plain,
    teacherId,
    courseId,
    classroomId,
    workspaceId: courseId,
    classId: classroomId,
    tenantId: plain.tenantId || null,
    ...extras,
  };
}

export function serializeSubmission(submission, extras = {}) {
  const plain = submission?.toObject
    ? submission.toObject({ virtuals: true })
    : { ...(submission || {}) };

  return {
    ...plain,
    courseId: toId(plain.courseId || plain.workspaceId),
    classroomId: toId(plain.classroomId),
    tenantId: plain.tenantId || null,
    ...extras,
  };
}

export async function getAccessibleCourseIdsForUser({
  userId,
  tenantId = null,
  includeOwned = true,
}) {
  const effectiveUserId = toId(userId);
  if (!effectiveUserId) return [];

  const queries = [];

  if (includeOwned) {
    queries.push(
      Course.find({
        createdBy: effectiveUserId,
        deleted: false,
        ...buildTenantMatch(tenantId),
      })
        .select("_id")
        .lean(),
    );
  }

  queries.push(
    CourseMember.find({
      userId: effectiveUserId,
      status: "active",
    })
      .select("courseId")
      .lean(),
  );

  const rows = await Promise.all(queries);
  const ids = new Set();

  for (const rowSet of rows) {
    for (const row of rowSet) {
      const value = toId(row?._id || row?.courseId);
      if (value) ids.add(value);
    }
  }

  const candidateIds = Array.from(ids);
  if (!candidateIds.length) return [];

  const tenantRows = await Course.find({
    _id: { $in: candidateIds },
    deleted: false,
    ...buildTenantMatch(tenantId),
  })
    .select("_id")
    .lean();

  return tenantRows.map((row) => toId(row._id)).filter(Boolean);
}

export async function getAccessibleClassroomIdsForUser({
  userId,
  tenantId = null,
  role = "",
}) {
  const effectiveUserId = toId(userId);
  if (!effectiveUserId) return [];

  const normalizedRole = normalizeRoleValue(role);
  const filter = { deletedAt: null };
  if (tenantId) filter.tenantId = tenantId;

  if (normalizedRole === "STUDENT") {
    filter.studentIds = effectiveUserId;
  } else if (!["ADMIN", "SUPERADMIN"].includes(normalizedRole)) {
    filter.teacherId = effectiveUserId;
  }

  const rows = await Classroom.find(filter).select("_id").lean();
  return rows.map((row) => toId(row._id)).filter(Boolean);
}

const optionLetterAt = (index) => String.fromCharCode(65 + index);

export function getCorrectAnswerValue(question = {}) {
  if (question.questionType === "multiple_choice") {
    const correctIndex = (question.options || []).findIndex((opt) => opt?.isCorrect);
    if (correctIndex >= 0) return optionLetterAt(correctIndex);
  }

  const raw = question.correctAnswer;
  if (raw === undefined || raw === null) return null;

  if (typeof raw === "boolean") return raw ? "true" : "false";
  return String(raw);
}

export function serializeQuizQuestion(question, { includeAnswers = false } = {}) {
  const correctAnswer = getCorrectAnswerValue(question);
  const base = {
    _id: question._id,
    id: String(question._id),
    question: question.questionText,
    questionText: question.questionText,
    type: question.questionType,
    questionType: question.questionType,
    options: (question.options || []).map((option) => option?.text || ""),
    max_score: Number(question.points || 0),
    points: Number(question.points || 0),
    explanation: includeAnswers ? question.explanation || "" : "",
    fileUploadConfig: question.fileUploadConfig || {},
  };

  if (!includeAnswers) return base;

  if (question.questionType === "essay" || question.questionType === "short_answer") {
    return {
      ...base,
      expected_answer: correctAnswer,
      correctAnswer,
    };
  }

  return {
    ...base,
    correctAnswer,
    correct_answer: correctAnswer,
  };
}

export function serializeQuiz(quiz, { includeAnswers = false, extras = {} } = {}) {
  const plain = quiz?.toObject
    ? quiz.toObject({ virtuals: true })
    : { ...(quiz || {}) };

  return {
    ...plain,
    teacherId: toId(plain.teacherId || plain.teacher || plain.createdBy),
    courseId: toId(plain.courseId || plain.workspace),
    classroomId: toId(plain.classroomId || plain.class),
    workspaceId: toId(plain.workspace),
    classId: toId(plain.class),
    tenantId: plain.tenantId || null,
    questions: Array.isArray(plain.questions)
      ? plain.questions.map((question) =>
          serializeQuizQuestion(question, { includeAnswers }),
        )
      : [],
    ...extras,
  };
}

export function attemptAnswersToMap(answers = []) {
  if (!Array.isArray(answers)) return { ...(answers || {}) };

  return answers.reduce((acc, answer) => {
    const questionId = toId(answer?.questionId);
    if (!questionId) return acc;
    acc[questionId] = answer?.answer ?? null;
    return acc;
  }, {});
}

export function answersInputToAttemptArray(quiz, answersInput) {
  if (!quiz || !Array.isArray(quiz.questions)) return [];

  const map = Array.isArray(answersInput)
    ? answersInput.reduce((acc, answer) => {
        const questionId = toId(answer?.questionId);
        if (questionId) acc[questionId] = answer?.answer ?? null;
        return acc;
      }, {})
    : { ...(answersInput || {}) };

  return quiz.questions.reduce((acc, question) => {
    const questionId = String(question._id);
    if (!Object.prototype.hasOwnProperty.call(map, questionId)) return acc;

    acc.push({
      questionId: question._id,
      answer: map[questionId],
      uploadedFiles: [],
    });
    return acc;
  }, []);
}

export function toUiAttemptStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "in_progress") return "InProgress";
  if (normalized === "submitted") return "Submitted";
  if (normalized === "graded") return "Graded";
  if (normalized === "grading") return "Grading";
  if (normalized === "failed") return "Failed";
  return "Scheduled";
}

export function serializeAttemptForUi(attempt) {
  if (!attempt) return null;

  const plain = attempt?.toObject
    ? attempt.toObject({ virtuals: true })
    : { ...(attempt || {}) };

  return {
    ...plain,
    courseId: toId(plain.courseId || plain.workspaceId),
    tenantId: plain.tenantId || null,
    status: toUiAttemptStatus(plain.status),
    answers: attemptAnswersToMap(plain.answers),
  };
}

export function computeQuizAttemptExpiry({ attempt, quiz, targetDueDate = null }) {
  const startedAt = attempt?.startedAt ? new Date(attempt.startedAt) : new Date();
  const timeLimitMinutes = Number(quiz?.timeLimit || 0);

  const timerExpiry =
    timeLimitMinutes > 0
      ? new Date(startedAt.getTime() + timeLimitMinutes * 60 * 1000)
      : null;
  const dueExpiry = targetDueDate ? new Date(targetDueDate) : null;

  if (timerExpiry && dueExpiry) {
    return timerExpiry < dueExpiry ? timerExpiry : dueExpiry;
  }

  return timerExpiry || dueExpiry || null;
}

export function gradeQuizAnswers(quiz, answersInput) {
  const processedAnswers = [];
  let pointsEarnedTotal = 0;

  const rawAnswers = answersInputToAttemptArray(quiz, answersInput);

  for (const answer of rawAnswers) {
    const question = quiz.questions.id(answer.questionId);
    if (!question) continue;

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

    processedAnswers.push({
      questionId: question._id,
      answer: answer.answer ?? null,
      uploadedFiles: Array.isArray(answer.uploadedFiles) ? answer.uploadedFiles : [],
      isCorrect,
      pointsEarned,
    });
  }

  const totalPoints =
    Number(quiz.totalPoints) ||
    quiz.questions.reduce((sum, question) => sum + Number(question.points || 0), 0);
  const percentageScore =
    totalPoints > 0 ? Math.round((pointsEarnedTotal / totalPoints) * 10000) / 100 : 0;

  return {
    processedAnswers,
    pointsEarnedTotal,
    totalPoints,
    percentageScore,
  };
}
