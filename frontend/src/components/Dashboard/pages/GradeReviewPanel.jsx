import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import api from "../../../services/api/api";
import { withRequestId } from "../../../utils/requestId";

const STATUS_LABELS = {
  submitted: "Submitted",
  ai_graded: "AI Graded",
  pending_teacher_review: "Pending Review",
  grading_delayed: "Grading Delayed",
  final: "Finalized",
  failed: "Failed",
};

const QUESTION_TYPE_LABELS = {
  multiple_choice: "Multiple Choice",
  true_false: "True / False",
  short_answer: "Short Answer",
  essay: "Essay",
  file_upload: "File Upload",
};

function ScorePill({ label, value, variant = "secondary" }) {
  if (value === null || value === undefined) return null;
  return (
    <span className={`badge bg-${variant} me-2`} style={{ fontSize: "0.82em" }}>
      {label}: {Number(value).toFixed(0)}%
    </span>
  );
}

function QuizQuestionRow({ q, index }) {
  const isOpenEnded = ["essay", "short_answer", "file_upload"].includes(q.questionType);
  const correctnessClass =
    q.isCorrect === true
      ? "text-success"
      : q.isCorrect === false
      ? "text-danger"
      : "text-muted";

  return (
    <div
      className="dash-card mb-3"
      style={{ borderLeft: `4px solid ${q.isCorrect === true ? "#28a745" : q.isCorrect === false ? "#dc3545" : "#6c757d"}` }}
    >
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
        <div className="fw-semibold" style={{ fontSize: "0.95em" }}>
          Q{index + 1}. {q.questionText}
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="badge bg-secondary" style={{ fontSize: "0.75em" }}>
            {QUESTION_TYPE_LABELS[q.questionType] || q.questionType}
          </span>
          <span className="text-muted" style={{ fontSize: "0.8em" }}>
            {q.pointsEarned ?? 0} / {q.points} pts
          </span>
          {q.isCorrect !== null && (
            <span className={`fw-semibold ${correctnessClass}`} style={{ fontSize: "0.82em" }}>
              {q.isCorrect ? "Correct" : isOpenEnded ? "Needs review" : "Incorrect"}
            </span>
          )}
        </div>
      </div>

      {q.options?.length > 0 && (
        <div className="mb-2">
          {q.options.map((opt, oi) => {
            const letter = String.fromCharCode(65 + oi);
            const isSelected = q.studentAnswer === letter || q.studentAnswer === opt.text;
            const isCorrectOpt = opt.isCorrect;
            let optClass = "text-muted";
            if (isCorrectOpt) optClass = "text-success fw-semibold";
            if (isSelected && !isCorrectOpt) optClass = "text-danger";
            return (
              <div key={oi} className={optClass} style={{ fontSize: "0.88em" }}>
                {letter}. {opt.text}
                {isSelected && " ← student"}
                {isCorrectOpt && " ✓"}
              </div>
            );
          })}
        </div>
      )}

      {isOpenEnded && (
        <div className="mb-2">
          <div className="text-muted" style={{ fontSize: "0.8em", marginBottom: 4 }}>
            Student answer:
          </div>
          <div
            className="p-2 rounded"
            style={{ background: "rgba(255,255,255,0.05)", fontSize: "0.9em", whiteSpace: "pre-wrap" }}
          >
            {q.studentAnswer || <em className="text-muted">No answer provided</em>}
          </div>
          {q.correctAnswer && (
            <div className="mt-1 text-success" style={{ fontSize: "0.82em" }}>
              Expected: {String(q.correctAnswer)}
            </div>
          )}
        </div>
      )}

      {q.uploadedFiles?.length > 0 && (
        <div className="text-muted" style={{ fontSize: "0.82em" }}>
          {q.uploadedFiles.length} file(s) uploaded
        </div>
      )}

      {q.explanation && (
        <div className="text-muted mt-1" style={{ fontSize: "0.8em", fontStyle: "italic" }}>
          Explanation: {q.explanation}
        </div>
      )}
    </div>
  );
}

