import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import api from "../../../services/api/api";
import { withRequestId } from "../../../utils/requestId";

const REVIEW_STATUS_LABELS = {
  pending_review: "Pending Review",
  reviewed: "Reviewed",
  returned: "Returned",
};

const SYSTEM_STATUS_LABELS = {
  submitted: "Submitted",
  ai_graded: "AI Graded",
  pending_teacher_review: "Teacher Queue",
  grading_delayed: "Delayed",
  final: "Finalized",
  failed: "Failed",
};

const QUESTION_TYPE_LABELS = {
  multiple_choice: "Multiple Choice",
  true_false: "True / False",
  short_answer: "Short Answer",
  essay: "Essay",
  file_upload: "File Upload",
  mixed: "Mixed",
};

function asNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatStudentName(student) {
  return (
    [student?.firstName, student?.lastName].filter(Boolean).join(" ") ||
    student?.email ||
    student?.username ||
    "Student"
  );
}

function formatAnswerValue(value) {
  if (value === null || value === undefined || value === "") {
    return "No answer provided";
  }

  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeOption(option) {
  if (typeof option === "string") {
    return { text: option, isCorrect: false };
  }

  return {
    text: option?.text || option?.label || "",
    isCorrect: Boolean(option?.isCorrect),
  };
}

function normalizeQuestion(question = {}, index = 0) {
  return {
    questionId:
      question.questionId || question._id || question.id || `question-${index + 1}`,
    questionType: String(
      question.questionType || question.type || "essay",
    ).trim(),
    questionText:
      question.questionText || question.question || `Question ${index + 1}`,
    prompt: question.prompt || "",
    options: Array.isArray(question.options)
      ? question.options.map(normalizeOption).filter((option) => option.text)
      : [],
    correctAnswer:
      question.correctAnswer === undefined ? null : question.correctAnswer,
    explanation: question.explanation || "",
    studentAnswer:
      question.studentAnswer !== undefined
        ? question.studentAnswer
        : question.answer !== undefined
          ? question.answer
          : null,
    uploadedFiles: Array.isArray(question.uploadedFiles)
      ? question.uploadedFiles
      : [],
    maxScore: Number(question.maxScore ?? question.points ?? 0) || 0,
    autoScore: asNumberOrNull(question.autoScore ?? question.pointsEarned),
    autoFeedback: question.autoFeedback || "",
    aiScore: asNumberOrNull(question.aiScore),
    aiFeedback: question.aiFeedback || "",
    teacherScore: asNumberOrNull(question.teacherScore),
    teacherFeedback: question.teacherFeedback || "",
    isCorrect:
      question.isCorrect === null || question.isCorrect === undefined
        ? null
        : Boolean(question.isCorrect),
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

function QuestionReviewCard({
  question,
  index,
  disabled,
  onScoreChange,
  onFeedbackChange,
}) {
  const scoreInputId = `teacher-score-${question.questionId}`;
  const feedbackInputId = `teacher-feedback-${question.questionId}`;
  const typeLabel =
    QUESTION_TYPE_LABELS[question.questionType] || question.questionType;
  const currentScore =
    question.teacherScore ?? question.aiScore ?? question.autoScore ?? null;

  return (
    <div
      className="dash-card mb-3"
      style={{ borderLeft: "4px solid rgba(13, 110, 253, 0.5)" }}
    >
      <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-3">
        <div>
          <div className="fw-semibold mb-1">
            Q{index + 1}. {question.questionText}
          </div>
          {question.prompt ? (
            <div className="text-muted" style={{ fontSize: "0.82em" }}>
              Prompt: {question.prompt}
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
              className={`fw-semibold ${
                question.isCorrect ? "text-success" : "text-danger"
              }`}
              style={{ fontSize: "0.82em" }}
            >
              {question.isCorrect ? "Correct" : "Incorrect"}
            </span>
          ) : null}
        </div>
      </div>

      {question.options.length ? (
        <div className="mb-3">
          <div className="text-muted mb-1" style={{ fontSize: "0.8em" }}>
            Options
          </div>
          {question.options.map((option, optionIndex) => {
            const letter = String.fromCharCode(65 + optionIndex);
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
                className={`small ${
                  isCorrectOption
                    ? "text-success fw-semibold"
                    : selected
                      ? "text-danger"
                      : "text-muted"
                }`}
              >
                {letter}. {option.text}
                {selected ? " <- student" : ""}
                {isCorrectOption ? " <- correct" : ""}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mb-3">
        <div className="text-muted mb-1" style={{ fontSize: "0.8em" }}>
          Student answer
        </div>
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
          Correct answer: {formatAnswerValue(question.correctAnswer)}
        </div>
      ) : null}

      {question.explanation ? (
        <div className="mb-2 text-muted" style={{ fontSize: "0.82em" }}>
          Explanation: {question.explanation}
        </div>
      ) : null}

      {question.uploadedFiles.length ? (
        <div className="mb-3 text-muted" style={{ fontSize: "0.82em" }}>
          Uploaded files: {question.uploadedFiles.length}
        </div>
      ) : null}

      <div className="d-flex gap-2 flex-wrap mb-2">
        <ScorePill label="Current" value={currentScore} variant="dark" />
        <ScorePill label="Auto" value={question.autoScore} variant="secondary" />
        <ScorePill label="AI" value={question.aiScore} variant="warning text-dark" />
        <ScorePill label="Teacher" value={question.teacherScore} variant="info" />
      </div>

      {question.aiFeedback ? (
        <div
          className="mb-3 p-2 rounded"
          style={{
            background: "rgba(255,193,7,0.08)",
            border: "1px solid rgba(255,193,7,0.25)",
            fontSize: "0.86em",
            whiteSpace: "pre-wrap",
          }}
        >
          <div className="fw-semibold mb-1">AI feedback</div>
          {question.aiFeedback}
        </div>
      ) : null}

      <div className="row g-3">
        <div className="col-md-3">
          <label className="form-label" htmlFor={scoreInputId}>
            Teacher score
          </label>
          <input
            id={scoreInputId}
            className="form-control"
            type="number"
            min="0"
            max={question.maxScore || 0}
            value={question.teacherScore ?? ""}
            onChange={(event) => onScoreChange(question.questionId, event.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="col-md-9">
          <label className="form-label" htmlFor={feedbackInputId}>
            Teacher feedback
          </label>
          <textarea
            id={feedbackInputId}
            className="form-control"
            rows={2}
            value={question.teacherFeedback}
            onChange={(event) =>
              onFeedbackChange(question.questionId, event.target.value)
            }
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}

export default function GradeReviewPanel({ item, onClose, onSaved }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [feedbackIsAiDraft, setFeedbackIsAiDraft] = useState(false);
  const [scoreTouched, setScoreTouched] = useState(false);
  // Inline confirmation state — avoids native window.confirm() which blocks browser automation
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [form, setForm] = useState({
    score: "",
    feedback: "",
    reviewStatus: "reviewed",
    questions: [],
  });

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const response =
        item.kind === "assignment"
          ? await api.gradebook.getSubmission(item.sourceId)
          : await api.gradebook.getQuizAttempt(item.sourceId);
      setDetail(response?.submission || response?.attempt || null);
    } catch (error) {
      toast.error(error?.message || "Failed to load review detail");
    } finally {
      setLoading(false);
    }
  }, [item.kind, item.sourceId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const computedTotals = useMemo(() => {
    const questions = Array.isArray(form.questions) ? form.questions : [];
    const totalMax = questions.reduce(
      (sum, question) => sum + Math.max(Number(question.maxScore || 0), 0),
      0,
    );
    const totalScore = questions.reduce((sum, question) => {
      const nextScore =
        question.teacherScore ?? question.aiScore ?? question.autoScore ?? 0;
      return sum + Math.max(Number(nextScore || 0), 0);
    }, 0);

    return {
      totalScore,
      totalMax,
      percentage:
        totalMax > 0
          ? Math.round((totalScore / totalMax) * 10000) / 100
          : null,
    };
  }, [form.questions]);

  useEffect(() => {
    if (!detail) return;

    const questions = Array.isArray(detail.questions)
      ? detail.questions.map(normalizeQuestion)
      : [];
    const localTotals = questions.reduce(
      (accumulator, question) => {
        const score =
          question.teacherScore ?? question.aiScore ?? question.autoScore ?? 0;
        return {
          totalScore: accumulator.totalScore + Math.max(Number(score || 0), 0),
          totalMax:
            accumulator.totalMax + Math.max(Number(question.maxScore || 0), 0),
        };
      },
      { totalScore: 0, totalMax: 0 },
    );
    const localPercentage =
      localTotals.totalMax > 0
        ? Math.round((localTotals.totalScore / localTotals.totalMax) * 10000) / 100
        : null;
    const prefilledScore =
      detail.finalScore ??
      detail.teacherAdjustedScore ??
      detail.score ??
      localPercentage ??
      "";
    const prefilledFeedback =
      detail.finalFeedback ||
      detail.teacherAdjustedFeedback ||
      detail.feedback ||
      "";

    setForm({
      score:
        prefilledScore === null || prefilledScore === undefined
          ? ""
          : String(prefilledScore),
      feedback: prefilledFeedback,
      reviewStatus: detail.reviewStatus || "reviewed",
      questions,
    });
    setFeedbackIsAiDraft(false);
    setScoreTouched(false);
  }, [detail]);

  useEffect(() => {
    if (scoreTouched) return;
    setForm((current) => ({
      ...current,
      score:
        computedTotals.percentage === null || computedTotals.percentage === undefined
          ? ""
          : String(computedTotals.percentage),
    }));
  }, [computedTotals.percentage, scoreTouched]);

  const draftFeedbackWithAi = async () => {
    const score = String(form.score || "").trim();
    setAiDrafting(true);
    try {
      const response = await api.ai.generateExplanation({
        question_data: {
          topic: item.title || "Assessment",
          question: `Draft concise teacher feedback for a ${item.kind} review scored ${
            score || "not yet finalized"
          }. Keep it actionable, warm, and specific. Do not mention AI.`,
          context: `Assessment: ${item.title}. Course: ${item.courseTitle || ""}.`,
          type: "feedback_draft",
        },
        subject: item.courseTitle || "General",
        style: "teacher-ready",
      });

      const text =
        response?.explanation ||
        response?.reply ||
        response?.message ||
        response?.text ||
        "";

      if (!text) {
        toast.error("AI returned no feedback draft");
        return;
      }

      setForm((current) => ({ ...current, feedback: text }));
      setFeedbackIsAiDraft(true);
    } catch (error) {
      toast.error(error?.message || "Failed to draft feedback");
    } finally {
      setAiDrafting(false);
    }
  };

  const updateQuestion = (questionId, patch) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.questionId === questionId
          ? { ...question, ...patch }
          : question,
      ),
    }));
  };

  const validatePayload = () => {
    const scoreText = String(form.score ?? "").trim();
    const computedScore = computedTotals.percentage;
    const parsedScore =
      scoreText === ""
        ? computedScore
        : Number(scoreText);

    if (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      toast.error("Total grade must be between 0 and 100");
      return null;
    }

    for (const question of form.questions) {
      if (
        question.teacherScore !== null &&
        question.teacherScore !== undefined &&
        question.teacherScore !== ""
      ) {
        const parsedQuestionScore = Number(question.teacherScore);
        if (
          !Number.isFinite(parsedQuestionScore) ||
          parsedQuestionScore < 0 ||
          parsedQuestionScore > Number(question.maxScore || 0)
        ) {
          toast.error(
            `Question score for "${question.questionText}" must be between 0 and ${question.maxScore}`,
          );
          return null;
        }
      }
    }

    return {
      score: parsedScore,
      feedback: form.feedback,
      reviewStatus: form.reviewStatus,
      questions: form.questions.map((question) => ({
        questionId: question.questionId,
        teacherScore:
          question.teacherScore === null || question.teacherScore === undefined || question.teacherScore === ""
            ? null
            : Number(question.teacherScore),
        teacherFeedback: question.teacherFeedback || "",
      })),
    };
  };

  const saveReview = async (finalize = false) => {
    const payload = validatePayload();
    if (!payload) return;

    // finalize=true → approve endpoint (released to student)
    // finalize=false → review endpoint (internal draft, student cannot see)
    const willReturn = finalize;

    // For "Return to student", show an inline confirmation instead of native confirm()
    if (willReturn && !confirmReturn) {
      setConfirmReturn(true);
      return;
    }
    // Reset confirmation state before proceeding
    setConfirmReturn(false);

    setSaving(true);
    try {
      const { config } = withRequestId({}, "teacher-review-save");
      const body = {
        ...payload,
        // Legacy field alias for assignment submissions
        grade: payload.score,
      };

      if (willReturn) {
        // Finalise — released to student
        if (item.kind === "assignment") {
          await api.gradebook.approveSubmission(item.sourceId, body, config);
        } else {
          await api.gradebook.approveQuizAttempt(item.sourceId, body, config);
        }
        toast.success("Grade returned to student");
      } else {
        // Draft review — internal save, student does not see yet
        if (item.kind === "assignment") {
          await api.gradebook.reviewSubmission(item.sourceId, body, config);
        } else {
          await api.gradebook.reviewQuizAttempt(item.sourceId, body, config);
        }
        toast.success("Teacher review saved (not yet visible to student)");
      }

      await loadDetail();
      onSaved?.();
    } catch (error) {
      toast.error(error?.message || "Failed to save review");
    } finally {
      setSaving(false);
    }
  };

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
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dash-card"
        style={{ width: "100%", maxWidth: 980, position: "relative" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-4">
          <div>
            <h3 className="mb-1">{item.title}</h3>
            <div className="text-muted mb-1" style={{ fontSize: "0.9em" }}>
              <strong>Student:</strong>{" "}
              {formatStudentName(detail?.student || item.student)}
            </div>
            <div className="text-muted" style={{ fontSize: "0.88em" }}>
              <strong>Course:</strong> {item.courseTitle || detail?.courseTitle || "—"}{" "}
              &nbsp;|&nbsp;
              <strong>Type:</strong> {item.kind === "quiz" ? "Quiz" : "Assignment"}
            </div>
          </div>
          <div className="d-flex gap-2 flex-wrap align-items-center">
            {/* Review status badge */}
            {detail?.reviewStatus ? (
              <span className="badge bg-primary">
                {REVIEW_STATUS_LABELS[detail.reviewStatus] || detail.reviewStatus}
              </span>
            ) : null}
            {/* System / grading status badge */}
            {(detail?.gradingStatus || detail?.status) ? (
              <span className="badge bg-secondary">
                {SYSTEM_STATUS_LABELS[detail.gradingStatus ?? detail.status] ||
                  detail.gradingStatus ||
                  detail.status}
              </span>
            ) : null}
            <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>
              ✕ Close
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-muted mb-0">Loading review details...</p>
        ) : !detail ? (
          <p className="text-muted mb-0">Could not load review detail.</p>
        ) : (
          <>
            <div
              className="mb-4 p-3 rounded"
              style={{
                background: "rgba(13,110,253,0.08)",
                border: "1px solid rgba(13,110,253,0.2)",
              }}
            >
              <div className="d-flex gap-2 flex-wrap align-items-center mb-2">
                <ScorePill label="Current total" value={detail.score} variant="dark" />
                <ScorePill label="AI total" value={detail.aiScore} variant="warning text-dark" />
                <ScorePill
                  label="Teacher total"
                  value={detail.teacherAdjustedScore}
                  variant="info"
                />
                <ScorePill label="Final total" value={detail.finalScore} variant="success" />
              </div>
              <div className="text-muted" style={{ fontSize: "0.84em" }}>
                Submitted {detail.submittedAt ? new Date(detail.submittedAt).toLocaleString() : "Unknown"}
                {detail.teacherApprovedAt
                  ? ` | Returned ${new Date(detail.teacherApprovedAt).toLocaleString()}`
                  : ""}
              </div>
            </div>

            <div className="row g-3 mb-4">
              <div className="col-md-4">
                <div className="dash-card h-100">
                  <div className="dash-card-title">Question total</div>
                  <div style={{ fontSize: 28, fontWeight: 900 }}>
                    {computedTotals.totalScore.toFixed(2).replace(/\.00$/, "")}
                    {" / "}
                    {computedTotals.totalMax.toFixed(2).replace(/\.00$/, "")}
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="dash-card h-100">
                  <div className="dash-card-title">Computed grade</div>
                  <div style={{ fontSize: 28, fontWeight: 900 }}>
                    {computedTotals.percentage === null
                      ? "N/A"
                      : `${computedTotals.percentage.toFixed(2).replace(/\.00$/, "")}%`}
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="dash-card h-100">
                  <div className="dash-card-title">Saved grade</div>
                  <div style={{ fontSize: 28, fontWeight: 900 }}>
                    {detail.score === null || detail.score === undefined
                      ? "N/A"
                      : `${Number(detail.score).toFixed(2).replace(/\.00$/, "")}%`}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <div className="fw-semibold mb-3">
                Question review ({form.questions.length})
              </div>

              {form.questions.length === 0 ? (
                <div
                  className="p-3 rounded mb-3"
                  style={{
                    background: "rgba(255,193,7,0.10)",
                    border: "1px solid rgba(255,193,7,0.35)",
                    fontSize: "0.88em",
                  }}
                >
                  <strong>No question-level data found.</strong>
                  {item.kind === "quiz"
                    ? " The quiz may have been created without questions, or the student's answers were not saved. You can still assign an overall grade below."
                    : " No per-question breakdown is available for this assignment. Use the overall grade section below."}
                  {process.env.NODE_ENV !== "production" && detail && (
                    <details className="mt-2">
                      <summary style={{ cursor: "pointer" }}>Debug — raw detail shape</summary>
                      <pre style={{ fontSize: "0.75em", maxHeight: 200, overflow: "auto" }}>
                        {JSON.stringify(
                          {
                            kind: detail.kind,
                            questionsCount: detail.questions?.length ?? "undefined",
                            questionReviewsCount: detail.questionReviews?.length ?? "undefined",
                            answersCount: detail.answers?.length ?? "undefined",
                            status: detail.gradingStatus ?? detail.status,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  )}
                </div>
              ) : (
                form.questions.map((question, index) => (
                  <QuestionReviewCard
                    key={question.questionId}
                    question={question}
                    index={index}
                    disabled={saving}
                    onScoreChange={(questionId, value) => {
                      setScoreTouched(false);
                      updateQuestion(questionId, {
                        teacherScore: value === "" ? null : Number(value),
                      });
                    }}
                    onFeedbackChange={(questionId, value) =>
                      updateQuestion(questionId, { teacherFeedback: value })
                    }
                  />
                ))
              )}
            </div>

            <div className="dash-card">
              <div className="fw-semibold mb-3">Teacher decision</div>
              <div className="row g-3">
                <div className="col-md-4">
                  <label className="form-label" htmlFor="teacher-total-grade">
                    Total grade (%)
                    {computedTotals.percentage !== null && (
                      <span className="text-muted ms-1" style={{ fontSize: "0.78em" }}>
                        Computed: {computedTotals.percentage.toFixed(2).replace(/\.00$/, "")}%
                      </span>
                    )}
                  </label>
                  <input
                    id="teacher-total-grade"
                    className="form-control"
                    type="number"
                    min="0"
                    max="100"
                    value={form.score}
                    onChange={(event) => {
                      setScoreTouched(true);
                      setForm((current) => ({
                        ...current,
                        score: event.target.value,
                      }));
                    }}
                    disabled={saving}
                  />
                </div>
                <div className="col-md-8">
                  <div className="d-flex justify-content-between align-items-center mb-1 flex-wrap gap-2">
                    <label className="form-label mb-0" htmlFor="teacher-final-feedback">
                      Final feedback
                      {feedbackIsAiDraft ? (
                        <span className="badge bg-warning text-dark ms-2">
                          AI draft
                        </span>
                      ) : null}
                    </label>
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      onClick={draftFeedbackWithAi}
                      disabled={saving || aiDrafting}
                    >
                      {aiDrafting ? "Drafting..." : "AI suggest"}
                    </button>
                  </div>
                  <textarea
                    id="teacher-final-feedback"
                    className="form-control"
                    rows={3}
                    value={form.feedback}
                    onChange={(event) => {
                      setFeedbackIsAiDraft(false);
                      setForm((current) => ({
                        ...current,
                        feedback: event.target.value,
                      }));
                    }}
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Inline confirmation replaces native window.confirm() */}
              {confirmReturn && (
                <div
                  className="mt-3 p-3 rounded d-flex align-items-center gap-3 flex-wrap"
                  style={{
                    background: "rgba(25,135,84,0.15)",
                    border: "1px solid rgba(25,135,84,0.4)",
                  }}
                >
                  <span style={{ fontSize: "0.9em" }}>
                    ⚠️ This will release the grade and feedback to the student. Are you sure?
                  </span>
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => saveReview(true)}
                    disabled={saving}
                  >
                    Yes, return to student
                  </button>
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setConfirmReturn(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div className="d-flex gap-2 flex-wrap mt-3">
                <button
                  className="btn btn-success"
                  onClick={() => saveReview(true)}
                  disabled={saving || confirmReturn}
                  title="Finalise grade and make it visible to the student"
                >
                  {saving ? "Saving..." : "Return to student"}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => saveReview(false)}
                  disabled={saving || confirmReturn}
                  title="Save review notes internally — student does not see this yet"
                >
                  {saving ? "Saving..." : "Save draft"}
                </button>
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setConfirmReturn(false);
                    setScoreTouched(false);
                    loadDetail();
                  }}
                  disabled={saving}
                >
                  Reset
                </button>
                <button
                  className="btn btn-outline-light"
                  onClick={() => { setConfirmReturn(false); onClose(); }}
                  disabled={saving}
                >
                  Close
                </button>
              </div>

              <div className="text-muted mt-2" style={{ fontSize: "0.82em" }}>
                <strong>Save draft</strong> stores your review internally — the student cannot see it yet.{" "}
                <strong>Return to student</strong> finalises the grade and makes scores &amp; feedback visible to the student.
              </div>
            </div>

            {detail.gradingAudit?.length ? (
              <div className="mt-4">
                <div className="text-muted fw-semibold mb-2" style={{ fontSize: "0.82em" }}>
                  Review history
                </div>
                {[...detail.gradingAudit].reverse().map((entry, index) => (
                  <div
                    key={`${entry.at || index}-${index}`}
                    className="text-muted"
                    style={{ fontSize: "0.78em", marginBottom: 2 }}
                  >
                    {entry.at ? new Date(entry.at).toLocaleString() : ""} |{" "}
                    {entry.source || "system"} | {entry.action} | {entry.statusFrom} to{" "}
                    {entry.statusTo}
                    {entry.score !== null && entry.score !== undefined
                      ? ` | ${entry.score}%`
                      : ""}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
