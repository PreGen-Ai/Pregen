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
    ? "Not graded"
    : `${item.score}${item.maxScore ? ` / ${item.maxScore}` : ""}`;

const formatStudent = (item) =>
  item.student
    ? [item.student.firstName, item.student.lastName].filter(Boolean).join(" ") ||
      item.student.email ||
      item.student.username ||
      "Student"
    : "Student";

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
        <div className="d-flex gap-3 flex-wrap mb-4">
          <span className="badge bg-secondary">Total: {summary.total || 0}</span>
          <span className="badge bg-secondary">
            Assignments: {summary.assignments || 0}
          </span>
          <span className="badge bg-secondary">Quizzes: {summary.quizzes || 0}</span>
          <span className="badge bg-secondary">Graded: {summary.graded || 0}</span>
          <span className="badge bg-info text-dark">
            Average: {summary.averageScore ?? "N/A"}
          </span>
        </div>
      ) : null}

      {editingItem ? (
        <div className="dash-card mb-4">
          <h3 className="mb-3">Update {editingItem.title}</h3>
          <div className="row g-3">
            <div className="col-md-3">
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
                <th>Title</th>
                {canEdit ? <th>Student</th> : null}
                <th>Course</th>
                <th>Score</th>
                <th>Status</th>
                <th>Feedback</th>
                {canEdit ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item._id}>
                  <td className="text-uppercase">{item.kind}</td>
                  <td>{item.title}</td>
                  {canEdit ? <td>{formatStudent(item)}</td> : null}
                  <td>{item.courseTitle || "Course"}</td>
                  <td>{formatScore(item)}</td>
                  <td className="text-capitalize">{item.status || "pending"}</td>
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
