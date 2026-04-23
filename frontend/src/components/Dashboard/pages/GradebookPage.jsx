import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import api from "../../../services/api/api";
import useRealtimeRefresh from "../../../hooks/useRealtimeRefresh";
import { withRequestId } from "../../../utils/requestId";
import { useAuthContext } from "../../../context/AuthContext";
import GradeReviewPanel from "./GradeReviewPanel";

const asCourses = (value) => {
  if (Array.isArray(value?.courses)) return value.courses;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value)) return value;
  return [];
};

const roleValue = (user) => String(user?.role || "").trim().toUpperCase();

const formatScore = (item) =>
  item.score === null || item.score === undefined || item.score === ""
    ? "Awaiting grade"
    : `${Number(item.score).toFixed(0)}%`;

const formatStudent = (item) =>
  item.student
    ? [item.student.firstName, item.student.lastName].filter(Boolean).join(" ") ||
      item.student.email ||
      item.student.username ||
      "Student"
    : "Student";

const kindLabel = (kind) => (kind === "quiz" ? "Quiz" : "Assignment");

const statusBadgeClass = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "final" || normalized === "graded") return "bg-success";
  if (normalized === "ai_graded") return "bg-warning text-dark";
  if (normalized === "pending_teacher_review") return "bg-warning text-dark";
  if (normalized === "submitted") return "bg-info text-dark";
  if (normalized === "grading_delayed" || normalized === "failed") return "bg-danger";
  return "bg-secondary";
};

const STATUS_DISPLAY = {
  final: "Finalized",
  graded: "Graded",
  ai_graded: "AI Graded",
  pending_teacher_review: "Needs Review",
  submitted: "Submitted",
  grading_delayed: "Delayed",
  failed: "Failed",
};

function SummaryCard({ title, value, subtitle }) {
  return (
    <div className="dash-card h-100">
      <div className="dash-card-title">{title}</div>
      <div style={{ fontSize: 28, fontWeight: 900 }}>{value}</div>
      {subtitle ? <p className="dash-card-muted mb-0">{subtitle}</p> : null}
    </div>
  );
}