export default function GradeReviewPanel({ item, onClose, onSaved }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ score: "", feedback: "" });
  const [aiDrafting, setAiDrafting] = useState(false);
  const [feedbackIsAiDraft, setFeedbackIsAiDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      let res;
      if (item.kind === "assignment") {
        res = await api.gradebook.getSubmission(item.sourceId);
        setDetail(res?.submission || null);
      } else {
        res = await api.gradebook.getQuizAttempt(item.sourceId);
        setDetail(res?.attempt || null);
      }
    } catch (e) {
      toast.error(e?.message || "Failed to load detail");
    } finally {
      setLoading(false);
    }
  }, [item.kind, item.sourceId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!detail) return;
    const prefillScore = detail.teacherAdjustedScore ?? detail.aiScore ?? detail.score ?? "";
    const prefillFeedback = detail.teacherAdjustedFeedback || detail.aiFeedback || detail.feedback || "";
    setForm({ score: prefillScore === null ? "" : String(prefillScore), feedback: prefillFeedback });
    setFeedbackIsAiDraft(false);
  }, [detail]);

  const draftFeedbackWithAi = async () => {
    const score = Number(String(form.score).trim());
    setAiDrafting(true);
    try {
      const response = await api.ai.generateExplanation({
        question_data: {
          topic: item.title || "Assessment",
          question: `Draft concise teacher feedback for a ${item.kind} scored ${Number.isFinite(score) ? score + "%" : "(not yet scored)"}. 1-2 sentences, actionable, teacher-appropriate. Do not refer to yourself as AI.`,
          context: `Assessment: ${item.title}. Course: ${item.courseTitle || ""}. Type: ${item.kind}.`,
          type: "feedback_draft",
        },
        subject: item.courseTitle || "General",
        style: "teacher-ready",
      });
      const text = response?.explanation || response?.reply || response?.message || response?.text || "";
      if (text) {
        setForm((p) => ({ ...p, feedback: text }));
        setFeedbackIsAiDraft(true);
      } else {
        toast.error("AI returned no feedback draft");
      }
    } catch (e) {
      toast.error(e?.message || "Failed to draft feedback with AI");
    } finally {
      setAiDrafting(false);
    }
  };

  const validateScore = () => {
    const raw = String(form.score ?? "").trim();
    if (!raw) { toast.error("Score is required"); return null; }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error("Score must be between 0 and 100");
      return null;
    }
    return parsed;
  };

  const saveDraft = async () => {
    const score = validateScore();
    if (score === null) return;
    setSaving(true);
    try {
      const { config } = withRequestId({}, "gradebook-review");
      const payload = { score, feedback: form.feedback };
      if (item.kind === "assignment") {
        await api.gradebook.reviewSubmission(item.sourceId, { ...payload, grade: score }, config);
      } else {
        await api.gradebook.reviewQuizAttempt(item.sourceId, payload, config);
      }
      toast.success("Review saved — not yet released to student");
      await loadDetail();
      onSaved?.();
    } catch (e) {
      toast.error(e?.message || "Failed to save review");
    } finally {
      setSaving(false);
    }
  };

  const finalizeAndRelease = async () => {
    const score = validateScore();
    if (score === null) return;
    if (!window.confirm("Finalize and release this grade to the student?")) return;
    setApproving(true);
    try {
      const { config } = withRequestId({}, "gradebook-approve");
      const payload = { score, feedback: form.feedback };
      if (item.kind === "assignment") {
        await api.gradebook.approveSubmission(item.sourceId, { ...payload, grade: score }, config);
      } else {
        await api.gradebook.approveQuizAttempt(item.sourceId, payload, config);
      }
      toast.success("Grade finalized and released to student");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e?.message || "Failed to finalize grade");
    } finally {
      setApproving(false);
    }
  };

  const isFinalized = detail?.status === "final";
  const hasAiGrading = detail?.aiScore !== null && detail?.aiScore !== undefined;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 1050,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        padding: "24px 16px",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="dash-card"
        style={{ width: "100%", maxWidth: 860, position: "relative" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-2">
          <div>
            <h3 className="mb-1">{item.title}</h3>
            <div className="text-muted" style={{ fontSize: "0.88em" }}>
              {item.courseTitle || "Course"} &bull;{" "}
              {item.kind === "quiz" ? "Quiz Attempt" : "Assignment Submission"} &bull;{" "}
              {item.student
                ? [item.student.firstName, item.student.lastName].filter(Boolean).join(" ") ||
                  item.student.email ||
                  "Student"
                : "Student"}
            </div>
          </div>
          <div className="d-flex align-items-center gap-2">
            {detail && (
              <span
                className={`badge ${detail.status === "final" ? "bg-success" : detail.status === "ai_graded" || detail.status === "pending_teacher_review" ? "bg-warning text-dark" : "bg-secondary"}`}
              >
                {STATUS_LABELS[detail.status] || detail.status}
              </span>
            )}
            <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-muted">Loading submission...</p>
        ) : !detail ? (
          <p className="text-muted">Could not load submission detail.</p>
        ) : (
          <>
            {/* AI grading banner */}
            {hasAiGrading && (
              <div
                className="mb-4 p-3 rounded"
                style={{ background: "rgba(255,193,7,0.1)", border: "1px solid rgba(255,193,7,0.3)" }}
              >
                <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                  <span className="fw-semibold" style={{ fontSize: "0.9em" }}>
                    AI Grading Result
                  </span>
                  <ScorePill label="AI score" value={detail.aiScore} variant="warning text-dark" />
                  {detail.teacherAdjustedScore !== null && detail.teacherAdjustedScore !== undefined && (
                    <ScorePill label="Your review" value={detail.teacherAdjustedScore} variant="info" />
                  )}
                  {detail.finalScore !== null && detail.finalScore !== undefined && (
                    <ScorePill label="Final" value={detail.finalScore} variant="success" />
                  )}
                </div>
                {detail.aiFeedback && (
                  <div style={{ fontSize: "0.88em", whiteSpace: "pre-wrap" }} className="text-muted">
                    {detail.aiFeedback}
                  </div>
                )}
                {detail.aiGradedAt && (
                  <div className="text-muted mt-1" style={{ fontSize: "0.78em" }}>
                    Graded by AI on {new Date(detail.aiGradedAt).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Assignment: student content */}
            {item.kind === "assignment" && (
              <div className="mb-4">
                <div className="fw-semibold mb-2">Student Submission</div>
                {detail.textSubmission ? (
                  <div
                    className="p-3 rounded"
                    style={{ background: "rgba(255,255,255,0.05)", whiteSpace: "pre-wrap", fontSize: "0.9em" }}
                  >
                    {detail.textSubmission}
                  </div>
                ) : null}
                {detail.files?.length > 0 && (
                  <div className="mt-2">
                    <div className="text-muted mb-1" style={{ fontSize: "0.82em" }}>
                      Uploaded files:
                    </div>
                    {detail.files.map((f, i) => (
                      <div key={i} className="badge bg-secondary me-1 mb-1" style={{ fontWeight: 400 }}>
                        {f.name || `File ${i + 1}`} {f.size ? `(${(f.size / 1024).toFixed(0)} KB)` : ""}
                      </div>
                    ))}
                  </div>
                )}
                {!detail.textSubmission && !detail.files?.length && (
                  <p className="text-muted" style={{ fontSize: "0.88em" }}>No text or files submitted.</p>
                )}
              </div>
            )}

            {/* Quiz: per-question breakdown */}
            {item.kind === "quiz" && detail.questions?.length > 0 && (
              <div className="mb-4">
                <div className="fw-semibold mb-3">
                  Questions ({detail.questions.length})
                  {detail.timeSpent ? (
                    <span className="text-muted ms-2" style={{ fontSize: "0.82em", fontWeight: 400 }}>
                      Time spent: {Math.floor(detail.timeSpent / 60)}m {detail.timeSpent % 60}s
                    </span>
                  ) : null}
                </div>
                {detail.questions.map((q, i) => (
                  <QuizQuestionRow key={q._id || i} q={q} index={i} />
                ))}
              </div>
            )}

            {/* Teacher grading controls */}
            {isFinalized ? (
              <div className="p-3 rounded" style={{ background: "rgba(40,167,69,0.1)", border: "1px solid rgba(40,167,69,0.3)" }}>
                <div className="fw-semibold mb-1 text-success">Grade Finalized</div>
                <div className="text-muted" style={{ fontSize: "0.88em" }}>
                  Final score: <strong>{detail.finalScore ?? detail.score}%</strong>
                  {detail.finalFeedback && <> &bull; Feedback: {detail.finalFeedback}</>}
                </div>
                {detail.teacherApprovedAt && (
                  <div className="text-muted mt-1" style={{ fontSize: "0.78em" }}>
                    Approved on {new Date(detail.teacherApprovedAt).toLocaleString()}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="fw-semibold mb-3">Teacher Review</div>
                <div className="row g-3">
                  <div className="col-md-3">
                    <label className="form-label">
                      Score (%)
                      {hasAiGrading && form.score === "" && (
                        <span className="text-muted ms-1" style={{ fontSize: "0.78em" }}>
                          — AI suggested {detail.aiScore}%
                        </span>
                      )}
                    </label>
                    <input
                      className="form-control"
                      type="number"
                      min="0"
                      max="100"
                      placeholder={hasAiGrading ? `AI: ${detail.aiScore}%` : "0–100"}
                      value={form.score}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, score: e.target.value }));
                        setFeedbackIsAiDraft(false);
                      }}
                      disabled={saving || approving}
                    />
                  </div>
                  <div className="col-md-9">
                    <div className="d-flex justify-content-between align-items-center mb-1 flex-wrap gap-2">
                      <label className="form-label mb-0">
                        Feedback
                        {feedbackIsAiDraft && (
                          <span className="badge bg-warning text-dark ms-2" style={{ fontSize: "0.72em" }}>
                            AI Suggested — edit before saving
                          </span>
                        )}
                      </label>
                      <button
                        className="btn btn-outline-secondary btn-sm"
                        onClick={draftFeedbackWithAi}
                        disabled={aiDrafting || saving || approving}
                      >
                        {aiDrafting ? "Drafting…" : "AI suggest"}
                      </button>
                    </div>
                    <textarea
                      className="form-control"
                      rows={3}
                      placeholder={
                        hasAiGrading && detail.aiFeedback
                          ? "AI feedback shown above — write your own or use AI suggest"
                          : "Write personalized feedback for the student"
                      }
                      value={form.feedback}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, feedback: e.target.value }));
                        setFeedbackIsAiDraft(false);
                      }}
                      disabled={saving || approving}
                    />
                  </div>
                </div>
                <div className="mt-3 d-flex gap-2 flex-wrap">
                  <button
                    className="btn btn-outline-primary"
                    onClick={saveDraft}
                    disabled={saving || approving}
                    title="Save your review without releasing to the student yet"
                  >
                    {saving ? "Saving…" : "Save draft review"}
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={finalizeAndRelease}
                    disabled={saving || approving}
                    title="Finalize and release this grade to the student"
                  >
                    {approving ? "Releasing…" : "Finalize & release to student"}
                  </button>
                  <button
                    className="btn btn-outline-secondary"
                    onClick={onClose}
                    disabled={saving || approving}
                  >
                    Cancel
                  </button>
                </div>
                <div className="text-muted mt-2" style={{ fontSize: "0.8em" }}>
                  "Save draft review" stores your marks without notifying the student. "Finalize & release" locks the grade and makes it visible to the student.
                </div>
              </div>
            )}

            {/* Audit trail */}
            {detail.gradingAudit?.length > 0 && (
              <div className="mt-4">
                <div className="text-muted fw-semibold mb-2" style={{ fontSize: "0.82em" }}>
                  Grading history (last {detail.gradingAudit.length})
                </div>
                {[...detail.gradingAudit].reverse().map((entry, i) => (
                  <div key={i} className="text-muted" style={{ fontSize: "0.78em", marginBottom: 2 }}>
                    <span className="me-2">{entry.at ? new Date(entry.at).toLocaleString() : ""}</span>
                    <span className="me-2 badge bg-secondary">{entry.source || "?"}</span>
                    {entry.action} — {entry.statusFrom} → {entry.statusTo}
                    {entry.score !== null && entry.score !== undefined ? ` (${entry.score}%)` : ""}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
