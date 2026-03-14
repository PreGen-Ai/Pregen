// hooks/useQuizLogic.js
import { useState, useEffect, useCallback, useRef } from "react";
import quizApi from "../utils/api/quizApi";
import reportsApi from "../utils/api/reportsApi";
import { handleApiError, ApiError } from "../utils/errorHandler";
import { useQuizTimer } from "./useQuizTimer";
import useQuizAnalytics from "./useQuizAnalytics";

/**
 * useQuizLogic
 *
 * - Full lifecycle: generate quiz, track time, collect answers, AI-grade, export/import, analytics.
 * - Produces payload compatible with backend EnhancedGradingRequest.
 * - Defensive and resilient: tolerates many backend shapes (quiz, questions, graded_questions, question_analysis).
 */

/* -------------------------
   Helpers
-------------------------*/
const generateStableHash = (str = "") => {
  // small, stable hash for fallback IDs
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36).slice(0, 8);
};

const safeString = (v, fallback = "") =>
  v === null || v === undefined ? fallback : String(v);

const extractQuestionArray = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.questions)) return payload.questions;
  if (Array.isArray(payload.quiz)) return payload.quiz;
  if (Array.isArray(payload.graded_questions)) return payload.graded_questions;
  if (
    payload.report_data?.question_analysis &&
    Array.isArray(payload.report_data.question_analysis)
  )
    return payload.report_data.question_analysis;
  // fallback: choose the largest array
  if (typeof payload === "object") {
    const arrays = Object.values(payload).filter((x) => Array.isArray(x));
    if (arrays.length) {
      return arrays.reduce((a, b) => (b.length > a.length ? b : a), arrays[0]);
    }
  }
  return [];
};

const normalizeIncomingQuestion = (raw, idx, defaults = {}) => {
  // Accept many shapes, produce canonical question object used in frontend and for grading payload.
  const text =
    raw.question ||
    raw.text ||
    raw.prompt ||
    raw.question_text ||
    `Question ${idx + 1}`;
  const id = safeString(
    raw.id ||
      raw.question_id ||
      raw._normalizedId ||
      `q_${generateStableHash(text)}_${idx + 1}`
  );
  const typeRaw = (raw.type || raw.question_type || "")
    .toString()
    .toLowerCase();
  const type =
    typeRaw.includes("essay") || typeRaw === "short_answer"
      ? "essay"
      : typeRaw.includes("true") || typeRaw === "true_false"
      ? "true_false"
      : "multiple_choice";

  const options =
    raw.options ||
    raw.choices ||
    raw.answers ||
    (type === "multiple_choice"
      ? ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4"]
      : []);
  const correctAnswer =
    raw.correct_answer ?? raw.correctAnswer ?? raw.answer ?? "";
  const expectedAnswer =
    raw.expected_answer ?? raw.expectedAnswer ?? raw.expected ?? "";
  const rubric_points =
    raw.rubric_points || raw.rubric || raw.rubric_breakdown || [];
  const solution_steps =
    raw.solution_steps || raw.solutionSteps || raw.solution || [];
  const max_score =
    Number(raw.max_score ?? raw.maxScore ?? (type === "essay" ? 10 : 1)) ||
    (type === "essay" ? 10 : 1);

  return {
    id,
    question: safeString(text),
    type,
    options: Array.isArray(options) ? options : [],
    correct_answer: safeString(correctAnswer),
    expected_answer: safeString(expectedAnswer),
    rubric_points: Array.isArray(rubric_points) ? rubric_points : [],
    solution_steps: Array.isArray(solution_steps) ? solution_steps : [],
    max_score,
    difficulty: raw.difficulty || defaults.difficulty || "medium",
    category: raw.category || raw.topic || defaults.subject || "General",
    explanation: raw.explanation || raw.explain || "",
    raw: raw, // keep original for debugging if needed
  };
};

