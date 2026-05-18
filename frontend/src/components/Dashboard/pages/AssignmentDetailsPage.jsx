import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../../services/api/api";
import {
  Button,
  Modal,
  PageHeader,
  StatusBadge,
} from "../components/ui";

function formatDate(value, fallback = "No due date") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString();
}

function formatPercent(value, fallback = "Awaiting score") {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(0)}%` : fallback;
}

function hasPastDue(value) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

export default function AssignmentDetailsPage() {
  const { assignmentId } = useParams();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState([]);
  const [gradebook, setGradebook] = useState({ items: [] });
  const [commentOpen, setCommentOpen] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      try {
        const [assignmentsRes, gradebookRes] = await Promise.all([
          api.students.listAssignments({ limit: 100 }),
          api.gradebook.list(),
        ]);
        if (!live) return;
        setAssignments(assignmentsRes?.data || []);
        setGradebook({ items: gradebookRes?.items || [] });
      } catch (error) {
        if (live) toast.error(error?.message || "Failed to load assignment details");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const assignment = useMemo(
    () => assignments.find((item) => String(item._id) === String(assignmentId)) || null,
    [assignmentId, assignments],
  );

  const gradeRow = useMemo(
    () =>
      gradebook.items.find(
        (item) =>
          item?.kind === "assignment" &&
          (String(item?.assignmentId) === String(assignmentId) ||
            String(item?.sourceId) === String(assignmentId)),
      ) || null,
    [assignmentId, gradebook.items],
  );

  const statusLabel = useMemo(() => {
    if (assignment?.submission) return "Submitted";
    if (hasPastDue(assignment?.dueDate)) return "Overdue";
    return "To be submitted";
  }, [assignment]);

  return (
    <div className="quizzes-page">
      <PageHeader
        backTo="/dashboard/assignments"
        title={assignment?.title || (loading ? "Assignment" : "Assignment not found")}
        subtitle={assignment ? formatDate(assignment.dueDate) : ""}
        status={assignment ? <StatusBadge status={statusLabel} /> : null}
      />

      <div className="pg-detail-card">
        {loading ? (
          <p className="pg-muted mb-0">Loading assignment details...</p>
        ) : assignment ? (
          <>
            <h2 className="dash-card-title mb-3">Assignment Details</h2>
            <div className="pg-detail-grid">
              <div>
                <div className="pg-detail-label">Grade</div>
                <div className="pg-detail-value">
                  {gradeRow?.score !== null && gradeRow?.score !== undefined
                    ? "Graded"
                    : "Not graded"}
                </div>
              </div>
              <div>
                <div className="pg-detail-label">Status</div>
                <div className="pg-detail-value">
                  <StatusBadge status={statusLabel} />
                </div>
              </div>
              <div>
                <div className="pg-detail-label">Score</div>
                <div className="pg-detail-value">
                  {formatPercent(gradeRow?.score, "Awaiting score")}
                </div>
              </div>
              <div>
                <div className="pg-detail-label">Teacher Feedback</div>
                <div className="pg-detail-value pg-muted">
                  {gradeRow?.feedback || "No feedback yet."}
                </div>
              </div>
            </div>
            {assignment.description ? (
              <p className="pg-muted mt-3 mb-0">{assignment.description}</p>
            ) : null}
            <p className="pg-field__help mt-3 mb-0">
              Do you think something wrong?{" "}
              <button
                type="button"
                className="pg-button pg-button--ghost"
                style={{ minHeight: 0, padding: 0, color: "var(--pg-primary)" }}
                onClick={() => setCommentOpen(true)}
              >
                Leave comment
              </button>
            </p>
          </>
        ) : (
          <p className="pg-muted mb-0">This assignment is not available.</p>
        )}
      </div>

      <Modal
        open={commentOpen}
        title="Leave comment"
        onClose={() => setCommentOpen(false)}
        footer={<Button variant="secondary" onClick={() => setCommentOpen(false)}>Close</Button>}
      >
        <div className="pg-field">
          <label className="pg-field__label" htmlFor="assignment-page-comment">
            Add your comment
          </label>
          <textarea
            id="assignment-page-comment"
            className="pg-input"
            placeholder="Comment"
            rows={4}
          />
        </div>
        <p className="pg-field__help">
          Comments are not submitted because there is no existing comment API wired for this action.
        </p>
      </Modal>
    </div>
  );
}
