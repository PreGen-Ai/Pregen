// Shared empty state component — consistent across all dashboard pages
import React from "react";

export default function EmptyState({ icon, title, message, action, onAction }) {
  return (
    <div className="dash-card text-center py-5">
      {icon && (
        <div style={{ fontSize: 40, opacity: 0.35, marginBottom: 12 }}>{icon}</div>
      )}
      <h5 style={{ color: "var(--text-heading)", marginBottom: 8 }}>
        {title || "Nothing here yet"}
      </h5>
      {message && (
        <p className="text-muted mb-0" style={{ maxWidth: 420, margin: "0 auto" }}>
          {message}
        </p>
      )}
      {action && onAction && (
        <button className="btn btn-primary mt-4" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
