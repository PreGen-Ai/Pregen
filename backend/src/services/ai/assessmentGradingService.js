import {
  AiUpstreamError,
  callAiService,
} from "./fastapiClient.js";

function normalizeQuestionType(value) {
  const normalized = String(value || "essay").trim().toLowerCase();
  if (normalized === "multiple_choice") return "multiple_choice";
  if (normalized === "true_false") return "true_false";
  return "essay";
}

function extractCorrectAnswer(question = {}) {
  const normalizedType = normalizeQuestionType(
    question.questionType || question.type,
  );

  if (normalizedType === "multiple_choice") {
    const index = (question.options || []).findIndex((option) => option?.isCorrect);
    return index >= 0 ? String.fromCharCode(65 + index) : "A";
  }

  if (normalizedType === "true_false") {
    return String(question.correctAnswer || "true")
      .trim()
      .toLowerCase() === "false"
      ? "False"
      : "True";
  }

  return String(question.correctAnswer || question.expected_answer || "")
    .trim();
}

function buildQuestionPayload(question = {}) {
  const normalizedType = normalizeQuestionType(
    question.questionType || question.type,
  );

  return {
    id: String(question._id || question.id || ""),
    type: normalizedType,
    question:
      String(question.questionText || question.question || "").trim() ||
      "Question",
    options:
      normalizedType === "multiple_choice"
        ? (question.options || []).map((option) =>
            typeof option === "string" ? option : String(option?.text || "").trim(),
          )
        : [],
    correct_answer: extractCorrectAnswer(question),
    expected_answer:
      normalizedType === "essay"
        ? String(question.correctAnswer || question.expected_answer || "").trim()
        : undefined,
    explanation: String(question.explanation || "").trim(),
    max_score: Number(question.points || question.max_score || 1),
  };
}

function extractFeedbackFromGradedQuestions(gradedQuestions = []) {
  return gradedQuestions
    .map((question) => String(question?.feedback || "").trim())
    .filter(Boolean)
    .slice(0, 4)
    .join("\n\n");
}

function ensureGradingResultShape(result = {}) {
  const score = Number(result?.overall_score);
  if (!Number.isFinite(score)) {
    throw new Error("AI grading response did not include overall_score");
  }

  const gradedQuestions = Array.isArray(result?.graded_questions)
    ? result.graded_questions
    : [];

  return {
    score,
    feedback:
      String(result?.feedback || "").trim() ||
      extractFeedbackFromGradedQuestions(gradedQuestions),
    gradedQuestions,
    reportId: result?.report_id || null,
    raw: result,
  };
}

export async function gradeAssignmentSubmissionWithAi({
  assignment,
  submission,
  tenantId = null,
  actorUserId = null,
}) {
  const answerText =
    String(submission?.textSubmission || "").trim() ||
    (submission?.answers ? JSON.stringify(submission.answers) : "");

  if (!answerText && !Array.isArray(submission?.files)) {
    throw new Error("Submission does not contain gradeable content");
  }

  const response = await callAiService({
    method: "POST",
    path: "/api/grade-question",
    headers: {
      ...(tenantId ? { "x-tenant-id": String(tenantId) } : {}),
      ...(actorUserId ? { "x-user-id": String(actorUserId) } : {}),
    },
    body: {
      student_id: String(submission?.studentId || actorUserId || ""),
      subject: String(assignment?.subject || "General"),
      curriculum: String(assignment?.curriculum || "General"),
      assignment_name: String(assignment?.title || "Assignment"),
      question_data: {
        id: String(assignment?._id || "assignment"),
        type: "essay",
        question:
          String(assignment?.description || assignment?.title || "").trim() ||
          "Assignment submission",
        expected_answer: String(
          assignment?.instructions || assignment?.description || "",
        ).trim(),
        rubric: `Score out of ${Number(assignment?.maxScore || 100)}`,
        max_score: Number(assignment?.maxScore || 100),
      },
      student_answer: answerText || "[file submission]",
    },
  });

  return ensureGradingResultShape(response.data);
}

export async function gradeQuizAttemptWithAi({
  quiz,
  attempt,
  tenantId = null,
  actorUserId = null,
}) {
  const questions = Array.isArray(quiz?.questions)
    ? quiz.questions.map((question) => buildQuestionPayload(question))
    : [];
  const studentAnswers = Array.isArray(attempt?.answers)
    ? attempt.answers.reduce((acc, answer) => {
        const questionId = String(answer?.questionId || "").trim();
        if (!questionId) return acc;
        acc[questionId] =
          answer?.answer === null || answer?.answer === undefined
            ? ""
            : String(answer.answer);
        return acc;
      }, {})
    : {};

  const response = await callAiService({
    method: "POST",
    path: "/api/grade-quiz",
    headers: {
      ...(tenantId ? { "x-tenant-id": String(tenantId) } : {}),
      ...(actorUserId ? { "x-user-id": String(actorUserId) } : {}),
    },
    body: {
      student_id: String(attempt?.studentId || actorUserId || ""),
      assignment_name: String(quiz?.title || "Quiz"),
      subject: String(quiz?.subject || "General"),
      curriculum: String(quiz?.curriculum || "General"),
      assignment_data: {
        questions,
      },
      quiz_questions: questions,
      student_answers: studentAnswers,
    },
  });

  return ensureGradingResultShape(response.data);
}

export { AiUpstreamError };
