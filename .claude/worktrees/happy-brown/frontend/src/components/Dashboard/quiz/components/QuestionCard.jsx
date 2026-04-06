// QuestionCard.jsx (FIXED WITH STABLE QUESTION IDs)
import { useState, useEffect, useMemo, useCallback } from "react";
import "./QuestionCard.css";

// Utility functions
const normalizeId = (raw, index) => {
  if (typeof raw === "number") return String(raw);
  if (!raw || raw === "" || raw === "null" || raw === "undefined")
    return `q_${index + 1}`;

  // Sanitize: remove special characters, keep only alphanumeric, dash, underscore
  return raw.toString().replace(/[^a-zA-Z0-9_-]/g, "_");
};

const cleanValue = (value) => {
  if (value == null) return "";
  return value.toString().trim().toUpperCase();
};

// Generate stable hash from string
const generateStableHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36).substring(0, 8);
};

const QuestionCard = ({
  question,
  questionNumber,
  userAnswer,
  essayAnswer,
  onAnswerSelect,
  onEssayAnswer,
  showResults = false,
  isCorrect = null,
  overallScore = null,
  maxScore = null,
  feedback = "",
  rubricBreakdown = null,
  timeSpentOnQuestion = 0,
  disabled = false,
}) => {
  /* ==========================================================
     STABLE UNIQUE QUESTION ID - FIXED VERSION
  ========================================================== */
  const safeId = useMemo(() => {
    // Priority 1: Use existing normalized ID if available
    if (question?._normalizedId) {
      return question._normalizedId;
    }

    // Priority 2: Use provided ID if valid
    if (question?.id && question.id !== "" && question.id !== "null") {
      return normalizeId(question.id, questionNumber);
    }

    // Priority 3: Generate stable ID from question content + number
    const contentBase = question?.question || "question";
    const contentHash = generateStableHash(contentBase);

    // Include question number for uniqueness but don't rely solely on it
    return `q_${contentHash}_${questionNumber}`;
  }, [
    question?._normalizedId,
    question?.id,
    question?.question,
    questionNumber,
  ]);

  /* ==========================================================
     LOCAL STATE WITH DEBOUNCED SYNC
  ========================================================== */
  const [selectedOption, setSelectedOption] = useState("");
  const [essayText, setEssayText] = useState("");
  const [debouncedEssayText, setDebouncedEssayText] = useState("");

  // Initialize state from props
  useEffect(() => {
    if (userAnswer != null && userAnswer !== selectedOption) {
      setSelectedOption(userAnswer);
    }
    if (essayAnswer != null && essayAnswer !== essayText) {
      setEssayText(essayAnswer);
    }
  }, []); // Run only once on mount

  // Debounce essay updates to parent
  useEffect(() => {
    const handler = setTimeout(() => {
      if (debouncedEssayText !== essayText) {
        setDebouncedEssayText(essayText);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [essayText, debouncedEssayText]);

  // Sync debounced essay to parent
  useEffect(() => {
    if (
      debouncedEssayText !== (essayAnswer || "") &&
      !showResults &&
      !disabled
    ) {
      onEssayAnswer?.(safeId, debouncedEssayText);
    }
  }, [
    debouncedEssayText,
    essayAnswer,
    safeId,
    showResults,
    disabled,
    onEssayAnswer,
  ]);

  /* ==========================================================
     BULLETPROOF STATE SYNC WITH PARENT - IMPROVED
  ========================================================== */
  useEffect(() => {
    // Only sync if parent value is different and not null/undefined
    if (userAnswer != null && userAnswer !== selectedOption) {
      setSelectedOption(userAnswer);
    }

    if (essayAnswer != null && essayAnswer !== essayText) {
      setEssayText(essayAnswer);
    }
  }, [safeId, userAnswer, essayAnswer]); // Removed selectedOption and essayText from dependencies

  /* ==========================================================
     NORMALIZED CORRECT ANSWER HANDLING
  ========================================================== */
  const normalizedCorrectAnswer = useMemo(() => {
    const rawCorrect =
      question.correctAnswer ||
      question.correct ||
      question.answer ||
      question.correct_answer ||
      "";

    return cleanValue(rawCorrect);
  }, [
    question.correctAnswer,
    question.correct,
    question.answer,
    question.correct_answer,
  ]);

  /* ==========================================================
     EVENT HANDLERS WITH PERFORMANCE OPTIMIZATIONS
  ========================================================== */
  const handleOptionSelect = useCallback(
    (value) => {
      if (showResults || disabled) return;

      console.log(`🎯 Question ${safeId} selecting:`, value);
      setSelectedOption(value);
      onAnswerSelect?.(safeId, value);
    },
    [showResults, disabled, safeId, onAnswerSelect]
  );

  const handleEssayChange = useCallback(
    (text) => {
      if (showResults || disabled) return;

      setEssayText(text);
      // Parent sync happens via debounced effect above
    },
    [showResults, disabled]
  );

  const getLetter = (i) => String.fromCharCode(65 + i);

  /* ==========================================================
     METADATA / DISPLAY HELPERS
  ========================================================== */
  const difficultyColor = {
    easy: "#10b981",
    medium: "#f59e0b",
    hard: "#ef4444",
    expert: "#7c3aed",
  }[(question.difficulty || "medium").toLowerCase()];

  const scoreColor = (overall, max) => {
    if (overall == null || max == null) return "#6b7280";
    const pct = (overall / max) * 100;
    if (pct >= 80) return "#10b981";
    if (pct >= 60) return "#f59e0b";
    return "#ef4444";
  };

  const getTypeLabel = (type) =>
    ({
      multiple_choice: "Multiple Choice",
      essay: "Essay",
      true_false: "True/False",
      short_answer: "Short Answer",
    }[type] || "Question");

  const getTypeIcon = (type) =>
    ({
      multiple_choice: "🔘",
      essay: "📝",
      true_false: "⚖️",
      short_answer: "📋",
    }[type] || "❓");

  /* ==========================================================
     CORRECT / INCORRECT STATUS
  ========================================================== */
  const getAnswerStatus = () => {
    if (!showResults) return null;

    if (["multiple_choice", "true_false"].includes(question.type)) {
      return isCorrect ? "correct" : "incorrect";
    }

    if (question.type === "essay" && overallScore != null) {
      return "graded";
    }

    return null;
  };

  const status = getAnswerStatus();

  /* ==========================================================
     RENDERERS WITH IMPROVED COMPARISON LOGIC
  ========================================================== */
  const normalizedOptions = useMemo(
    () => question.options?.map((opt) => cleanValue(opt)) || [],
    [question.options]
  );

  // ---------- MULTIPLE CHOICE WITH SANITIZED COMPARISON ----------
  const renderMCQ = () => {
    return (
      <div className="options-container">
        <div className="options-grid">
          {question.options?.map((opt, index) => {
            const letter = getLetter(index);
            const normalizedLetter = cleanValue(letter);

            const isSelected = cleanValue(selectedOption) === normalizedLetter;

            const isCorrectOption =
              showResults && normalizedLetter === normalizedCorrectAnswer;

            const isWrong = showResults && isSelected && !isCorrectOption;

            return (
              <label
                key={index}
                className={`option-label
              ${isSelected ? "selected" : ""}
              ${showResults ? "show-results" : ""}
              ${isCorrectOption ? "correct-option" : ""}
              ${isWrong ? "wrong-selection" : ""}
            `}
              >
                <input
                  type="radio"
                  value={letter}
                  checked={isSelected}
                  disabled={showResults || disabled}
                  onChange={() => handleOptionSelect(letter)}
                />
                <div className="option-content">
                  <span className="option-letter">{letter}</span>
                  <span className="option-text">{opt}</span>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  // ---------- TRUE/FALSE WITH ENHANCED MATCHING ----------
  const renderTrueFalse = () => {
    const normalizedUserAnswer = cleanValue(selectedOption);

    return (
      <div className="options-container">
        <div className="true-false-options">
          {[
            { value: "true", label: "True", shortcuts: ["T", "TRUE"] },
            { value: "false", label: "False", shortcuts: ["F", "FALSE"] },
          ].map((option) => {
            const isSelected =
              normalizedUserAnswer === cleanValue(option.value);
            const isCorrectOption =
              showResults && option.shortcuts.includes(normalizedCorrectAnswer);
            const isWrong = showResults && isSelected && !isCorrectOption;

            return (
              <label
                key={option.value}
                className={`tf-option
                  ${isSelected ? "selected" : ""}
                  ${isCorrectOption ? "correct-option" : ""}
                  ${isWrong ? "wrong-selection" : ""}
                `}
                style={{ pointerEvents: showResults ? "none" : "auto" }}
              >
                <input
                  type="radio"
                  name={`q-${safeId}`}
                  checked={isSelected}
                  disabled={showResults || disabled}
                  value={option.value}
                  onChange={() => handleOptionSelect(option.value)}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>

        {showResults && (
          <div className="correct-answer-hint">
            <strong>Correct Answer: {question.correctAnswer}</strong>
            {question.explanation && (
              <div className="explanation">
                <strong>Explanation:</strong> {question.explanation}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // ---------- ESSAY WITH DEBOUNCED UPDATES ----------
  const renderEssay = () => (
    <div className="essay-container">
      <textarea
        className="essay-textarea"
        rows={8}
        disabled={showResults || disabled}
        value={essayText}
        placeholder="Type your answer..."
        onChange={(e) => handleEssayChange(e.target.value)}
      />

      {showResults && (
        <div className="essay-feedback-preview">
          <strong>Score:</strong>{" "}
          {overallScore != null
            ? `${overallScore}/${maxScore || question.max_score || 10}`
            : "Grading..."}
          {feedback && (
            <div className="essay-feedback">
              <strong>Feedback:</strong> {feedback}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ---------- SHORT ANSWER ----------
  const renderShortAnswer = () => (
    <div className="short-answer-container">
      <textarea
        className="short-answer-textarea"
        rows={4}
        disabled={showResults || disabled}
        value={essayText}
        placeholder="Write your answer..."
        onChange={(e) => handleEssayChange(e.target.value)}
      />
    </div>
  );

  // ---------- IMAGE SUPPORT ----------
  const renderQuestionImage = () => {
    const imageSrc = question.image || question.image_url || question.img;
    if (!imageSrc) return null;

    return (
      <div className="question-image">
        <img
          src={imageSrc}
          alt="Question visual aid"
          onError={(e) => {
            console.warn(`Failed to load image: ${imageSrc}`);
            e.target.style.display = "none";
          }}
        />
      </div>
    );
  };

  const renderBody = () => {
    switch (question.type) {
      case "multiple_choice":
        return renderMCQ();
      case "true_false":
        return renderTrueFalse();
      case "essay":
        return renderEssay();
      case "short_answer":
        return renderShortAnswer();
      default:
        return renderMCQ();
    }
  };

  /* ==========================================================
     KEYBOARD SHORTCUTS
  ========================================================== */
  useEffect(() => {
    if (showResults || disabled) return;

    const handleKeyDown = (e) => {
      // Prevent shortcuts when user is typing in textarea
      if (e.target.tagName === "TEXTAREA") return;

      const key = e.key.toUpperCase();

      // Multiple Choice: A, B, C, D or 1, 2, 3, 4
      if (question.type === "multiple_choice" && question.options) {
        const optionIndex = "ABCD".indexOf(key);
        if (optionIndex >= 0 && optionIndex < question.options.length) {
          handleOptionSelect("ABCD"[optionIndex]);
          e.preventDefault();
        }

        const numIndex = "1234".indexOf(key);
        if (numIndex >= 0 && numIndex < question.options.length) {
          handleOptionSelect("ABCD"[numIndex]);
          e.preventDefault();
        }
      }

      // True/False: T or F
      if (question.type === "true_false") {
        if (key === "T") {
          handleOptionSelect("true");
          e.preventDefault();
        } else if (key === "F") {
          handleOptionSelect("false");
          e.preventDefault();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    question.type,
    question.options,
    showResults,
    disabled,
    handleOptionSelect,
  ]);

  /* ==========================================================
     MAIN COMPONENT RENDER
  ========================================================== */
  return (
    <div className={`question-card ${status || ""}`}>
      <div className="question-header">
        <div>
          <h3>Question {questionNumber}</h3>

          <div className="question-tags">
            <span className="question-type-tag">
              {getTypeIcon(question.type)} {getTypeLabel(question.type)}
            </span>

            <span
              className="difficulty-tag"
              style={{ backgroundColor: difficultyColor }}
            >
              {question.difficulty || "medium"}
            </span>

            <span className="marks-tag">
              {question.max_score || 1} mark
              {(question.max_score || 1) > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {showResults && overallScore != null && (
          <div
            className="score-badge"
            style={{
              backgroundColor: scoreColor(
                overallScore,
                maxScore || question.max_score
              ),
            }}
          >
            {overallScore}/{maxScore || question.max_score}
          </div>
        )}
      </div>

      <div className="question-text">
        <p>{question.question}</p>
        {renderQuestionImage()}
      </div>

      <div className="question-content">{renderBody()}</div>

      {/* FEEDBACK (AFTER SUBMISSION) */}
      {showResults && (
        <div className="question-feedback">
          <div className={`feedback-header ${status}`}>
            {status === "correct" && "✅ Correct"}
            {status === "incorrect" && "❌ Incorrect"}
            {status === "graded" && "📝 Graded"}

            {timeSpentOnQuestion > 0 && (
              <span className="time-spent">
                Time: {Math.round(timeSpentOnQuestion)}s
              </span>
            )}
          </div>

          {feedback && status !== "graded" && (
            <div className="feedback-text">{feedback}</div>
          )}

          {rubricBreakdown && (
            <div className="rubric-section">
              <h4>Rubric:</h4>
              {rubricBreakdown.map((r, i) => (
                <div key={i} className="rubric-item">
                  <strong>{r.criteria}:</strong> {r.score}/{r.max}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* KEYBOARD SHORTCUTS HINT */}
      {!showResults && !disabled && (
        <div className="keyboard-hints">
          <small>
            {question.type === "multiple_choice" &&
              "🎮 Use A/B/C/D or 1/2/3/4 to select answers"}
            {question.type === "true_false" && "🎮 Use T for True, F for False"}
          </small>
        </div>
      )}

      {/* DEBUG INFO - Remove in production */}
      {process.env.NODE_ENV === "development" && (
        <div
          className="debug-info"
          style={{
            marginTop: "10px",
            padding: "8px",
            background: "#f5f5f5",
            borderRadius: "4px",
            fontSize: "12px",
            border: "1px solid #ddd",
          }}
        >
          <strong>Debug Info:</strong>
          <br />
          Question ID: {safeId}
          <br />
          Selected Option: {selectedOption || "none"}
          <br />
          Parent Answer: {userAnswer || "none"}
          <br />
          Synced: {selectedOption === userAnswer ? "✅" : "❌"}
          <br />
          Correct Answer: {normalizedCorrectAnswer || "none"}
          <br />
          Essay Length: {essayText?.length || 0} chars
          <br />
          Stable ID: {safeId}
          <br />
          Has _normalizedId: {question?._normalizedId ? "✅" : "❌"}
        </div>
      )}
    </div>
  );
};

export default QuestionCard;