export default function GradebookPage() {
  const { user } = useAuthContext();
  const role = roleValue(user);
  const canEdit = ["TEACHER", "ADMIN", "SUPERADMIN"].includes(role);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [editingId, setEditingId] = useState("");
  const [gradeForm, setGradeForm] = useState({ score: "", feedback: "" });
  const [feedbackIsAiDraft, setFeedbackIsAiDraft] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [bulkSelected, setBulkSelected] = useState([]);
  const [bulkForm, setBulkForm] = useState({ score: "", feedback: "" });
  const [bulkSaving, setBulkSaving] = useState(false);
  const [reviewItem, setReviewItem] = useState(null);

  const editingItem = useMemo(
    () => items.find((item) => item._id === editingId) || null,
    [items, editingId],
  );

  const pendingCount = useMemo(
    () =>
      items.filter(
        (item) => !["graded"].includes(String(item.status || "").trim().toLowerCase()),
      ).length,
    [items],
  );

  const load = useCallback(async (courseId = "") => {
    setLoading(true);
    try {
      const [coursesRes, gradebookRes] = await Promise.all([
        api.courses.getAllCourses({ limit: 200 }),
        api.gradebook.list(courseId ? { courseId } : undefined),
      ]);

      const nextCourses = asCourses(coursesRes);
      setCourses(nextCourses);
      if (courseId && !nextCourses.some((course) => course._id === courseId)) {
        setSelectedCourseId("");
      }

      setItems(gradebookRes?.items || []);
      setSummary(gradebookRes?.summary || null);
    } catch (error) {
      toast.error(error?.message || "Failed to load gradebook");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(selectedCourseId);
  }, [load, selectedCourseId]);

  useRealtimeRefresh(
    () => load(selectedCourseId),
    {
      shouldRefresh: (event) => {
        const eventType = String(event?.type || "");
        if (!["submission", "grading", "teacher_review", "grade"].includes(eventType)) {
          return false;
        }

        const eventCourseId = String(event?.meta?.courseId || "");
        return !selectedCourseId || !eventCourseId || eventCourseId === selectedCourseId;
      },
    },
  );

  const startEdit = (item) => {
    setEditingId(item._id);
    setFeedbackIsAiDraft(false);
    setGradeForm({
      score: item.score ?? "",
      feedback: item.feedback || "",
    });
  };

  const draftFeedbackWithAi = async () => {
    if (!editingItem) return;
    const score = Number(String(gradeForm.score).trim());
    setAiDrafting(true);
    try {
      const response = await api.ai.generateExplanation({
        question_data: {
          topic: editingItem.title || "Assessment",
          question: `Draft concise teacher feedback for a ${editingItem.kind} scored ${Number.isFinite(score) ? score + "%" : "(not yet scored)"}. Keep it 1-2 sentences, actionable, and teacher-appropriate. Do not refer to yourself as AI.`,
          context: `Assessment: ${editingItem.title}. Course: ${editingItem.courseTitle || "Unknown"}. Type: ${editingItem.kind}.`,
          type: "feedback_draft",
        },
        subject: editingItem.courseTitle || "General",
        style: "teacher-ready",
      });
      const text =
        response?.explanation ||
        response?.reply ||
        response?.message ||
        response?.text ||
        "";
      if (text) {
        setGradeForm((prev) => ({ ...prev, feedback: text }));
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

  const saveBulkGrades = async () => {
    if (!bulkSelected.length) return;
    const rawScore = String(bulkForm.score ?? "").trim();
    if (!rawScore) {
      toast.error("Enter a score for bulk update");
      return;
    }
    const parsedScore = Number(rawScore);
    if (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      toast.error("Score must be between 0 and 100");
      return;
    }
    if (
      !window.confirm(
        `Apply score ${parsedScore}% to ${bulkSelected.length} selected item(s)?`,
      )
    )
      return;

    setBulkSaving(true);
    try {
      await Promise.all(
        bulkSelected.map((id) => {
          const item = items.find((i) => i._id === id);
          if (!item) return Promise.resolve();
          const { config } = withRequestId({}, "gradebook-bulk");
          return item.kind === "assignment"
            ? api.gradebook.updateSubmission(item.sourceId, {
                grade: parsedScore,
                feedback: bulkForm.feedback || undefined,
              }, config)
            : api.gradebook.updateQuizAttempt(item.sourceId, {
                score: parsedScore,
                feedback: bulkForm.feedback || undefined,
              }, config);
        }),
      );
      toast.success(`${bulkSelected.length} item(s) updated`);
      setBulkSelected([]);
      setBulkForm({ score: "", feedback: "" });
      await load(selectedCourseId);
    } catch (e) {
      toast.error(e?.message || "Bulk update failed");
    } finally {
      setBulkSaving(false);
    }
  };

  const toggleBulkSelect = (id) =>
    setBulkSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const allPendingIds = items
    .filter(
      (item) =>
        !["graded"].includes(String(item.status || "").trim().toLowerCase()),
    )
    .map((item) => item._id);

  const saveGrade = async () => {
    if (!editingItem) return;

    const rawScore = String(gradeForm.score ?? "").trim();
    if (!rawScore) {
      toast.error("Score is required");
      return;
    }

    const parsedScore = Number(rawScore);
    if (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      toast.error("Score must be between 0 and 100");
      return;
    }

    try {
      setSaving(true);
      const { config } = withRequestId({}, "gradebook-update");
      if (editingItem.kind === "assignment") {
        await api.gradebook.updateSubmission(editingItem.sourceId, {
          grade: parsedScore,
          feedback: gradeForm.feedback,
        }, config);
      } else {
        await api.gradebook.updateQuizAttempt(editingItem.sourceId, {
          score: parsedScore,
          feedback: gradeForm.feedback,
        }, config);
      }
      toast.success("Grade updated");
      setEditingId("");
      setGradeForm({ score: "", feedback: "" });
      await load(selectedCourseId);
    } catch (error) {
      toast.error(error?.message || "Failed to update grade");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-3">
        <div>
          <h2>{canEdit ? "Gradebook" : "My Grades"}</h2>
          <p className="text-muted mb-0">
            {canEdit
              ? "Review assignment submissions and quiz results in one grading surface."
              : "Track your marks and teacher feedback across assignments and quizzes."}
          </p>
        </div>
        <div style={{ minWidth: 280 }}>
          <label className="form-label">Course filter</label>
          <select
            className="form-select"
            value={selectedCourseId}
            onChange={(event) => setSelectedCourseId(event.target.value)}
          >
            <option value="">All accessible courses</option>
            {courses.map((course) => (
              <option key={course._id} value={course._id}>
                {course.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {summary ? (
        <div className="row g-3 mb-4">
          <div className="col-md-6 col-xl-3">
            <SummaryCard title="Rows" value={summary.total || 0} />
          </div>
          <div className="col-md-6 col-xl-3">
            <SummaryCard title="Graded" value={summary.graded || 0} />
          </div>
          <div className="col-md-6 col-xl-3">
            <SummaryCard title="Pending" value={pendingCount} />
          </div>
          <div className="col-md-6 col-xl-3">
            <SummaryCard
              title="Average"
              value={
                summary.averageScore === null || summary.averageScore === undefined
                  ? "N/A"
                  : `${summary.averageScore}%`
              }
              subtitle={`${summary.assignments || 0} assignments, ${summary.quizzes || 0} quizzes`}
            />
          </div>
        </div>
      ) : null}

      {editingItem ? (
        <div className="dash-card mb-4">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <h3 className="mb-0">
              Grade: {editingItem.title}
            </h3>
            <span className="badge bg-warning text-dark">
              Draft — not saved yet
            </span>
          </div>
          <p className="text-muted mb-3">
            {kindLabel(editingItem.kind)} for {editingItem.courseTitle || "Course"}.
            Enter a score and optional feedback, then click Save.
          </p>
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Score (%)</label>
              <input
                className="form-control"
                type="number"
                min="0"
                max="100"
                value={gradeForm.score}
                onChange={(event) => {
                  setGradeForm((current) => ({
                    ...current,
                    score: event.target.value,
                  }));
                  setFeedbackIsAiDraft(false);
                }}
              />
            </div>
            <div className="col-md-9">
              <div className="d-flex justify-content-between align-items-center mb-1 flex-wrap gap-2">
                <label className="form-label mb-0">
                  Feedback
                  {feedbackIsAiDraft && (
                    <span
                      className="badge bg-warning text-dark ms-2"
                      style={{ fontSize: "0.72em" }}
                    >
                      AI Suggested — edit before saving
                    </span>
                  )}
                </label>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={draftFeedbackWithAi}
                  disabled={aiDrafting || saving}
                  title="Get an AI-suggested feedback draft — review and edit before saving"
                >
                  {aiDrafting ? "Drafting…" : "AI suggest"}
                </button>
              </div>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Write feedback or use AI suggest above"
                value={gradeForm.feedback}
                onChange={(event) => {
                  setGradeForm((current) => ({
                    ...current,
                    feedback: event.target.value,
                  }));
                  setFeedbackIsAiDraft(false);
                }}
              />
            </div>
          </div>
          <div className="mt-3 d-flex gap-2">
            <button
              className="btn btn-primary"
              onClick={saveGrade}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save grade"}
            </button>
            <button
              className="btn btn-outline-light"
              onClick={() => {
                setEditingId("");
                setFeedbackIsAiDraft(false);
              }}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {canEdit && !editingItem && bulkSelected.length > 0 && (
        <div className="dash-card mb-4">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <h3 className="mb-0">
              Bulk grade — {bulkSelected.length} selected
            </h3>
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setBulkSelected([])}
            >
              Clear selection
            </button>
          </div>
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">Score (%) *</label>
              <input
                className="form-control"
                type="number"
                min="0"
                max="100"
                placeholder="0–100"
                value={bulkForm.score}
                onChange={(e) =>
                  setBulkForm((p) => ({ ...p, score: e.target.value }))
                }
              />
            </div>
            <div className="col-md-9">
              <label className="form-label">Feedback (optional)</label>
              <textarea
                className="form-control"
                rows={2}
                placeholder="Shared feedback for all selected items"
                value={bulkForm.feedback}
                onChange={(e) =>
                  setBulkForm((p) => ({ ...p, feedback: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="mt-3">
            <button
              className="btn btn-primary"
              onClick={saveBulkGrades}
              disabled={bulkSaving}
            >
              {bulkSaving
                ? "Saving…"
                : `Apply to ${bulkSelected.length} item(s)`}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="dash-card">
          <p className="text-muted mb-0">Loading gradebook...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="dash-card">
          <p className="text-muted mb-0">No grades are available yet.</p>
        </div>
      ) : (
        <div className="table-responsive dash-card">
          {canEdit && (
            <div className="d-flex gap-3 align-items-center mb-2 flex-wrap">
              <div className="form-check mb-0">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="selectAllPending"
                  checked={
                    allPendingIds.length > 0 &&
                    allPendingIds.every((id) => bulkSelected.includes(id))
                  }
                  onChange={(e) =>
                    setBulkSelected(e.target.checked ? allPendingIds : [])
                  }
                />
                <label className="form-check-label" htmlFor="selectAllPending">
                  Select all ungraded ({allPendingIds.length})
                </label>
              </div>
              {bulkSelected.length > 0 && (
                <span className="text-muted" style={{ fontSize: "0.85em" }}>
                  {bulkSelected.length} selected — bulk grade panel above
                </span>
              )}
            </div>
          )}
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
                {canEdit && <th style={{ width: 32 }}></th>}
                <th>Type</th>
                <th>Assessment</th>
                {canEdit ? <th>Student</th> : null}
                <th>Course</th>
                <th>Result</th>
                <th>Status</th>
                <th>Feedback</th>
                {canEdit ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id}>
                  {canEdit && (
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={bulkSelected.includes(item._id)}
                        onChange={() => toggleBulkSelect(item._id)}
                      />
                    </td>
                  )}
                  <td>
                    <span className="badge bg-secondary">{kindLabel(item.kind)}</span>
                  </td>
                  <td>
                    <div className="fw-semibold">{item.title}</div>
                    <div className="small text-muted">
                      {item.maxScore ? `Max ${item.maxScore} pts` : "No max score"}
                    </div>
                  </td>
                  {canEdit ? <td>{formatStudent(item)}</td> : null}
                  <td>{item.courseTitle || "Course"}</td>
                  <td>{formatScore(item)}</td>
                  <td>
                    <span className={`badge ${statusBadgeClass(item.status)}`}>
                      {STATUS_DISPLAY[item.status] || item.status || "pending"}
                    </span>
                    {item.aiScore !== null && item.aiScore !== undefined && (
                      <div className="text-muted mt-1" style={{ fontSize: "0.75em" }}>
                        AI: {Number(item.aiScore).toFixed(0)}%
                      </div>
                    )}
                  </td>
                  <td>
                    <span style={{ maxWidth: 240, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.feedback || "No feedback yet"}
                    </span>
                  </td>
                  {canEdit ? (
                    <td>
                      <button
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => setReviewItem(item)}
                      >
                        Review
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reviewItem && (
        <GradeReviewPanel
          item={reviewItem}
          onClose={() => setReviewItem(null)}
          onSaved={() => load(selectedCourseId)}
        />
      )}
    </div>
  );
}
