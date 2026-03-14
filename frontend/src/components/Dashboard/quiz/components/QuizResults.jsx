// components/Dashboard/quiz/components/QuizResults.jsx
import { useMemo, useState, useEffect } from "react";
import "./QuizResults.css";
import reportsApi from "../utils/api/reportsApi";
import { useAuthContext } from "../../../../context/AuthContext";

// Recharts
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// Import utility functions (extracted to separate file)
import {
  normalizeQuizData,
  buildCategoryStats,
  buildDifficultyStats,
  buildScoreSeries,
  buildTypeDistribution,
  buildHeatmapGrid,
  getScoreColor,
  formatDuration,
  badgesFromPerformance,
  getAnswerForQuestion,
  isQuestionCorrect,
} from "../utils/quizStats";

const CHART_COLORS = [
  "#10b981",
  "#6366f1",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#06b6d4",
];

// Extracted Components for better maintainability
const ScoreCard = ({
  score,
  perfMessage,
  normalizedQuiz,
  correctCount,
  timeSpent,
  curriculum,
  badges,
}) => (
  <div className="score-card">
    <div className="score-circle">
      <div
        className="score-ring"
        style={{
          background: `conic-gradient(${perfMessage.color} ${
            score * 3.6
          }deg, #e2e8f0 0deg)`,
        }}
      >
        <div className="score-inner">
          <span className="score-value">{score}%</span>
          <span className="score-label">Overall Score</span>
        </div>
      </div>
    </div>

    <div className="performance-info">
      <div className="performance-message">
        <span className="performance-emoji">{perfMessage.emoji}</span>
        <h3 style={{ color: perfMessage.color }}>{perfMessage.text}</h3>
      </div>

      <div className="performance-stats">
        <div className="stat">
          <span className="stat-label">Time Spent</span>
          <span className="stat-value">{formatDuration(timeSpent)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Questions</span>
          <span className="stat-value">{normalizedQuiz.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Correct</span>
          <span className="stat-value">
            {correctCount}/{normalizedQuiz.length}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Curriculum</span>
          <span className="stat-value">{curriculum}</span>
        </div>
      </div>

      <BadgeList badges={badges} />
    </div>
  </div>
);

const BadgeList = ({ badges }) => (
  <div className="badges">
    {badges.map((b) => (
      <div className="badge" key={b.id} title={b.label}>
        <span className="badge-emoji">{b.emoji}</span>
        <span className="badge-label">{b.label}</span>
      </div>
    ))}
  </div>
);

const StatsGrid = ({ normalizedQuiz, correctCount, timeSpent }) => {
  const averageScore = Math.round(
    (normalizedQuiz.reduce(
      (acc, q) =>
        acc + (q.overall_score || (q.isCorrect ? q.max_score || 1 : 0)),
      0
    ) /
      (normalizedQuiz.reduce((acc, q) => acc + (q.max_score || 1), 0) || 1)) *
      100
  );

  return (
    <div className="quick-stats">
      <div className="stat-card correct">
        <div className="stat-icon">✅</div>
        <div className="stat-content">
          <div className="stat-number">{correctCount}</div>
          <div className="stat-label">Correct Answers</div>
        </div>
      </div>

      <div className="stat-card incorrect">
        <div className="stat-icon">❌</div>
        <div className="stat-content">
          <div className="stat-number">
            {normalizedQuiz.length - correctCount}
          </div>
          <div className="stat-label">Incorrect Answers</div>
        </div>
      </div>

      <div className="stat-card time">
        <div className="stat-icon">⏱️</div>
        <div className="stat-content">
          <div className="stat-number">{formatDuration(timeSpent)}</div>
          <div className="stat-label">Total Time</div>
        </div>
      </div>

      <div className="stat-card average">
        <div className="stat-icon">📊</div>
        <div className="stat-content">
          <div className="stat-number">{averageScore}%</div>
          <div className="stat-label">Average per Question</div>
        </div>
      </div>
    </div>
  );
};

const QuestionBreakdownItem = ({
  q,
  index,
  isOpen,
  onToggle,
  userAnswers,
  essayAnswers,
}) => {
  const stringId = q._normalizedId || q.id || String(index + 1);
  const userAnswer = getAnswerForQuestion(
    q,
    stringId,
    userAnswers,
    essayAnswers
  );
  const qScore =
    q.overall_score !== undefined
      ? q.overall_score
      : q.isCorrect
      ? q.max_score || 1
      : 0;

  const isEssay = q.type === "essay" || q.type === "short_answer";
  const showCorrectAnswer = !isQuestionCorrect(q) && !isEssay;

  return (
    <div
      className={`question-result ${
        isQuestionCorrect(q) ? "correct" : "incorrect"
      } ${isOpen ? "expanded" : ""}`}
    >
      <div className="question-result-header" onClick={() => onToggle(q.id)}>
        <div className="question-meta">
          <span className="question-number">Q{index + 1}</span>
          <span className="question-type">
            {(q.type || "").replaceAll("_", " ")}
          </span>
          <span className="question-difficulty">
            {q.difficulty || "medium"}
          </span>
          <span className="question-score">
            {qScore}/{q.max_score || 1}
          </span>
        </div>

        <div className="question-status">
          {isQuestionCorrect(q) ? (
            <span className="status correct">✅ Correct</span>
          ) : (
            <span className="status incorrect">❌ Incorrect</span>
          )}
          <span className="expand-icon">{isOpen ? "▼" : "▶"}</span>
        </div>
      </div>

      {isOpen && (
        <QuestionBreakdownDetails
          q={q}
          userAnswer={userAnswer}
          showCorrectAnswer={showCorrectAnswer}
        />
      )}
    </div>
  );
};

const QuestionBreakdownDetails = ({ q, userAnswer, showCorrectAnswer }) => {
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <div className="question-result-details">
      <div className="question-text">
        <strong>Question:</strong> {q.question}
      </div>

      <div className="answer-comparison">
        <div className="answer-section">
          <span className="answer-label">Your Answer:</span>
          <div
            className={`answer-value user-answer ${
              !isQuestionCorrect(q) ? "wrong" : "correct"
            }`}
          >
            {Array.isArray(userAnswer)
              ? userAnswer.join(", ")
              : userAnswer || "No answer provided"}
          </div>
        </div>

        {showCorrectAnswer && (
          <div className="answer-section">
            <span className="answer-label">Correct Answer:</span>
            <div className="answer-value correct-answer">{q.correctAnswer}</div>
          </div>
        )}

        {/* ✅ NEW: Expected Answer Display for Essay Questions */}
        {q.expectedAnswer && (
          <div className="answer-section expected">
            <span className="answer-label">Expected Answer:</span>
            <div className="answer-value expected-answer">
              {q.expectedAnswer}
            </div>
          </div>
        )}
      </div>

      {(q.feedback || q.explanation) && (
        <div className="question-feedback">
          <button
            className="explanation-toggle"
            onClick={() => setShowExplanation(!showExplanation)}
          >
            💡 {showExplanation ? "Hide" : "Show"}{" "}
            {q.feedback ? "AI Feedback" : "Explanation"}
          </button>
          {showExplanation && (
            <div className="explanation-content">
              <p>{q.feedback || q.explanation}</p>
            </div>
          )}
        </div>
      )}

      {q.rubric_breakdown && <RubricBreakdown rubric={q.rubric_breakdown} />}
    </div>
  );
};

const RubricBreakdown = ({ rubric }) => (
  <div className="rubric-breakdown">
    <h4>📋 Rubric Assessment</h4>
    {rubric.map((r, i) => (
      <div key={i} className="criterion-result">
        <div className="criterion-header">
          <span className="criterion-point">{r.point}</span>
          <span className="criterion-score">
            {r.points_awarded}/{r.max_points} points
          </span>
        </div>
        <div className="criterion-feedback">{r.feedback}</div>
      </div>
    ))}
  </div>
);

const HeatmapGrid = ({ heatmap }) => {
  // Optimized heatmap with O(1) lookup
  const cellMap = useMemo(() => {
    const map = {};
    heatmap.cells.forEach((cell) => {
      map[`${cell.r}-${cell.c}`] = cell;
    });
    return map;
  }, [heatmap.cells]);

  return (
    <div className="heatmap">
      <div className="heatmap-row header">
        <div className="heatmap-cell head">Category</div>
        {heatmap.cols.map((c) => (
          <div className="heatmap-cell head" key={`h-head-${c}`}>
            Q{c}
          </div>
        ))}
      </div>
      {heatmap.rows.map((r) => (
        <div className="heatmap-row" key={`r-${r}`}>
          <div className="heatmap-cell row-head">{r}</div>
          {heatmap.cols.map((c) => {
            const cell = cellMap[`${r}-${c}`];
            let bg = "#e5e7eb"; // unanswered
            if (cell) {
              if (cell.v === 1) bg = "#d1fae5"; // correct (green)
              else if (cell.v === 0) bg = "#fee2e2"; // wrong (red)
            }
            return (
              <div
                className="heatmap-cell"
                style={{ background: bg }}
                key={`cell-${r}-${c}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

const QuizResults = ({
  quiz = [],
  score = 0,
  resetQuiz,
  detailedResults = null,
  reportId = null,
  timeSpent = 0,
  userAnswers = {},
  essayAnswers = {},
  curriculum = "General",
  subject = "General",
  difficulty = "medium",
  onRegenerateQuiz,
  onViewAnalytics,
}) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [expanded, setExpanded] = useState(new Set());
  const [downloading, setDownloading] = useState(false);
  const { currentUser } = useAuthContext() || {};

  // ────────────────────────────────
  // ✅ CRITICAL FIX: Enhanced graded questions extraction for Model-A
  // ────────────────────────────────
  const extractGradedQuiz = useMemo(() => {
    // Priority 1: Use graded questions from backend (Model-A primary)
    if (
      detailedResults?.graded_questions &&
      Array.isArray(detailedResults.graded_questions)
    ) {
      console.log("✅ Using graded_questions from backend");
      return detailedResults.graded_questions;
    }

    // Priority 2: Use questions_with_scores from gradedResult (Model-A variant)
    if (
      detailedResults?.gradedResult?.questions_with_scores &&
      Array.isArray(detailedResults.gradedResult.questions_with_scores)
    ) {
      console.log("✅ Using questions_with_scores from gradedResult");
      return detailedResults.gradedResult.questions_with_scores;
    }

    // Priority 3: Use quiz_questions from backend
    if (
      detailedResults?.quiz_questions &&
      Array.isArray(detailedResults.quiz_questions)
    ) {
      console.log("✅ Using quiz_questions from backend");
      return detailedResults.quiz_questions;
    }

    // Priority 4: Use question_analysis from report_data
    if (
      detailedResults?.report_data?.question_analysis &&
      Array.isArray(detailedResults.report_data.question_analysis)
    ) {
      console.log("✅ Using report_data.question_analysis");
      return detailedResults.report_data.question_analysis;
    }

    // Priority 5: Fall back to original quiz
    console.log("⚠️ Using original quiz (no graded data found)");
    return quiz;
  }, [quiz, detailedResults]);

  // ────────────────────────────────
  // ✅ CRITICAL FIX: Enhanced question normalization for Model-A schema
  // ────────────────────────────────
  const normalizeGradedQuestion = (question) => {
    if (!question) return null;

    return {
      // Preserve original ID
      id: question.id || question.question_id || String(Math.random()),

      // Map Model-A fields to component expected fields
      question:
        question.question || question.question_text || "No question text",
      type: question.type || "multiple_choice",
      difficulty: question.difficulty || "medium",
      category: question.category || "General",
      max_score: question.max_score || question.max_points || 1,

      // ✅ CRITICAL: Map Model-A scoring fields
      overall_score:
        question.overall_score !== undefined
          ? question.overall_score
          : question.points_awarded !== undefined
          ? question.points_awarded
          : question.is_correct
          ? question.max_score || 1
          : 0,

      // ✅ CRITICAL: Map Model-A answer fields
      correctAnswer: question.correct_answer || question.correctAnswer,
      expectedAnswer: question.expected_answer,
      isCorrect:
        question.is_correct !== undefined
          ? question.is_correct
          : question.overall_score > 0 || question.points_awarded > 0,

      // ✅ CRITICAL: Map Model-A feedback and explanation
      feedback: question.feedback,
      explanation: question.explanation,

      // ✅ CRITICAL: Map Model-A rubric structure
      rubric_breakdown: question.rubric_points || question.rubric_breakdown,

      // Preserve options for multiple choice
      options: question.options,

      // Model-A student response fields
      student_answer: question.student_answer,
      selected_option: question.selected_option,
    };
  };

  // ────────────────────────────────
  // ✅ CRITICAL FIX: Use normalized graded questions
  // ────────────────────────────────
  const gradedQuestions = useMemo(() => {
    const questions = extractGradedQuiz?.length ? extractGradedQuiz : quiz;
    return questions.map(normalizeGradedQuestion).filter(Boolean);
  }, [extractGradedQuiz, quiz]);

  // ────────────────────────────────
  // ✅ Safe quiz normalization with stable key
  // ────────────────────────────────
  const quizKey = useMemo(
    () => JSON.stringify(gradedQuestions || []),
    [gradedQuestions]
  );

  const normalizedQuiz = useMemo(
    () => normalizeQuizData(gradedQuestions),
    [quizKey]
  );

  // ────────────────────────────────
  // ✅ CRITICAL FIX: Enhanced score calculation for Model-A
  // ────────────────────────────────
  const calculatedScore = useMemo(() => {
    // Priority 1: Use backend overall_score if available
    if (detailedResults?.overall_score !== undefined) {
      return detailedResults.overall_score;
    }

    // Priority 2: Use report data overall_score if available
    if (detailedResults?.report_data?.overall_score !== undefined) {
      return detailedResults.report_data.overall_score;
    }

    // Priority 3: Calculate from summed_score and max_total_score (Model-A weighted)
    if (
      detailedResults?.summed_score !== undefined &&
      detailedResults?.max_total_score
    ) {
      return Math.round(
        (detailedResults.summed_score / detailedResults.max_total_score) * 100
      );
    }

    // Priority 4: Calculate from normalized quiz with weighted scoring
    if (normalizedQuiz.length > 0) {
      const totalPointsAwarded = normalizedQuiz.reduce(
        (sum, q) =>
          sum + (q.overall_score || (q.isCorrect ? q.max_score || 1 : 0)),
        0
      );
      const totalPossiblePoints = normalizedQuiz.reduce(
        (sum, q) => sum + (q.max_score || 1),
        0
      );

      if (totalPossiblePoints > 0) {
        return Math.round((totalPointsAwarded / totalPossiblePoints) * 100);
      }
    }

    // Priority 5: Simple correct count fallback
    const correctCount = normalizedQuiz.filter((q) =>
      isQuestionCorrect(q)
    ).length;
    if (normalizedQuiz.length > 0) {
      return Math.round((correctCount / normalizedQuiz.length) * 100);
    }

    // Final fallback to prop score
    return score;
  }, [score, detailedResults, normalizedQuiz]);

  // ────────────────────────────────
  // ✅ CRITICAL FIX: Enhanced answer extraction for Model-A
  // ────────────────────────────────
  const normalizedUserAnswers = useMemo(() => {
    const normalized = {};
    Object.entries(userAnswers).forEach(([key, value]) => {
      normalized[String(key)] = value;
    });

    // Add Model-A student responses
    normalizedQuiz.forEach((q) => {
      if (q.student_answer && !normalized[q.id]) {
        normalized[q.id] = q.student_answer;
      }
      if (q.selected_option && !normalized[q.id]) {
        normalized[q.id] = q.selected_option;
      }
    });

    return normalized;
  }, [userAnswers, normalizedQuiz]);

  const normalizedEssayAnswers = useMemo(() => {
    const normalized = {};
    Object.entries(essayAnswers).forEach(([key, value]) => {
      normalized[String(key)] = value;
    });
    return normalized;
  }, [essayAnswers]);

  // ────────────────────────────────
  // ✅ CRITICAL FIX: Enhanced student ID extraction
  // ────────────────────────────────
  const studentId = useMemo(() => {
    // Priority 1: Use detailedResults from backend
    if (detailedResults?.student_id) {
      return detailedResults.student_id;
    }

    // Priority 2: Use currentUser context
    const storedUser =
      currentUser ||
      JSON.parse(localStorage.getItem("user")) ||
      JSON.parse(localStorage.getItem("currentUser"));

    if (storedUser) {
      return (
        storedUser.student_id ||
        storedUser.user_id ||
        storedUser._id ||
        storedUser.id ||
        "UNKNOWN"
      );
    }

    // Priority 3: Fallback
    return "UNKNOWN";
  }, [currentUser, detailedResults]);

  // ────────────────────────────────
  // ✅ Optimized derived data with stable dependencies
  // ────────────────────────────────
  const stableQuiz = useMemo(
    () => normalizedQuiz.map((q) => ({ ...q })),
    [normalizedQuiz, reportId] // ✅ FIX: Include normalizedQuiz in dependencies
  );

  const correctCount = useMemo(
    () => stableQuiz.filter((q) => isQuestionCorrect(q)).length,
    [stableQuiz]
  );

  const categoryStats = useMemo(
    () => buildCategoryStats(stableQuiz),
    [stableQuiz]
  );

  const difficultyStats = useMemo(
    () => buildDifficultyStats(stableQuiz),
    [stableQuiz]
  );

  const scoreSeries = useMemo(
    () => buildScoreSeries(stableQuiz),
    [stableQuiz] // ✅ FIX: Include stableQuiz in dependencies
  );

  const typeDistribution = useMemo(
    () => buildTypeDistribution(stableQuiz),
    [stableQuiz]
  );

  const heatmap = useMemo(
    () => buildHeatmapGrid(categoryStats, stableQuiz.length),
    [categoryStats, stableQuiz.length]
  );

  const weakest = useMemo(() => {
    if (!categoryStats.length) return { category: "N/A", score: 0 };
    return categoryStats.reduce(
      (min, c) => (c.score < min.score ? c : min),
      categoryStats[0]
    );
  }, [categoryStats]);

  const insights = useMemo(() => {
    const messages = [];
    if (calculatedScore >= 85)
      messages.push(
        "Strong conceptual mastery demonstrated across most areas."
      );
    if (calculatedScore < 60)
      messages.push(
        "Focus on fundamentals—several core gaps are impacting accuracy."
      );
    if (weakest.score < 60)
      messages.push(
        `Weakest topic detected: ${weakest.category}. Prioritize targeted practice here.`
      );

    const easy =
      difficultyStats.find((d) => d.difficulty === "EASY")?.score ?? 0;
    const hard =
      difficultyStats.find((d) => d.difficulty === "HARD")?.score ?? 0;

    if (hard >= easy)
      messages.push(
        "Great job! Performance on hard questions is catching up to easy ones."
      );
    if (!messages.length)
      messages.push("Balanced performance—keep practicing for consistency.");

    return messages;
  }, [calculatedScore, weakest, difficultyStats]);

  const badges = useMemo(
    () =>
      badgesFromPerformance({
        scorePct: calculatedScore,
        correctCount,
        total: stableQuiz.length,
        timeSpent,
      }),
    [calculatedScore, correctCount, stableQuiz.length, timeSpent]
  );

  const perfMessage = useMemo(() => {
    if (calculatedScore >= 90)
      return { text: "Outstanding!", color: "#10b981", emoji: "🏆" };
    if (calculatedScore >= 80)
      return { text: "Excellent Work!", color: "#22c55e", emoji: "⭐" };
    if (calculatedScore >= 70)
      return { text: "Great Job!", color: "#84cc16", emoji: "✨" };
    if (calculatedScore >= 60)
      return { text: "Good Effort!", color: "#eab308", emoji: "📚" };
    if (calculatedScore >= 50)
      return { text: "Keep Practicing!", color: "#f59e0b", emoji: "🎯" };
    return { text: "Room for Improvement", color: "#ef4444", emoji: "💪" };
  }, [calculatedScore]);

  // ────────────────────────────────
  // ✅ Debug logging for grading data
  // ────────────────────────────────
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.group("🔍 QuizResults Grading Debug");
      console.log("Raw quiz prop:", quiz);
      console.log("Detailed results:", detailedResults);
      console.log("Extracted graded quiz:", extractGradedQuiz);
      console.log("Graded questions:", gradedQuestions);
      console.log("Normalized quiz:", normalizedQuiz);
      console.log("Calculated score:", calculatedScore);
      console.log("Correct count:", correctCount);
      console.log("Student ID:", studentId);
      console.log("User answers:", normalizedUserAnswers);
      console.log("Essay answers:", normalizedEssayAnswers);
      console.groupEnd();
    }
  }, [
    quiz,
    detailedResults,
    extractGradedQuiz,
    gradedQuestions,
    normalizedQuiz,
    calculatedScore,
    correctCount,
    studentId,
    normalizedUserAnswers,
    normalizedEssayAnswers,
  ]);

  // ────────────────────────────────
  // ✅ Event Handlers
  // ────────────────────────────────
  const handleToggleExpand = (qid) => {
    const stringQid = String(qid); // ✅ FIX: Use stable string ID
    setExpanded((prev) => {
      const s = new Set(prev);
      s.has(stringQid) ? s.delete(stringQid) : s.add(stringQid);
      return s;
    });
  };

  const handleGenerateAndDownloadPDF = async () => {
    try {
      if (!reportId) {
        alert("No report generated for this quiz.");
        return;
      }

      setDownloading(true);
      const pdfBlob = await reportsApi.downloadPDF(
        `/api/reports/pdf/${reportId}`
      );

      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report_${reportId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);

      // Show success notification
      if (process.env.NODE_ENV === "development") {
        console.log("✅ PDF downloaded successfully");
      }
    } catch (error) {
      console.error("PDF generation/download error:", error);
      alert("Failed to generate/download the report. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadJSON = async () => {
    try {
      if (!reportId) {
        alert("No report available.");
        return;
      }

      const jsonData = await reportsApi.downloadJSON(
        `/api/reports/json/${reportId}`
      );
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
        type: "application/json",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `analytics_${reportId}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("JSON download error:", error);
      alert("Failed to download JSON.");
    }
  };

  const handleDownloadZIP = async () => {
    try {
      if (!reportId) {
        alert("No report available.");
        return;
      }

      const zipBlob = await reportsApi.downloadZIP(
        `/api/reports/download/${reportId}`
      );
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report_${reportId}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("ZIP download error:", error);
      alert("Failed to download ZIP archive.");
    }
  };

  // ────────────────────────────────
  // ✅ Effects
  // ────────────────────────────────
  useEffect(() => {
    if (!studentId || studentId === "UNKNOWN") {
      if (process.env.NODE_ENV === "development") {
        console.warn("⚠️ No valid user identifier found:", studentId);
      }
      return;
    }

    reportsApi
      .getDashboard(studentId)
      .then((res) => {
        // Dashboard data loaded but not used in current implementation
        console.log("Dashboard data loaded:", res);
      })
      .catch((err) => console.error("❌ Dashboard Error:", err));
  }, [studentId]);

  // ────────────────────────────────
  // ✅ Empty state handling
  // ────────────────────────────────
  if (!normalizedQuiz.length) {
    return (
      <div className="quiz-results">
        <div className="results-header">
          <h1>📊 Quiz Results</h1>
        </div>

        <div className="empty-results">
          <div className="empty-icon">📝</div>

          <h3>No Graded Results Found</h3>

          <p>
            You have not submitted this quiz yet, or the grading results were
            not returned from the server.
          </p>

          <div className="debug-info">
            <small>
              Debug ➜ Graded Data: {detailedResults ? "Yes" : "No"} |
              graded_questions:{" "}
              {Array.isArray(detailedResults?.graded_questions)
                ? detailedResults.graded_questions.length
                : "None"}
            </small>
          </div>

          <button className="action-btn primary" onClick={resetQuiz}>
            🎯 Generate New Quiz
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────
  // ✅ Tab Content Components
  // ────────────────────────────────
  const OverviewTab = () => (
    <div className="tab-content overview-tab">
      <div className="content-grid">
        <div className="chart-card">
          <h3>📚 Performance by Category</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={categoryStats}>
              <XAxis dataKey="category" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <ReTooltip />
              <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                {categoryStats.map((d, i) => (
                  <Cell key={i} fill={getScoreColor(d.score)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>🎯 Difficulty Analysis</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={difficultyStats}>
              <XAxis dataKey="difficulty" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <ReTooltip />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#6366f1"
                strokeWidth={3}
                dot
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>🧩 Question Type Distribution</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={typeDistribution}
                dataKey="value"
                nameKey="type"
                innerRadius={50}
                outerRadius={90}
                label
              >
                {typeDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Legend />
              <ReTooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>📈 Score per Question</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={scoreSeries}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <ReTooltip />
              <Bar dataKey="pct" fill="#06b6d4" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  const BreakdownTab = () => (
    <div className="tab-content breakdown-tab">
      <div className="questions-breakdown">
        {stableQuiz.map((q, idx) => (
          <QuestionBreakdownItem
            key={q._normalizedId || q.id || String(idx + 1)}
            q={q}
            index={idx}
            isOpen={expanded.has(String(q.id))} // ✅ FIX: Use stable string ID
            onToggle={handleToggleExpand}
            userAnswers={normalizedUserAnswers}
            essayAnswers={normalizedEssayAnswers}
          />
        ))}
      </div>
    </div>
  );

  const AnalyticsTab = () => (
    <div className="tab-content analytics-tab">
      <div className="analytics-grid">
        <div className="analytics-card">
          <h3>🔥 Performance Heatmap (Category × Question)</h3>
          <HeatmapGrid heatmap={heatmap} />
        </div>

        <div className="analytics-card">
          <h3>📈 Question Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={scoreSeries}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
              <ReTooltip />
              <Line
                type="monotone"
                dataKey="pct"
                stroke="#10b981"
                strokeWidth={3}
                dot
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  const InsightsTab = () => (
    <div className="tab-content insights-tab">
      <h3>🤖 AI Insights Summary</h3>
      <ul className="insights-list">
        {insights.map((msg, i) => (
          <li key={i} className="insight-item">
            {msg}
          </li>
        ))}
      </ul>

      <div className="spotlight">
        <h4>🔎 Spotlight</h4>
        <p>
          <strong>Weakest Topic:</strong>{" "}
          <span style={{ color: getScoreColor(weakest.score) }}>
            {weakest.category} ({weakest.score}%)
          </span>
        </p>
        <p>
          Tip: Revisit foundational concepts and practice 10–15 problems focused
          on <strong>{weakest.category}</strong> with step-by-step solutions.
        </p>
      </div>
    </div>
  );

  const RecommendationsTab = () => (
    <div className="tab-content recommendations-tab">
      <div className="recommendations-grid">
        <div className="recommendation-card">
          <h3>💡 Weakest Topic Recommendation</h3>
          <p>
            We recommend focusing on <strong>{weakest.category}</strong> (score:{" "}
            <strong style={{ color: getScoreColor(weakest.score) }}>
              {weakest.score}%
            </strong>
            ).
          </p>
          <ul className="suggestion-list">
            <li>Review summary notes and key formulas.</li>
            <li>Attempt 10 new problems ranging easy → hard.</li>
            <li>Use spaced repetition over the next 3 days.</li>
            <li>
              <button
                className="text-link"
                onClick={() => onRegenerateQuiz?.(weakest.category)}
              >
                Generate targeted practice for: <em>{weakest.category}</em>
              </button>
            </li>
          </ul>
        </div>

        <div className="recommendation-card">
          <h3>🎯 Practice Suggestions</h3>
          <ul className="suggestion-list">
            <li>Re-attempt incorrect questions and compare solutions.</li>
            <li>Practice under time constraints to improve efficiency.</li>
            <li>Mix MCQ and Essay formats to improve conceptual clarity.</li>
            <li>Schedule a follow-up quiz on similar topics in 2–3 days.</li>
          </ul>
        </div>

        <div className="recommendation-card">
          <h3>🚀 Next Steps</h3>
          <div className="next-steps">
            <button className="step-btn primary" onClick={onRegenerateQuiz}>
              🔄 Retake Similar Quiz
            </button>
            <button className="step-btn secondary" onClick={onViewAnalytics}>
              📊 View Analytics Dashboard
            </button>
            <button className="step-btn secondary" onClick={resetQuiz}>
              🎯 New Quiz on Different Topic
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ────────────────────────────────
  // ✅ Main Render
  // ────────────────────────────────
  return (
    <div className="quiz-results">
      {/* Header */}
      <div className="results-header">
        <div className="header-content">
          <h1>📊 Quiz Results</h1>
          <p>Your performance summary and insights</p>
        </div>
        <div className="header-actions">
          <button
            className="action-btn pdf-btn"
            onClick={handleGenerateAndDownloadPDF}
            disabled={downloading}
          >
            {downloading ? "⏳ Downloading..." : "📄 Download PDF"}
          </button>
          <button className="action-btn json-btn" onClick={handleDownloadJSON}>
            💾 Download JSON
          </button>
          <button className="action-btn zip-btn" onClick={handleDownloadZIP}>
            📦 Download ZIP
          </button>
        </div>
      </div>

      {/* Score Overview + Badges */}
      <div className="score-overview">
        <ScoreCard
          score={calculatedScore}
          perfMessage={perfMessage}
          normalizedQuiz={normalizedQuiz}
          correctCount={correctCount}
          timeSpent={timeSpent}
          curriculum={curriculum}
          badges={badges}
        />
        <StatsGrid
          normalizedQuiz={normalizedQuiz}
          correctCount={correctCount}
          timeSpent={timeSpent}
        />
      </div>

      {/* Tabs */}
      <div className="results-navigation">
        <div className="results-tabs">
          {[
            { id: "overview", label: "📈 Overview", icon: "📈" },
            { id: "breakdown", label: "🔍 Question Breakdown", icon: "🔍" },
            { id: "analytics", label: "📊 Analytics", icon: "📊" },
            { id: "insights", label: "🤖 AI Insights", icon: "🤖" },
            { id: "recommend", label: "💡 Recommendations", icon: "💡" },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="results-content">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "breakdown" && <BreakdownTab />}
        {activeTab === "analytics" && <AnalyticsTab />}
        {activeTab === "insights" && <InsightsTab />}
        {activeTab === "recommend" && <RecommendationsTab />}
      </div>

      {/* Bottom Actions */}
      <div className="results-actions">
        <button className="action-btn primary" onClick={resetQuiz}>
          🎯 Generate New Quiz
        </button>
        <button className="action-btn secondary" onClick={onRegenerateQuiz}>
          🔄 Retake This Quiz
        </button>
        <button className="action-btn secondary" onClick={onViewAnalytics}>
          📊 View Analytics Dashboard
        </button>
      </div>
    </div>
  );
};

export default QuizResults;
