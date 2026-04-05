import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../services/api/api";
import "../components/styles/dashboard.css";

function formatDate(value, fallback = "Not scheduled") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString();
}

function SummaryCard({ title, value, subtitle }) {
  return (
    <div className="dash-card h-100">
      <div className="dash-card-title">{title}</div>
      <div style={{ fontSize: 28, fontWeight: 900 }}>{value}</div>
      {subtitle ? <p className="dash-card-muted mb-0">{subtitle}</p> : null}
    </div>
  );
}

function SimpleList({ title, actionLabel, actionTo, items, renderMeta, emptyMessage }) {
  return (
    <div className="dash-card">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h3 className="dash-card-title mb-0">{title}</h3>
        {actionLabel && actionTo ? (
          <Link className="btn btn-outline-light btn-sm" to={actionTo}>
            {actionLabel}
          </Link>
        ) : null}
      </div>

      {items.length ? (
        <div className="d-flex flex-column gap-3">
          {items.map((item) => (
            <div key={item._id} className="border rounded p-3 bg-light-subtle">
              <div className="fw-semibold">{item.title || "Untitled"}</div>
              <div className="small text-muted mt-1">{renderMeta(item)}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="dash-card-muted mb-0">{emptyMessage}</p>
      )}
    </div>
  );
}

export default function TeacherPortal() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({
    summary: {},
    upcomingAssignments: [],
    recentQuizzes: [],
    recentAnnouncements: [],
    recentMaterials: [],
  });

  const load = async () => {
    setLoading(true);
    try {
      const response = await api.teachers.getDashboard();
      setDashboard({
        summary: response?.summary || {},
        upcomingAssignments: response?.upcomingAssignments || [],
        recentQuizzes: response?.recentQuizzes || [],
        recentAnnouncements: response?.recentAnnouncements || [],
        recentMaterials: response?.recentMaterials || [],
      });
    } catch (error) {
      toast.error(error?.message || "Failed to load teacher dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(
    () => ({
      courses: Number(dashboard.summary?.courses || 0),
      assignments: Number(dashboard.summary?.assignments || 0),
      quizzes: Number(dashboard.summary?.quizzes || 0),
      pendingGrading: Number(dashboard.summary?.pendingGrading || 0),
    }),
    [dashboard.summary],
  );

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-3">
        <div>
          <h2>Teacher Dashboard</h2>
          <p className="text-muted mb-0">
            Keep track of upcoming work, recent content, announcements, and grading.
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Link className="btn btn-outline-light" to="/dashboard/teacher/assignments">
            Assignments
          </Link>
          <Link className="btn btn-outline-light" to="/dashboard/teacher/quizzes">
            Quizzes
          </Link>
          <Link className="btn btn-outline-light" to="/dashboard/materials">
            Materials
          </Link>
          <Link className="btn btn-outline-light" to="/dashboard/grades">
            Gradebook
          </Link>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <SummaryCard title="Courses" value={summary.courses} />
        </div>
        <div className="col-md-3">
          <SummaryCard title="Assignments" value={summary.assignments} />
        </div>
        <div className="col-md-3">
          <SummaryCard title="Quizzes" value={summary.quizzes} />
        </div>
        <div className="col-md-3">
          <SummaryCard
            title="Pending grading"
            value={summary.pendingGrading}
            subtitle="Submissions and attempts awaiting review"
          />
        </div>
      </div>

      {loading ? (
        <div className="dash-card">
          <p className="dash-card-muted mb-0">Loading dashboard...</p>
        </div>
      ) : (
        <div className="row g-4">
          <div className="col-lg-6 d-flex flex-column gap-4">
            <SimpleList
              title="Upcoming assignments"
              actionLabel="Open assignments"
              actionTo="/dashboard/teacher/assignments"
              items={dashboard.upcomingAssignments}
              renderMeta={(item) => `Due ${formatDate(item.dueDate)}`}
              emptyMessage="No assignment deadlines coming up yet."
            />

            <SimpleList
              title="Recent quizzes"
              actionLabel="Open quizzes"
              actionTo="/dashboard/teacher/quizzes"
              items={dashboard.recentQuizzes}
              renderMeta={(item) =>
                `${item.status || "draft"} • ${Number(item.timeLimit || 0)} min`
              }
              emptyMessage="No quizzes yet."
            />
          </div>

          <div className="col-lg-6 d-flex flex-column gap-4">
            <SimpleList
              title="Recent announcements"
              actionLabel="Open announcements"
              actionTo="/dashboard/announcements"
              items={dashboard.recentAnnouncements}
              renderMeta={(item) =>
                formatDate(item.publishedAt || item.createdAt)
              }
              emptyMessage="No announcements yet."
            />

            <SimpleList
              title="Recent materials"
              actionLabel="Open materials"
              actionTo="/dashboard/materials"
              items={dashboard.recentMaterials}
              renderMeta={(item) =>
                `${item.contentType || "material"} • ${formatDate(
                  item.createdAt,
                  "",
                )}`
              }
              emptyMessage="No materials published yet."
            />
          </div>
        </div>
      )}
    </div>
  );
}
