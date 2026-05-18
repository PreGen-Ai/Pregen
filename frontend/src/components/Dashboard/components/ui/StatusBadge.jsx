import React from "react";

const TONE_BY_STATUS = {
  graded: "success",
  returned: "success",
  released: "success",
  final: "success",
  submitted: "info",
  published: "info",
  active: "info",
  open: "info",
  in_progress: "info",
  "in progress": "info",
  generating: "warning",
  grading: "warning",
  pending: "warning",
  pending_review: "warning",
  pending_teacher_review: "warning",
  "pending review": "warning",
  draft: "neutral",
  missing: "neutral",
  closed: "neutral",
  inactive: "neutral",
  disabled: "neutral",
  trial: "warning",
  reviewed: "ai",
  ai_assisted: "ai",
  "ai-assisted": "ai",
  failed: "error",
  error: "error",
  overdue: "error",
  suspended: "error",
};

const LABELS = {
  pending_review: "Pending review",
  pending_teacher_review: "Pending review",
  ai_assisted: "AI-assisted",
  in_progress: "In progress",
};

export function getStatusTone(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return TONE_BY_STATUS[normalized] || "neutral";
}

export default function StatusBadge({ status, tone, className = "" }) {
  const normalized = String(status || "").trim().toLowerCase();
  const label = LABELS[normalized] || status || "Draft";
  const resolvedTone = tone || getStatusTone(status);

  return (
    <span
      className={`pg-status-badge pg-status-badge--${resolvedTone} ${className}`.trim()}
    >
      {label}
    </span>
  );
}
