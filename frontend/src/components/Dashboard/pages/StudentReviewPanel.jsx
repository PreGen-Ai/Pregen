import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import api from "../../../services/api/api";

const QUESTION_TYPE_LABELS = {
  multiple_choice: "Multiple Choice",
  true_false: "True / False",
  short_answer: "Short Answer",
  essay: "Essay",
  file_upload: "File Upload",
};

const REVIEW_STATUS_LABELS = {
  pending_review: "Pending Review",
  reviewed: "Under Review",
  returned: "Returned",
};

function formatStudentName(student) {
  return (
    [student?.firstName, student?.lastName].filter(Boolean).join(" ") ||
    student?.email ||
    student?.username ||
    "Student"
  );
}

function formatAnswerValue(value) {
  if (value === null || value === undefined || value === "") return "No answer provided";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeOption(option) {
  if (typeof option === "string") return { text: option, isCorrect: false };
  return { text: option?.text || option?.label || "", isCorrect: Boolean(option?.isCorrect) };
}

function normalizeQuestion(question = {}, index = 0) {
  return {
    questionId: question.questionId || question._id || question.id || `q-${index + 1}`,
    questionType: String(question.questionType || question.type || "essay").trim(),
    questionText: question.questionText || question.question || `Question ${index + 1}`,
    prompt: question.prompt || "",
    options: Array.isArray(question.options)
      ? question.options.map(normalizeOption).filter((o) => o.text)
      : [],
    correctAnswer: question.correctAnswer === undefined ? null : question.correctAnswer,
    explanation: question.explanation || "",
    studentAnswer: question.studentAnswer !== undefined ? question.studentAnswer : null,
    uploadedFiles: Array.isArray(question.uploadedFiles) ? question.uploadedFiles : [],
    maxScore: Number(question.maxScore ?? question.points ?? 0) || 0,
    autoScore: question.autoScore ?? null,
    aiScore: question.aiScore ?? null,
    aiFeedback: question.aiFeedback || "",
    teacherScore: question.teacherScore ?? null,
    teacherFeedback: question.teacherFeedback || "",
    isCorrect: question.isCorrect === null || question.isCorrect === undefined ? null : Boolean(question.isCorrect),
  };
}

function ScorePill({ label, value, variant = "secondary" }) {
  if (value === null || value === undefined) return null;
  return (
    <span className={`badge bg-${variant}`} style={{ fontSize: "0.8em" }}>
      {label}: {Number(value).toFixed(2).replace(/\.00$/, "")}
    </span>
  );
}

function QuestionResultCard({ question, index }) {
  const typeLabel = QUESTION_TYPE_LABELS[question.questionType] || question.questionType;
  const effectiveScore = question.teacherScore ?? question.aiScore ?? question.autoScore ?? null;

  return (
    <div
      className="dash-card mb-3"
      style={{
        borderLeft: `4px solid ${
          question.isCorrect === true
            ? "rgba(25, 135, 84, 0.6)"
            : question.isCorrect === false
              ? "rgba(220, 53, 69, 0.5)"
              : "rgba(13, 110, 253, 0.4)"
        }`,
      }}
    >
      <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-3">
        <div>
          <div className="fw-semibold mb-1">
            Q{index + 1}. {question.questionText}
          </div>
          {question.prompt ? (
            <div className="text-muted" style={{ fontSize: "0.82em" }}>
              {question.prompt}
            </div>
          ) : null}
        </div>
        <div className="d-flex gap-2 flex-wrap align-items-center">
          <span className="badge bg-secondary">{typeLabel}</span>
          <span className="text-muted" style={{ fontSize: "0.82em" }}>
            Max {question.maxScore}
          </span>
          {question.isCorrect !== null ? (
            <span
              className={question.isCorrect ? "text-success fw-semibold" : "text-danger fw-semibold"}
              style={{ fontSize: "0.82em" }}
            >
              {question.isCorrect ? "Correct" : "Incorrect"}
            </span>
          ) : null}
        </div>
      </div>

      {question.options.length ? (
        <div className="mb-3">
          <div className="text-muted mb-1" style={{ fontSize: "0.8em" }}>Options</div>
          {question.options.map((option, optIdx) => {
            const letter = String.fromCharCode(65 + optIdx);
            const selected =
              String(question.studentAnswer || "").trim().toUpperCase() === letter ||
              String(question.studentAnswer || "").trim() === option.text;
            const isCorrectOption =
              option.isCorrect ||
              String(question.correctAnswer || "").trim().toUpperCase() === letter ||
              String(question.correctAnswer || "").trim() === option.text;

            return (
              <div
                key={`${question.questionId}-${letter}`}
                className={`small py-1 ${
                  isCorrectOption ? "text-success fw-semibold" : selected ? "text-danger" : "text-muted"
                }`}
              >
                {letter}. {option.text}
                {selected ? " ← your answer" : ""}
                {isCorrectOption ? " ← correct" : ""}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mb-3">
        <div className="text-muted mb-1" style={{ fontSize: "0.8em" }}>Your answer</div>
        <div
          className="p-3 rounded"
          style={{
            background: "rgba(255,255,255,0.05)",
            whiteSpace: "pre-wrap",
            fontSize: "0.9em",
          }}
        >
          {formatAnswerValue(question.studentAnswer)}
        </div>
      </div>

      {question.correctAnswer !== null && question.correctAnswer !== undefined && question.correctAnswer !== "" ? (
        <div className="mb-2 text-success" style={{ fontSize: "0.84em" }}>
          Expected answer: {formatAnswerValue(question.correctAnswer)}
        </div>
      ) : null}

      {question.explanation ? (
        <div className="mb-2 text-muted" style={{ fontSize: "0.82em" }}>
          Explanation: {question.explanation}
        </div>
      ) : null}

      {question.uploadedFiles.length ? (
        <div className="mb-2 text-muted" style={{ fontSize: "0.82em" }}>
          Submitted files: {question.uploadedFiles.length}
        </div>
      ) : null}

      <div className="d-flex gap-2 flex-wrap mb-2">
        <ScorePill label="Score" value={effectiveScore} variant="info" />
        <ScorePill label="Max" value={question.maxScore} variant="secondary" />
      </div>

      {question.teacherFeedback ? (
        <div
          className="p-2 rounded"
          style={{
            background: "rgba(13,110,253,0.08)",
            border: "1px solid rgba(13,110,253,0.25)",
            fontSize: "0.86em",
            whiteSpace: "pre-wrap",
          }}
        >
          <div className="fw-semibold mb-1">Teacher feedback</div>
          {question.teacherFeedback}
        </div>
      ) : question.aiFeedback ? (
        <div
          className="p-2 rounded"
          style={{
            background: "rgba(255,193,7,0.08)",
            border: "1px solid rgba(255,193,7,0.2)",
            fontSize: "0.86em",
            whiteSpace: "pre-wrap",
          }}
        >
          <div className="fw-semibold mb-1">Feedback</div>
          {question.aiFeedback}
        </div>
      ) : null}
    </div>
  );
}

export default function StudentReviewPanel({ item, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const response =
        item.kind === "assignment"
          ? await api.gradebook.getMySubmission(item.sourceId)
          : await api.gradebook.getMyQuizAttempt(item.sourceId);
      setDetail(response?.submission || response?.attempt || null);
    } catch (error) {
      toast.error(error?.message || "Failed to load feedback details");
    } finally {
      setLoading(false);
    }
  }, [item.kind, item.sourceId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const questions = detail
    ? (Array.isArray(detail.questions) ? detail.questions : []).map(normalizeQuestion)
    : [];

  const totalScore = questions.reduce((sum, q) => {
    const s = q.teacherScore ?? q.aiScore ?? q.autoScore ?? 0;
    return sum + Math.max(Number(s || 0), 0);
  }, 0);
  const totalMax = questions.reduce((sum, q) => sum + Math.max(Number(q.maxScore || 0), 0), 0);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        zIndex: 1050,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        padding: "24px 16px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="dash-card"
        style={{ width: "100%", maxWidth: 860, position: "relative" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-4">
          <div>
            <h3 className="mb-1">{item.title}</h3>
            <div className="text-muted" style={{ fontSize: "0.88em" }}>
              {item.courseTitle || detail?.courseTitle || "Course"} |{" "}
              {item.kind === "quiz" ? "Quiz result" : "Assignment feedback"}
            </div>
          </div>
          <div className="d-flex gap-2 flex-wrap align-items-center">
            <span className="badge bg-success">Returned</span>
            <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-muted mb-0">Loading feedback...</p>
        ) : !detail ? (
          <p className="text-muted mb-0">Could not load feedback details.</p>
        ) : (
          <>
            <div
              className="mb-4 p-3 rounded"
              style={{
                background: "rgba(25,135,84,0.08)",
                border: "1px solid rgba(25,135,84,0.2)",
              }}
            >
              <div className="d-flex gap-4 flex-wrap align-items-center mb-2">
                <div>
                  <div className="text-muted" style={{ fontSize: "0.78em" }}>Final grade</div>
                  <div style={{ fontSize: 28, fontWeight: 900 }}>
                    {detail.score !== null && detail.score !== undefined
                      ? `${Number(detail.score).toFixed(0)}%`
                      : "N/A"}
                  </div>
                </div>
                {totalMax > 0 ? (
                  <div>
                    <div className="text-muted" style={{ fontSize: "0.78em" }}>Points</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>
                      {totalScore.toFixed(2).replace(/\.00$/, "")} / {totalMax}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="text-muted" style={{ fontSize: "0.84em" }}>
                Submitted{" "}
                {detail.submittedAt ? new Date(detail.submittedAt).toLocaleString() : "Unknown"}
                {detail.teacherApprovedAt
                  ? ` | Returned ${new Date(detail.teacherApprovedAt).toLocaleString()}`
                  : ""}
              </div>
            </div>

            {(detail.finalFeedback || detail.feedback) ? (
              <div
                className="mb-4 p-3 rounded"
                style={{
                  background: "rgba(13,110,253,0.07)",
                  border: "1px solid rgba(13,110,253,0.2)",
                  whiteSpace: "pre-wrap",
                  fontSize: "0.92em",
                }}
              >
                <div className="fw-semibold mb-1">Teacher feedback</div>
                {detail.finalFeedback || detail.feedback}
              </div>
            ) : null}

            {questions.length > 0 ? (
              <div className="mb-2">
                <div className="fw-semibold mb-3">
                  Question breakdown ({questions.length})
                </div>
                {questions.map((question, index) => (
                  <QuestionResultCard key={question.questionId} question={question} index={index} />
                ))}
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: "0.88em" }}>
                No per-question breakdown available for this submission.
              </p>
            )}

            <div className="mt-3 d-flex justify-content-end">
              <button className="btn btn-outline-light" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
