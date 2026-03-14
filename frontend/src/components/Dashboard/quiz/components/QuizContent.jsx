// QuizContent.jsx (FIXED WITH PROPER QUESTION IDS)
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import QuestionCard from "./QuestionCard";
import "./QuizContent.css";

// Utility functions
const normalizeId = (raw, index) => {
  if (typeof raw === "number") return String(raw);
  if (!raw || raw === "" || raw === "null" || raw === "undefined")
    return String(index + 1); // CRITICAL FIX: Use numeric strings

  // Sanitize: remove special characters, keep only alphanumeric, dash, underscore
  return raw.toString().replace(/[^a-zA-Z0-9_-]/g, "_");
};

const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

const QuizContent = ({
  quiz = [],
  calculateScoreWithAI,
  timeSpent = 0,
  userAnswers = {},
  essayAnswers = {},
  onAnswerSelect,
  onEssayAnswer,
  showResults = false,
  gradingInProgress = false,
  detailedResults = null,
  currentQuestionIndex = 0,
  onQuestionNavigate,
}) => {
  /* ==========================================================
     1) BULLETPROOF QUIZ NORMALIZATION WITH NUMERIC IDs
     ========================================================== */
  const normalizeQuiz = useCallback((raw) => {
    if (!raw) {
      console.log("❌ QuizContent: No quiz data provided");
      return [];
    }

    console.group("🔍 Quiz Normalization");
    console.log("Raw input:", raw);

    let questions = [];

    // Case 1: Direct array of questions
    if (Array.isArray(raw)) {
      console.log("✅ Using direct array");
      questions = raw;
    }
    // Case 2: Nested structures (most common)
    else if (raw.questions && Array.isArray(raw.questions)) {
      console.log("✅ Using raw.questions");
      questions = raw.questions;
    } else if (raw.quiz?.questions && Array.isArray(raw.quiz.questions)) {
      console.log("✅ Using raw.quiz.questions");
      questions = raw.quiz.questions;
    } else if (raw.data?.questions && Array.isArray(raw.data.questions)) {
      console.log("✅ Using raw.data.questions");
      questions = raw.data.questions;
    } else if (raw.quiz && Array.isArray(raw.quiz)) {
      console.log("✅ Using raw.quiz array");
      questions = raw.quiz;
    } else if (raw.data && Array.isArray(raw.data)) {
      console.log("✅ Using raw.data array");
      questions = raw.data;
    }
    // Case 3: Fallback extraction from object values
    else if (typeof raw === "object") {
      console.log("🔄 Attempting fallback extraction");

      // Look for any array property that might contain questions
      const possibleArrays = Object.values(raw).filter((val) =>
        Array.isArray(val)
      );
      if (possibleArrays.length > 0) {
        // Use the largest array (most likely to be questions)
        questions = possibleArrays.reduce(
          (largest, current) =>
            current.length > largest.length ? current : largest,
          []
        );
        console.log("✅ Using largest array from object");
      }
      // Check for numerical keys (0, 1, 2...)
      else if (Object.keys(raw).every((key) => !isNaN(key))) {
        questions = Object.values(raw);
        console.log("✅ Using numerically keyed object");
      }
    }

    // Clean and validate questions with NUMERIC ID generation
    const validQuestions = questions
      .filter((q) => q && (q.question || q.text || q.prompt))
      .map((q, index) => ({
        ...q,
        // Ensure consistent structure
        question: q.question || q.text || q.prompt,
        type: q.type || "multiple_choice",
        difficulty: q.difficulty || "medium",
        max_score: q.max_score || 1,
        // CRITICAL FIX: Use simple numeric IDs that backend expects
        _normalizedId: String(index + 1), // "1", "2", "3" - NOT hashed IDs
      }));

    console.log(`📊 Normalized ${validQuestions.length} valid questions`);
    console.log(
      "Sample IDs:",
      validQuestions.slice(0, 3).map((q) => q._normalizedId)
    );
    console.groupEnd();

    return validQuestions.length > 0 ? validQuestions : [];
  }, []);

  const questions = useMemo(() => normalizeQuiz(quiz), [quiz, normalizeQuiz]);

  /* ==========================================================
     2) CRITICAL FIX: PROPER QUESTION IDS FROM QUIZ DATA
     ========================================================== */
  const questionIds = useMemo(
    () => questions.map((q) => q._normalizedId), // Use the normalized IDs from questions
    [questions]
  );

  const safeId = useCallback(
    (q, index) => q._normalizedId || String(index + 1), // Use the question's normalized ID
    []
  );

  /* ==========================================================
     3) STATE WITH AUTO-SAVE
     ========================================================== */
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answeredQuestions, setAnsweredQuestions] = useState(new Set());
  const [markedQuestions, setMarkedQuestions] = useState(new Set());
  const [timePerQuestion, setTimePerQuestion] = useState({});
  const [quizTimer, setQuizTimer] = useState(timeSpent);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs for stable tracking
  const prevQuizSignature = useRef("");
  const timerRef = useRef(null);
  const questionRefs = useRef([]);

  // Local state with auto-save
  const [localAnswers, setLocalAnswers] = useState(() => {
    try {
      const saved = localStorage.getItem("quizDraft_answers");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [localEssayAnswers, setLocalEssayAnswers] = useState(() => {
    try {
      const saved = localStorage.getItem("quizDraft_essays");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Auto-save effect
  useEffect(() => {
    try {
      localStorage.setItem("quizDraft_answers", JSON.stringify(localAnswers));
      localStorage.setItem(
        "quizDraft_essays",
        JSON.stringify(localEssayAnswers)
      );
    } catch (error) {
      console.warn("Failed to auto-save quiz progress:", error);
    }
  }, [localAnswers, localEssayAnswers]);

  // Review mode
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewFilter, setReviewFilter] = useState("all");
  const [reviewList, setReviewList] = useState({
    all: [],
    flagged: [],
    correct: [],
    incorrect: [],
  });

  /* ==========================================================
     4) IMPROVED RESET LOGIC - ONLY ON ACTUAL QUIZ CHANGE
     ========================================================== */
  useEffect(() => {
    if (questions.length === 0) return;

    // Create a signature of the current quiz content
    const currentSignature = questions.map((q) => q.question).join("|");

    // Only reset if the quiz content actually changed
    if (prevQuizSignature.current !== currentSignature) {
      console.log("🔄 QuizContent: Quiz content changed, resetting UI");

      setCurrentIndex(0);
      setAnsweredQuestions(new Set());
      setMarkedQuestions(new Set());
      setQuizTimer(0);
      setTimePerQuestion({});
      setReviewMode(false);
      questionRefs.current = [];

      prevQuizSignature.current = currentSignature;

      console.log(
        "✅ UI reset for new quiz with",
        questions.length,
        "questions"
      );
    }
  }, [questions]);

  /* ==========================================================
     5) SYNC EXTERNAL QUESTION INDEX - IMPROVED
     ========================================================== */
  useEffect(() => {
    if (questions.length === 0) return;

    const newIndex = Math.max(
      0,
      Math.min(currentQuestionIndex, questions.length - 1)
    );

    // Only update if there's a meaningful change and we're not in the middle of navigation
    if (newIndex !== currentIndex && Math.abs(newIndex - currentIndex) === 1) {
      console.log(`🔄 Syncing external index: ${currentIndex} -> ${newIndex}`);
      setCurrentIndex(newIndex);
    }
  }, [currentQuestionIndex, questions.length]);

  /* ==========================================================
     6) OPTIMIZED TIME TRACKING
     ========================================================== */
  useEffect(() => {
    if (questions.length === 0) return;

    const init = {};
    questionIds.forEach((id) => {
      init[id] = timePerQuestion[id] ?? 0;
    });
    setTimePerQuestion(init);
  }, [questionIds]);

  /* ==========================================================
     7) REVIEW MODE SETUP - FIXED TO USE PROPER QUESTION IDS
     ========================================================== */
  useEffect(() => {
    if (showResults && detailedResults) {
      console.log("🔍 Setting up review mode");
      const qa = detailedResults?.report_data?.question_analysis || [];

      const correct = qa
        .filter((x) => x.is_correct)
        .map((x) => {
          // Match with our normalized IDs
          const question = questions.find(
            (q) => q._normalizedId === String(x.question_id)
          );
          return question?._normalizedId || String(x.question_id);
        });

      const incorrect = qa
        .filter((x) => !x.is_correct)
        .map((x) => {
          const question = questions.find(
            (q) => q._normalizedId === String(x.question_id)
          );
          return question?._normalizedId || String(x.question_id);
        });

      setReviewList({
        all: questionIds, // Use the proper questionIds array
        flagged: Array.from(markedQuestions),
        correct,
        incorrect,
      });

      setReviewMode(true);
    } else {
      setReviewMode(false);
    }
  }, [showResults, detailedResults, markedQuestions, questions, questionIds]);

  /* ==========================================================
     8) OPTIMIZED ANSWER TRACKING - FIXED
     ========================================================== */
  const answeredQuestionsSet = useMemo(() => {
    if (questions.length === 0) return new Set();

    const answered = questions
      .filter((q, i) => {
        const id = safeId(q, i);
        if (q.type === "essay" || q.type === "short_answer") {
          const ea = essayAnswers[id] || localEssayAnswers[id];
          return ea && ea.trim().length > 0;
        }
        const ua = userAnswers[id] || localAnswers[id];
        return ua !== undefined && ua !== null && String(ua).trim() !== "";
      })
      .map((q, i) => safeId(q, i));

    return new Set(answered);
  }, [
    questions,
    userAnswers,
    essayAnswers,
    localAnswers,
    localEssayAnswers,
    safeId,
  ]);

  useEffect(() => {
    setAnsweredQuestions(answeredQuestionsSet);
  }, [answeredQuestionsSet]);

  /* ==========================================================
     9) LEAK-PROOF TIMER
     ========================================================== */
  useEffect(() => {
    if (gradingInProgress || showResults || questions.length === 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setQuizTimer((prev) => prev + 1);

      setTimePerQuestion((prev) => {
        const updated = { ...prev };
        const q = questions[currentIndex];
        if (q) {
          const id = safeId(q, currentIndex);
          updated[id] = (updated[id] || 0) + 1;
        }
        return updated;
      });
    }, 1000);

    // Global cleanup - ALWAYS clear on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [gradingInProgress, showResults, currentIndex, questions, safeId]);

  /* ==========================================================
     10) SCROLL TO QUESTION WITH REF RESET
     ========================================================== */
  useEffect(() => {
    if (questions.length === 0) return;

    const el = questionRefs.current[currentIndex];
    if (el) {
      try {
        // Small delay to ensure DOM is updated
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      } catch (error) {
        console.warn("Scroll failed:", error);
      }
    }
  }, [currentIndex, questions.length]);

  /* ==========================================================
     11) DEBOUNCED ANSWER HANDLERS
     ========================================================== */
  const debouncedEssayAnswer = useRef(
    debounce((qid, answer, onEssayAnswer) => {
      onEssayAnswer?.(qid, answer);
    }, 500)
  ).current;

  const handleAnswerSelect = useCallback(
    (qid, answer) => {
      if (showResults || gradingInProgress || questions.length === 0) return;

      console.log("🎯 Answer selected:", qid, answer);

      setLocalAnswers((prev) => ({ ...prev, [qid]: answer }));
      onAnswerSelect?.(qid, answer);
    },
    [showResults, gradingInProgress, questions.length, onAnswerSelect]
  );

  const handleEssayAnswer = useCallback(
    (qid, answer) => {
      if (showResults || gradingInProgress || questions.length === 0) return;

      console.log("📝 Essay answer:", qid, answer.substring(0, 50) + "...");

      setLocalEssayAnswers((prev) => ({ ...prev, [qid]: answer }));
      debouncedEssayAnswer(qid, answer, onEssayAnswer);
    },
    [
      showResults,
      gradingInProgress,
      questions.length,
      onEssayAnswer,
      debouncedEssayAnswer,
    ]
  );

  /* ==========================================================
     12) OPTIMIZED ANSWER GETTERS
     ========================================================== */
  const getCurrentAnswer = useCallback(
    (questionId) => localAnswers[questionId] ?? userAnswers[questionId] ?? "",
    [localAnswers, userAnswers]
  );

  const getCurrentEssayAnswer = useCallback(
    (questionId) =>
      localEssayAnswers[questionId] ?? essayAnswers[questionId] ?? "",
    [localEssayAnswers, essayAnswers]
  );

  /* ==========================================================
     13) KEYBOARD SHORTCUTS
     ========================================================== */
  useEffect(() => {
    if (showResults || gradingInProgress) return;

    const handleKeyDown = (e) => {
      // Navigation
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "Enter" && currentIndex < questions.length - 1)
        handleNext();

      // Quick answer selection (A, B, C, D, 1, 2, 3, 4)
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        const key = e.key.toUpperCase();
        const currentQ = questions[currentIndex];

        if (currentQ?.type === "multiple_choice" && currentQ.options) {
          const optionIndex = "ABCD".indexOf(key);
          if (optionIndex >= 0 && optionIndex < currentQ.options.length) {
            handleAnswerSelect(
              safeId(currentQ, currentIndex),
              "ABCD"[optionIndex]
            );
          }

          const numIndex = "1234".indexOf(key);
          if (numIndex >= 0 && numIndex < currentQ.options.length) {
            handleAnswerSelect(
              safeId(currentQ, currentIndex),
              "ABCD"[numIndex]
            );
          }
        }

        // True/False shortcuts
        if (currentQ?.type === "true_false") {
          if (key === "T")
            handleAnswerSelect(safeId(currentQ, currentIndex), "true");
          if (key === "F")
            handleAnswerSelect(safeId(currentQ, currentIndex), "false");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentIndex,
    questions,
    showResults,
    gradingInProgress,
    handleAnswerSelect,
    safeId,
  ]);

  /* ==========================================================
     14) STABLE NAVIGATION - FIXED
     ========================================================== */
  const goToQuestion = useCallback(
    (i) => {
      if (questions.length === 0) return;

      const idx = Math.max(0, Math.min(i, questions.length - 1));

      // Only update if actually changing
      if (idx !== currentIndex) {
        console.log(
          `🔄 Navigating to question ${idx + 1} of ${questions.length}`
        );
        setCurrentIndex(idx);
        onQuestionNavigate?.(idx);
      }
    },
    [questions.length, currentIndex, onQuestionNavigate]
  );

  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      goToQuestion(currentIndex + 1);
    }
  }, [currentIndex, questions.length, goToQuestion]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      goToQuestion(currentIndex - 1);
    }
  }, [currentIndex, goToQuestion]);

  /* ==========================================================
     15) MARK QUESTION - FIXED
     ========================================================== */
  const handleMarkQuestion = useCallback(() => {
    if (questions.length === 0) return;

    const currentQuestionId = safeId(questions[currentIndex], currentIndex);
    setMarkedQuestions((prev) => {
      const s = new Set(prev);
      s.has(currentQuestionId)
        ? s.delete(currentQuestionId)
        : s.add(currentQuestionId);
      return s;
    });
  }, [questions, currentIndex, safeId]);

  /* ==========================================================
     16) CRITICAL FIX: SUBMIT QUIZ WITH BACKEND-COMPATIBLE PAYLOAD
     ========================================================== */
  const handleSubmitQuiz = async () => {
    if (isSubmitting || questions.length === 0) return;

    const unanswered = questions.filter((q, i) => {
      const id = safeId(q, i);
      if (q.type === "essay" || q.type === "short_answer") {
        const answer = getCurrentEssayAnswer(id);
        return !answer || answer.trim() === "";
      }
      const answer = getCurrentAnswer(id);
      return !answer || String(answer).trim() === "";
    }).length;

    if (unanswered > 0) {
      const proceed = window.confirm(
        `You have ${unanswered} unanswered question${
          unanswered > 1 ? "s" : ""
        }. Submit anyway?`
      );
      if (!proceed) return;
    }

    console.log("📤 Submitting quiz with backend-compatible payload...");
    setIsSubmitting(true);

    try {
      // CRITICAL FIX: Prepare backend-compatible question data
      const quiz_questions = questions.map((q, i) => ({
        question_id: safeId(q, i), // Use the safeId that matches our normalized IDs
        question: q.question,
        type: q.type,
        options: q.options || [],
        correct_answer: q.correctAnswer || "", // Backend expects "correct_answer"
        max_score: q.max_score || 1,
        explanation: q.explanation || "",
        difficulty: q.difficulty || "medium",
        category: q.category || "General",
        rubric_points: q.rubric_points || [],
      }));

      // CRITICAL FIX: Normalize student answers to use string keys
      const student_answers = {};
      questions.forEach((q, i) => {
        const questionId = safeId(q, i);
        if (q.type === "essay" || q.type === "short_answer") {
          const answer = getCurrentEssayAnswer(questionId);
          if (answer && answer.trim()) {
            student_answers[questionId] = answer.trim();
          }
        } else {
          const answer = getCurrentAnswer(questionId);
          if (answer && String(answer).trim()) {
            student_answers[questionId] = String(answer).trim();
          }
        }
      });

      // CRITICAL FIX: Send backend-compatible payload
      await calculateScoreWithAI({
        quiz_questions, // Backend expects this exact field name
        student_answers, // Backend expects this exact field name
        timeSpent: quizTimer,
        totalQuestions: questions.length,
        // Include additional context for backend
        subject: questions[0]?.subject || "General",
        curriculum: questions[0]?.curriculum || "IGCSE",
        assignment_name: "AI-Generated Quiz",
      });

      // Clear auto-save on successful submission
      localStorage.removeItem("quizDraft_answers");
      localStorage.removeItem("quizDraft_essays");
    } catch (error) {
      console.error("❌ Quiz submission failed:", error);
      alert("Failed to submit quiz: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ==========================================================
     17) HELPERS
     ========================================================== */
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const progress = questions.length
    ? Math.round((answeredQuestions.size / questions.length) * 100)
    : 0;

  /* ==========================================================
     18) EMPTY STATE
     ========================================================== */
  if (!questions.length) {
    return (
      <div className="quiz-content-empty">
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <h3>No Questions Available</h3>
          <p>
            Generate a quiz to get started, or check the console for errors.
          </p>
          <div className="debug-info">
            <small>
              Debug: Received {typeof quiz} | Array:{" "}
              {Array.isArray(quiz) ? "Yes" : "No"}
            </small>
          </div>
        </div>
      </div>
    );
  }

  /* ==========================================================
     19) RENDER UI
     ========================================================== */
  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) {
    return (
      <div className="quiz-content-empty">
        <div className="empty-state">
          <div className="empty-icon">⚠️</div>
          <h3>Question Not Found</h3>
          <p>Current question index is invalid.</p>
        </div>
      </div>
    );
  }

  const currentQuestionId = safeId(currentQuestion, currentIndex);

  // Navigation debug info - NOW SHOULD MATCH
  console.log("🔍 Navigation Debug:", {
    currentIndex,
    questionsLength: questions.length,
    currentQuestionId,
    questionIds: questionIds, // Show all question IDs
    questionIdsLength: questionIds.length,
  });

  return (
    <div className="quiz-content">
      {/* HEADER */}
      <div className="quiz-header">
        <h2>{showResults ? "✔ Review Mode" : "📝 Quiz In Progress"}</h2>

        <div className="quiz-meta">
          <span>⏱ {formatTime(quizTimer)}</span>
          <span>
            📊 {answeredQuestions.size}/{questions.length} answered
          </span>
          <span>🎯 {currentQuestion?.difficulty || "Medium"}</span>
          <span>📚 {currentQuestion?.subject || "General"}</span>
        </div>

        <div className="quiz-progress">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span>{progress}% Complete</span>
        </div>

        {/* Keyboard Shortcuts Hint */}
        {!showResults && (
          <div className="keyboard-hints">
            <small>
              🎮 Use ← → arrows, Enter to navigate, A/B/C/D to answer
            </small>
          </div>
        )}
      </div>

      {/* LAYOUT */}
      <div className="quiz-layout">
        {/* SIDEBAR */}
        <div className="questions-sidebar">
          <div className="sidebar-header">
            <h4>Questions</h4>
            <span>{questions.length} total</span>
          </div>

          <div className="questions-grid">
            {questions.map((q, i) => {
              const id = safeId(q, i);
              const isCurrent = i === currentIndex;
              const isAnswered = answeredQuestions.has(id);
              const isMarked = markedQuestions.has(id);

              return (
                <button
                  key={`nav-${id}`}
                  className={`question-nav-btn 
                    ${isCurrent ? "current" : ""} 
                    ${isAnswered ? "answered" : ""} 
                    ${isMarked ? "marked" : ""}`}
                  onClick={() => goToQuestion(i)}
                  title={`Question ${i + 1}${isAnswered ? " (Answered)" : ""}${
                    isMarked ? " (Marked)" : ""
                  }`}
                >
                  Q{i + 1}
                  {isMarked && " 📍"}
                  {isAnswered && " ✓"}
                </button>
              );
            })}
          </div>
        </div>

        {/* MAIN PANEL */}
        <div className="questions-main">
          <div ref={(el) => (questionRefs.current[currentIndex] = el)}>
            <QuestionCard
              key={currentQuestionId}
              question={currentQuestion}
              questionNumber={currentIndex + 1}
              userAnswer={getCurrentAnswer(currentQuestionId)}
              essayAnswer={getCurrentEssayAnswer(currentQuestionId)}
              onAnswerSelect={handleAnswerSelect}
              onEssayAnswer={handleEssayAnswer}
              showResults={showResults}
              disabled={gradingInProgress || showResults}
              timeSpentOnQuestion={timePerQuestion[currentQuestionId] || 0}
            />

            {/* NAVIGATION */}
            {!showResults && (
              <div className="question-navigation">
                <button
                  onClick={handlePrev}
                  disabled={currentIndex === 0 || gradingInProgress}
                >
                  ← Previous
                </button>

                <button
                  onClick={handleMarkQuestion}
                  disabled={gradingInProgress}
                >
                  {markedQuestions.has(currentQuestionId)
                    ? "📍 Unmark"
                    : "📍 Mark"}
                </button>

                {currentIndex === questions.length - 1 ? (
                  <button
                    className="submit-btn"
                    onClick={handleSubmitQuiz}
                    disabled={isSubmitting || gradingInProgress}
                  >
                    {isSubmitting ? "Submitting..." : "📤 Submit Quiz"}
                  </button>
                ) : (
                  <button onClick={handleNext} disabled={gradingInProgress}>
                    Next →
                  </button>
                )}
              </div>
            )}
          </div>

          {/* GRADING OVERLAY */}
          {gradingInProgress && (
            <div className="grading-overlay">
              <div className="grading-content">
                <div className="grading-spinner" />
                <h3>AI is grading your quiz...</h3>
                <p>This may take a few moments</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuizContent;
