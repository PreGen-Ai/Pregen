import {
  getCorrectAnswerValue,
  normalizeSubmissionAnswers,
} from "./academicContract.js";

function cleanText(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function normalizeOptionText(option) {
  if (typeof option === "string") return cleanText(option);
  return cleanText(option?.text || option?.label || option);
}

function normalizeFileSnapshot(file) {
  if (!file || typeof file !== "object") return null;

  return {
    name: cleanText(file.name || file.filename || file.originalName || "File"),
    path: cleanText(file.path || file.filePath || ""),
    mimetype: cleanText(file.mimetype || file.fileType || ""),
    size:
      file.size === null || file.size === undefined || file.size === ""
        ? 0
        : Number(file.size) || 0,
  };
}

function toQuestionKey(value, fallback = "question") {
  return cleanText(value || fallback);
}

function buildAiQuestionMap(gradedQuestions = []) {
  const map = new Map();

  for (const question of Array.isArray(gradedQuestions) ? gradedQuestions : []) {
    const questionId = toQuestionKey(
      question?.question_id || question?.id,
      "",
    );
    if (!questionId) continue;

    map.set(questionId, {
      aiScore:
        question?.score === null || question?.score === undefined
          ? null
          : Number(question.score),
      aiFeedback: cleanText(question?.feedback),
      maxScore:
        question?.max_score === null || question?.max_score === undefined
          ? null
          : Number(question.max_score),
      isCorrect:
        question?.is_correct === null || question?.is_correct === undefined
          ? null
          : Boolean(question.is_correct),
    });
  }

  return map;
}

function normalizeStoredReviewRow(row = {}, index = 0) {
  return {
    position:
      row?.position === null || row?.position === undefined
        ? index
        : Number(row.position) || 0,
    questionId: toQuestionKey(row?.questionId || row?.id, `question-${index + 1}`),
    questionType: cleanText(row?.questionType, "essay"),
    questionText: cleanText(row?.questionText),
    prompt: cleanText(row?.prompt),
    options: Array.isArray(row?.options)
      ? row.options.map(normalizeOptionText).filter(Boolean)
      : [],
    correctAnswer:
      row?.correctAnswer === undefined ? null : row.correctAnswer,
    explanation: cleanText(row?.explanation),
    studentAnswer:
      row?.studentAnswer === undefined ? null : row.studentAnswer,
    uploadedFiles: Array.isArray(row?.uploadedFiles)
      ? row.uploadedFiles.map(normalizeFileSnapshot).filter(Boolean)
      : [],
    maxScore:
      row?.maxScore === null || row?.maxScore === undefined
        ? 0
        : Number(row.maxScore) || 0,
    autoScore:
      row?.autoScore === null || row?.autoScore === undefined
        ? null
        : Number(row.autoScore),
    autoFeedback: cleanText(row?.autoFeedback),
    aiScore:
      row?.aiScore === null || row?.aiScore === undefined
        ? null
        : Number(row.aiScore),
    aiFeedback: cleanText(row?.aiFeedback),
    teacherScore:
      row?.teacherScore === null || row?.teacherScore === undefined
        ? null
        : Number(row.teacherScore),
    teacherFeedback: cleanText(row?.teacherFeedback),
    isCorrect:
      row?.isCorrect === null || row?.isCorrect === undefined
        ? null
        : Boolean(row.isCorrect),
  };
}

export function buildAssignmentQuestionReviews({
  assignment,
  submission,
  gradedQuestions = [],
} = {}) {
  const aiMap = buildAiQuestionMap(gradedQuestions);
  const questionId = toQuestionKey(
    assignment?._id || submission?._id,
    "assignment",
  );
  const ai = aiMap.get(questionId) || {};
  const structuredAnswers = normalizeSubmissionAnswers(submission?.answers);
  const studentAnswer =
    cleanText(submission?.textSubmission) ||
    structuredAnswers ||
    null;

  return [
    normalizeStoredReviewRow(
      {
        position: 0,
        questionId,
        questionType: "essay",
        questionText:
          cleanText(assignment?.description) ||
          cleanText(assignment?.title) ||
          "Assignment submission",
        prompt: cleanText(assignment?.instructions),
        correctAnswer: cleanText(assignment?.instructions) || null,
        studentAnswer,
        uploadedFiles: Array.isArray(submission?.files) ? submission.files : [],
        maxScore:
          Number(ai?.maxScore ?? assignment?.maxScore ?? 100) || 100,
        aiScore: ai.aiScore ?? null,
        aiFeedback: ai.aiFeedback || "",
      },
      0,
    ),
  ];
}

export function buildQuizQuestionReviews({
  quiz,
  attempt,
  gradedQuestions = [],
} = {}) {
  const aiMap = buildAiQuestionMap(gradedQuestions);
  const answerMap = new Map();

  for (const answer of Array.isArray(attempt?.answers) ? attempt.answers : []) {
    const questionId = toQuestionKey(answer?.questionId, "");
    if (!questionId) continue;
    answerMap.set(questionId, answer);
  }

  return (Array.isArray(quiz?.questions) ? quiz.questions : []).map(
    (question, index) => {
      const questionId = toQuestionKey(question?._id || question?.id, `question-${index + 1}`);
      const answer = answerMap.get(questionId) || null;
      const ai = aiMap.get(questionId) || {};
      const correctAnswer = getCorrectAnswerValue(question);
      const autoScore =
        answer?.pointsEarned === null || answer?.pointsEarned === undefined
          ? null
          : Number(answer.pointsEarned);

      return normalizeStoredReviewRow(
        {
          position: index,
          questionId,
          questionType: cleanText(
            question?.questionType || question?.type,
            "multiple_choice",
          ),
          questionText: cleanText(
            question?.questionText || question?.question,
            `Question ${index + 1}`,
          ),
          options: Array.isArray(question?.options)
            ? question.options.map(normalizeOptionText).filter(Boolean)
            : [],
          correctAnswer: correctAnswer ?? null,
          explanation: cleanText(question?.explanation),
          studentAnswer:
            answer?.answer === undefined ? null : answer.answer,
          uploadedFiles: Array.isArray(answer?.uploadedFiles)
            ? answer.uploadedFiles
            : [],
          maxScore: Number(ai?.maxScore ?? question?.points ?? 1) || 1,
          autoScore,
          autoFeedback:
            answer?.isCorrect === true
              ? "Automatically scored as correct."
              : answer?.isCorrect === false
                ? "Automatically scored as incorrect."
                : "",
          aiScore: ai.aiScore ?? null,
          aiFeedback: ai.aiFeedback || "",
          isCorrect:
            answer?.isCorrect === null || answer?.isCorrect === undefined
              ? ai.isCorrect ?? null
              : Boolean(answer.isCorrect),
        },
        index,
      );
    },
  );
}

export function mergeStoredQuestionReviews(baseRows = [], storedRows = []) {
  const storedMap = new Map(
    (Array.isArray(storedRows) ? storedRows : []).map((row, index) => {
      const normalized = normalizeStoredReviewRow(row, index);
      return [normalized.questionId, normalized];
    }),
  );

  const merged = (Array.isArray(baseRows) ? baseRows : []).map((row, index) => {
    const normalizedBase = normalizeStoredReviewRow(row, index);
    const stored = storedMap.get(normalizedBase.questionId);
    if (!stored) return normalizedBase;
    storedMap.delete(normalizedBase.questionId);
    return normalizeStoredReviewRow(
      {
        ...normalizedBase,
        ...stored,
        questionId: normalizedBase.questionId,
        position: normalizedBase.position,
      },
      index,
    );
  });

  for (const leftover of storedMap.values()) {
    merged.push(leftover);
  }

  return merged.sort((left, right) => left.position - right.position);
}

export function getQuestionReviewCurrentScore(review = {}) {
  const candidates = [
    review.teacherScore,
    review.aiScore,
    review.autoScore,
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === "") continue;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

export function computeQuestionReviewPercentage(rows = [], fallback = null) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const totalMax = normalizedRows.reduce(
    (sum, row) => sum + Math.max(Number(row?.maxScore || 0), 0),
    0,
  );

  if (!totalMax) {
    return fallback;
  }

  const totalScore = normalizedRows.reduce((sum, row) => {
    const activeScore = getQuestionReviewCurrentScore(row);
    return sum + Math.max(Number(activeScore || 0), 0);
  }, 0);

  return Math.round((totalScore / totalMax) * 10000) / 100;
}

export function summarizeQuestionReviewScores(rows = []) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const totalMax = normalizedRows.reduce(
    (sum, row) => sum + Math.max(Number(row?.maxScore || 0), 0),
    0,
  );
  const totalScore = normalizedRows.reduce((sum, row) => {
    const activeScore = getQuestionReviewCurrentScore(row);
    return sum + Math.max(Number(activeScore || 0), 0);
  }, 0);

  return {
    totalScore,
    totalMax,
    percentage:
      totalMax > 0
        ? Math.round((totalScore / totalMax) * 10000) / 100
        : null,
  };
}

export function cloneQuestionReviews(rows = []) {
  return mergeStoredQuestionReviews([], rows);
}
