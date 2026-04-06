// Shared status badge — consistent pill badges across all dashboard pages
import React from "react";

const BADGE_MAP = {
  published: "bg-primary",
  active: "bg-primary",
  open: "bg-primary",
  graded: "bg-success",
  submitted: "bg-success",
  complete: "bg-success",
  completed: "bg-success",
  healthy: "bg-success",
  draft: "bg-warning text-dark",
  pending: "bg-warning text-dark",
  trial: "bg-warning text-dark",
  review: "bg-info text-dark",
  grading: "bg-info text-dark",
  closed: "bg-secondary",
  missing: "bg-secondary",
  inactive: "bg-secondary",
  disabled: "bg-secondary",
  error: "bg-danger",
  failed: "bg-danger",
  suspended: "bg-danger",
};

export default function StatusBadge({ status, className = "" }) {
  const normalized = String(status || "").trim().toLowerCase();
  const cls = BADGE_MAP[normalized] || "bg-secondary";
  return (
    <span
      className={`badge rounded-pill ${cls} ${className}`}
      style={{ fontSize: "0.73em", padding: "0.33em 0.65em", letterSpacing: "0.01em" }}
    >
      {status || "—"}
    </span>
  );
}