/* -------------------------
   Hook
-------------------------*/
const useQuizLogic = (initialStudentId = "STU_2025_00001") => {
  // State
  const [quiz, setQuiz] = useState([]); // canonical array of normalized questions
  const [loading, setLoading] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [gradingInProgress, setGradingInProgress] = useState(false);

  const [topic, setTopic] = useState("");
  const [curriculum, setCurriculum] = useState("IGCSE");
  const [subject, setSubject] = useState("General");
  const [difficulty, setDifficulty] = useState("medium");
  const [gradeLevel, setGradeLevel] = useState("high school");
  const [questionType, setQuestionType] = useState("multiple_choice");
  const [numQuestions, setNumQuestions] = useState(5);
  const [language, setLanguage] = useState("English");

  const [userAnswers, setUserAnswers] = useState({}); // for MCQ/TF: { questionId: "A" | "B" | "True" ...}
  const [essayAnswers, setEssayAnswers] = useState({}); // for essay: { questionId: "text" }
  const [markedQuestions, setMarkedQuestions] = useState([]); // use array instead of Set for safe JSON

  const [score, setScore] = useState(0);
  const [detailedResults, setDetailedResults] = useState(null);
  const [reportId, setReportId] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [jsonUrl, setJsonUrl] = useState(null);
  const [alertMessage, setAlertMessage] = useState("");

  // analytics & timer
  const { timeSpent, startTimer, stopTimer, resetTimer } = useQuizTimer();
  const {
    loadStudentProgress,
    updateAnalytics,
    fetchStudyRecommendations: hookFetchStudyRecommendations,
  } = useQuizAnalytics(initialStudentId);

  // refs for stale responses / abort semantics
  const mountedRef = useRef(true);
  const generationNonceRef = useRef(0); // track latest generateQuiz run to ignore stale responses

  useEffect(() => {
    mountedRef.current = true;
    // initial load of student progress (non-blocking)
    (async () => {
      try {
        await loadStudentProgress();
      } catch (err) {
        // swallow — not critical
        console.warn("loadStudentProgress failed:", err);
      }
    })();

    return () => {
      mountedRef.current = false;
    };
  }, [loadStudentProgress]);

  // Reset local state
  const resetState = useCallback(() => {
    setQuizStarted(false);
    setShowResults(false);
    setUserAnswers({});
    setEssayAnswers({});
    setMarkedQuestions([]);
    setDetailedResults(null);
    setReportId(null);
    setPdfUrl(null);
    setJsonUrl(null);
    setScore(0);
    setAlertMessage("");
    resetTimer();
  }, [resetTimer]);

  const resetQuiz = useCallback(() => {
    resetState();
    setQuiz([]);
  }, [resetState]);

  /* =========================
     Generate Quiz
     - Accepts externalQuiz (object/array) or calls backend
     - Defensive: ignores stale responses using nonce
  =========================*/
  const generateQuiz = useCallback(
    async (externalQuiz = null) => {
      const nonce = ++generationNonceRef.current;

      // helper to set normalized quiz in state
      const setNormalizedQuiz = (rawArray) => {
        const normalized = rawArray.map((r, i) =>
          normalizeIncomingQuestion(r, i, { difficulty, subject })
        );
        // ensure stable IDs and remove duplicates
        const seen = new Set();
        const dedup = [];
        normalized.forEach((q) => {
          if (!q.id)
            q.id = `q_${generateStableHash(q.question)}_${Math.random()
              .toString(36)
              .slice(2, 6)}`;
          if (!seen.has(q.id)) {
            seen.add(q.id);
            dedup.push(q);
          }
        });
        setQuiz(dedup);
        setQuizStarted(true);
        startTimer();
        // optimistic analytics update (start)
        try {
          updateAnalytics(
            0,
            topic || dedup[0]?.category || "General",
            0,
            dedup.length
          );
        } catch (e) {
          // ignore analytics errors
        }
      };

      // If external payload provided, normalize and use it
      if (externalQuiz) {
        try {
          const arr = extractQuestionArray(externalQuiz);
          if (!arr.length) {
            setAlertMessage(
              "❌ Provided quiz is invalid or contains no questions."
            );
            return;
          }
          setNormalizedQuiz(arr);
          setAlertMessage(`✅ Loaded ${arr.length} questions (external).`);
          return;
        } catch (err) {
          console.error("Error normalizing external quiz:", err);
          setAlertMessage("❌ Failed to load external quiz.");
          return;
        }
      }

      // Backend generation
      if (!topic || !topic.trim()) {
        setAlertMessage("⚠️ Please enter a topic to generate a quiz.");
        return;
      }

      setLoading(true);
      resetState();

      try {
        const params = {
          topic: topic.trim(),
          num_questions: numQuestions,
          question_type:
            questionType === "mixed"
              ? "mixed"
              : questionType === "essay"
              ? "essay"
              : questionType === "true_false"
              ? "true_false"
              : "multiple_choice",
          difficulty,
          grade_level: gradeLevel,
          subject,
          language,
          curriculum,
        };

        // call quizApi — it returns normalized object or array (we handle shapes)
        const res = await quizApi.generateQuiz(params);

        // check for stale response
        if (nonce !== generationNonceRef.current || !mountedRef.current) {
          console.warn("Ignored stale quiz generation result");
          return;
        }

        const arr = extractQuestionArray(res || {});
        if (!arr.length) {
          throw new Error("Backend returned no questions.");
        }

        setNormalizedQuiz(arr);
        setAlertMessage(
          `✅ Generated ${arr.length} questions on "${params.topic}"`
        );
      } catch (err) {
        console.error("Quiz generation error:", err);
        const friendly =
          err instanceof ApiError
            ? err.message
            : handleApiError(err, "quiz generation");
        setAlertMessage(String(friendly));
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [
      topic,
      numQuestions,
      questionType,
      difficulty,
      gradeLevel,
      subject,
      language,
      curriculum,
      startTimer,
      updateAnalytics,
      resetState,
    ]
  );

  /* =========================
     Validation helpers
  =========================*/
  const allQuestionsAnswered = useCallback(() => {
    if (!quiz || !quiz.length) return false;
    return quiz.every((q) => {
      const id = String(q.id);
      if (q.type === "multiple_choice" || q.type === "true_false") {
        const ans = userAnswers[id];
        return ans !== undefined && String(ans).trim() !== "";
      }
      if (q.type === "essay" || q.type === "short_answer") {
        const text = essayAnswers[id];
        return text && String(text).trim().length > 0;
      }
      return true;
    });
  }, [quiz, userAnswers, essayAnswers]);

  const getAnsweredCount = useCallback(() => {
    const mcqCount = Object.keys(userAnswers).filter(
      (k) =>
        userAnswers[k] !== undefined && String(userAnswers[k]).trim() !== ""
    ).length;
    const essayCount = Object.keys(essayAnswers).filter(
      (k) => essayAnswers[k] && String(essayAnswers[k]).trim().length > 0
    ).length;
    return mcqCount + essayCount;
  }, [userAnswers, essayAnswers]);

  /* =========================
     Answer handlers
  =========================*/
  const handleAnswerSelect = useCallback((questionId, option) => {
    setUserAnswers((prev) => ({ ...prev, [String(questionId)]: option }));
  }, []);

  const handleEssayAnswer = useCallback((questionId, text) => {
    setEssayAnswers((prev) => ({ ...prev, [String(questionId)]: text }));
  }, []);

  const handleMarkQuestion = useCallback((questionId) => {
    setMarkedQuestions((prev) => {
      const arr = Array.isArray(prev) ? [...prev] : [];
      const id = String(questionId);
      const idx = arr.indexOf(id);
      if (idx === -1) arr.push(id);
      else arr.splice(idx, 1);
      return arr;
    });
  }, []);

  /* =========================
     Grade with AI
     - Builds EnhancedGradingRequest-compatible payload
  =========================*/
  const calculateScoreWithAI = useCallback(async () => {
    if (!quiz || !quiz.length) {
      setAlertMessage("❌ No quiz to grade.");
      return;
    }
    if (!allQuestionsAnswered()) {
      setAlertMessage("⚠️ Please answer all questions before submitting.");
      return;
    }

    setGradingInProgress(true);
    setAlertMessage("🤖 AI is grading your quiz...");

    try {
      // merge answers
      const normalizedAnswers = {};
      // MCQ/TF
      Object.entries(userAnswers).forEach(([k, v]) => {
        normalizedAnswers[String(k)] = v;
      });
      // Essay
      Object.entries(essayAnswers).forEach(([k, v]) => {
        normalizedAnswers[String(k)] = v;
      });

      // normalize questions into backend shape
      const normalizedQuestions = quiz.map((q, i) => ({
        question_id: String(q.id || `q${i + 1}`),
        question: q.question,
        type: q.type,
        options: q.options || [],
        correct_answer: q.correct_answer || q.correctAnswer || "",
        expected_answer: q.expected_answer || q.expectedAnswer || "",
        rubric_points: q.rubric_points || q.rubric || [],
        solution_steps: q.solution_steps || q.solutionSteps || [],
        max_score: Number(
          q.max_score || q.max_score === 0
            ? q.max_score
            : q.type === "essay"
            ? 10
            : 1
        ),
        difficulty: q.difficulty || "medium",
        category: q.category || q.topic || subject || "General",
        explanation: q.explanation || "",
      }));

      const payload = {
        student_id: initialStudentId,
        assignment_name: topic || "AI-Generated Quiz",
        subject: subject || "General",
        curriculum: curriculum || "General",
        language: language || "English",
        assignment_data: {
          questions: normalizedQuestions,
          metadata: {
            topic: topic || normalizedQuestions[0]?.category || "General",
            total_questions: normalizedQuestions.length,
            time_spent: Number(timeSpent || 0),
          },
        },
        student_answers: normalizedAnswers,
      };

      console.log("Grading payload ->", payload);

      // call quizApi.gradeQuiz (it wraps /api/grade-quiz)
      const result = await quizApi.gradeQuiz({
        student_id: payload.student_id,
        assignment_name: payload.assignment_name,
        subject: payload.subject,
        curriculum: payload.curriculum,
        language: payload.language,
        assignment_data: payload.assignment_data,
        student_answers: payload.student_answers,
      });

      console.log("Grading result ->", result);

      // compatibility: quizApi.gradeQuiz returns { ok, reportId, gradedResult, ... } per our earlier adapter
      const graded = result?.gradedResult ?? result;

      // Validate graded output
      const hasGradedQuestions =
        Array.isArray(graded?.graded_questions) ||
        Array.isArray(graded?.graded_questions);
      if (!graded || !hasGradedQuestions) {
        console.error("Invalid grading response:", graded);
        setAlertMessage("❌ AI grading failed. Try again later.");
        return;
      }

      // Determine final score in a clear way (avoid mixing ?? with logical operators)
      let finalScore = 0;
      if (
        graded &&
        typeof graded.overall_score !== "undefined" &&
        graded.overall_score !== null
      ) {
        finalScore = graded.overall_score;
      } else if (
        graded &&
        typeof graded.score !== "undefined" &&
        graded.score !== null
      ) {
        finalScore = graded.score;
      } else if (
        graded &&
        graded.report_data &&
        typeof graded.report_data.overall_score !== "undefined"
      ) {
        finalScore = graded.report_data.overall_score;
      } else {
        finalScore = 0;
      }

      setDetailedResults(graded);
      setReportId(result?.reportId ?? graded.report_id ?? null);
      setPdfUrl(result?.pdfUrl ?? graded.pdf_url ?? null);
      setJsonUrl(result?.jsonUrl ?? graded.json_url ?? null);
      setScore(finalScore);

      stopTimer();
      setShowResults(true);

      setAlertMessage(`✅ Quiz graded — score: ${finalScore}`);

      // update analytics with final outcome (best-effort)
      try {
        updateAnalytics(
          finalScore,
          topic || subject,
          Number(timeSpent || 0),
          quiz.length
        );
      } catch (e) {
        console.warn("updateAnalytics error:", e);
      }
    } catch (err) {
      console.error("AI grading error:", err);
      setAlertMessage(handleApiError(err, "AI grading"));
    } finally {
      if (mountedRef.current) setGradingInProgress(false);
    }
  }, [
    quiz,
    userAnswers,
    essayAnswers,
    allQuestionsAnswered,
    initialStudentId,
    topic,
    subject,
    curriculum,
    language,
    timeSpent,
    stopTimer,
    updateAnalytics,
  ]);

  /* =========================
     Export / Import quiz data (safe)
  =========================*/
  const exportQuizData = useCallback(() => {
    const data = {
      quiz,
      userAnswers,
      essayAnswers,
      settings: {
        topic,
        curriculum,
        subject,
        difficulty,
        gradeLevel,
        questionType,
        numQuestions,
        language,
      },
      results: { score, detailedResults, timeSpent, reportId, pdfUrl, jsonUrl },
    };

    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quiz-export-${(topic || "export").replace(
        /\s+/g,
        "_"
      )}-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setAlertMessage("✅ Quiz exported.");
    } catch (err) {
      console.error("Export failed:", err);
      setAlertMessage("❌ Quiz export failed.");
    }
  }, [
    quiz,
    userAnswers,
    essayAnswers,
    topic,
    curriculum,
    subject,
    difficulty,
    gradeLevel,
    questionType,
    numQuestions,
    language,
    score,
    detailedResults,
    timeSpent,
    reportId,
    pdfUrl,
    jsonUrl,
  ]);

  const importQuizData = useCallback(
    (data) => {
      try {
        const arr = extractQuestionArray(data.quiz || data.questions || data);
        if (!arr.length) throw new Error("No questions found");

        const normalized = arr.map((q, i) =>
          normalizeIncomingQuestion(q, i, { difficulty, subject })
        );
        setQuiz(normalized);
        setUserAnswers(data.userAnswers || {});
        setEssayAnswers(data.essayAnswers || {});
        setAlertMessage("✅ Quiz imported");
      } catch (err) {
        console.error("Import failed:", err);
        setAlertMessage("❌ Failed to import quiz");
      }
    },
    [difficulty, subject]
  );

  /* =========================
     Additional helpers
  =========================*/

  // wrapper name changed to avoid redeclaration with hook-provided function
  const fetchStudyRecs = useCallback(async () => {
    try {
      if (typeof hookFetchStudyRecommendations === "function") {
        return await hookFetchStudyRecommendations();
      }
      return [];
    } catch (err) {
      console.warn("fetchStudyRecs error:", err);
      return [];
    }
  }, [hookFetchStudyRecommendations]);

  const fetchStudentProgress = useCallback(
    async (studentId = initialStudentId, days = 30) => {
      try {
        const progress = await reportsApi.getStudentProgress(studentId, days);
        return progress;
      } catch (err) {
        console.warn("fetchStudentProgress error:", err);
        return null;
      }
    },
    [initialStudentId]
  );

  /* =========================
     Computed values
  =========================*/
  const questionList = quiz || [];
  const hasQuiz = questionList.length > 0;
  const canSubmit = allQuestionsAnswered();
  const progressPercentage = questionList.length
    ? Math.round((getAnsweredCount() / questionList.length) * 100)
    : 0;

  /* =========================
     Return API
  =========================*/
  return {
    // state
    quiz,
    loading,
    quizStarted,
    showResults,
    gradingInProgress,

    // settings
    topic,
    setTopic,
    curriculum,
    setCurriculum,
    subject,
    setSubject,
    difficulty,
    setDifficulty,
    gradeLevel,
    setGradeLevel,
    questionType,
    setQuestionType,
    numQuestions,
    setNumQuestions,
    language,
    setLanguage,

    // answers & marks
    userAnswers,
    essayAnswers,
    markedQuestions,
    handleAnswerSelect,
    handleEssayAnswer,
    handleMarkQuestion,

    // actions
    generateQuiz,
    calculateScoreWithAI,
    resetQuiz,
    exportQuizData,
    importQuizData,

    // results
    score,
    detailedResults,
    reportId,
    pdfUrl,
    jsonUrl,
    alertMessage,
    setAlertMessage,

    // analytics/timer
    timeSpent,
    fetchStudyRecs, // renamed wrapper
    fetchStudentProgress,

    // computed
    hasQuiz,
    canSubmit,
    progressPercentage,
    questionList,
  };
};

export default useQuizLogic;
