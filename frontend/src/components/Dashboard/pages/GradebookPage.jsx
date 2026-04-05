import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import api from "../../../services/api/api";
import { useAuthContext } from "../../../context/AuthContext";

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
  if (normalized === "graded") return "bg-success";
  if (normalized === "submitted") return "bg-warning text-dark";
  if (normalized === "grading") return "bg-info text-dark";
  return "bg-secondary";
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

  const startEdit = (item) => {
    setEditingId(item._id);
    setGradeForm({
      score: item.score ?? "",
      feedback: item.feedback || "",
    });
  };

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
      if (editingItem.kind === "assignment") {
        await api.gradebook.updateSubmission(editingItem.sourceId, {
          grade: parsedScore,
          feedback: gradeForm.feedback,
        });
      } else {
        await api.gradebook.updateQuizAttempt(editingItem.sourceId, {
          score: parsedScore,
          feedback: gradeForm.feedback,
        });
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
          <h3 className="mb-3">Update {editingItem.title}</h3>
          <p className="text-muted mb-3">
            {kindLabel(editingItem.kind)} for {editingItem.courseTitle || "Course"}.
            Use a 0-100 score and keep feedback concise and actionable.
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
                onChange={(event) =>
                  setGradeForm((current) => ({
                    ...current,
                    score: event.target.value,
                  }))
                }
              />
            </div>
            <div className="col-md-9">
              <label className="form-label">Feedback</label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Feedback"
                value={gradeForm.feedback}
                onChange={(event) =>
                  setGradeForm((current) => ({
                    ...current,
                    feedback: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="mt-3 d-flex gap-2">
            <button className="btn btn-primary" onClick={saveGrade} disabled={saving}>
              {saving ? "Saving..." : "Save grade"}
            </button>
            <button
              className="btn btn-outline-light"
              onClick={() => setEditingId("")}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

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
          <table className="table table-dark table-hover align-middle mb-0">
            <thead>
              <tr>
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
                      {item.status || "pending"}
                    </span>
                  </td>
                  <td>{item.feedback || "No feedback yet"}</td>
                  {canEdit ? (
                    <td>
                      <button
                        className="btn btn-outline-light btn-sm"
                        onClick={() => startEdit(item)}
                      >
                        Edit
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
