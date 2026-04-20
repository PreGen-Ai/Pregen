function normalizeCorrectAnswer(value, options) {
  const raw = String(value || "").trim();
  if (!raw) return "A";
  const upper = raw.toUpperCase();
  if (["A", "B", "C", "D"].includes(upper)) return upper;

  const optionIndex = (options || []).findIndex(
    (option) => String(option || "").trim().toLowerCase() === raw.toLowerCase(),
  );
  return optionIndex >= 0 ? String.fromCharCode(65 + optionIndex) : "A";
}

export function extractCourseItems(response) {
  if (Array.isArray(response?.courses)) return response.courses;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response)) return response;
  return [];
}

const QUIZ_WRAPPER_KEYS = [
  "quiz",
  "questions",
  "items",
  "data",
  "content",
  "result",
  "results",
  "output",
  "payload",
  "body",
];

const isGeneratedQuestionShape = (value) =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !!(
    value.questionText ||
    value.question ||
    value.prompt ||
    value.text ||
    Array.isArray(value.options) ||
    value.correct_answer !== undefined ||
    value.correctAnswer !== undefined ||
    value.answer !== undefined ||
    value.expected_answer !== undefined
  );

const extractGeneratedQuestionList = (value, depth = 0) => {
  if (depth > 6 || value == null) return [];

  if (Array.isArray(value)) {
    const questionItems = value.filter(isGeneratedQuestionShape);
    if (questionItems.length) return questionItems;

    for (const item of value) {
      const nested = extractGeneratedQuestionList(item, depth + 1);
      if (nested.length) return nested;
    }
    return [];
  }

  if (typeof value !== "object") return [];
  if (isGeneratedQuestionShape(value)) return [value];

  for (const key of QUIZ_WRAPPER_KEYS) {
    const nested = extractGeneratedQuestionList(value[key], depth + 1);
    if (nested.length) return nested;
  }

  for (const nestedValue of Object.values(value)) {
    const nested = extractGeneratedQuestionList(nestedValue, depth + 1);
    if (nested.length) return nested;
  }

  return [];
};

export function extractGeneratedQuestions(response) {
  const rawQuestions = extractGeneratedQuestionList(response);

  return rawQuestions.map((question, index) => {
    const questionType = String(
      question?.questionType || question?.type || "multiple_choice",
    )
      .trim()
      .toLowerCase();
    const optionSource = Array.isArray(question?.options)
      ? question.options
      : Array.isArray(question?.choices)
        ? question.choices
        : [];
    const rawOptions = optionSource.length
      ? optionSource.map((option) =>
          typeof option === "string" ? option : option?.text || option?.label || "",
        )
      : [];

    const options =
      questionType === "multiple_choice"
        ? rawOptions.length
          ? rawOptions
          : ["Option A", "Option B", "Option C", "Option D"]
        : [];

    const correctAnswer =
      questionType === "multiple_choice"
        ? normalizeCorrectAnswer(
            question?.correct_answer || question?.correctAnswer || question?.answer,
            options,
          )
        : questionType === "true_false"
          ? String(question?.correct_answer || question?.correctAnswer || "true")
              .trim()
              .toLowerCase() === "false"
            ? "false"
            : "true"
          : String(
              question?.expected_answer ||
                question?.correct_answer ||
                question?.correctAnswer ||
                "",
            ).trim();

    return {
      questionText:
        question?.questionText ||
        question?.question ||
        question?.prompt ||
        question?.text ||
        `Question ${index + 1}`,
      questionType,
      options,
      correctAnswer,
      points: Number(question?.points || question?.max_score || 1),
      explanation: question?.explanation || "",
    };
  });
}
