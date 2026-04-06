// Shared loading spinner — consistent across all dashboard pages
import React from "react";

export default function LoadingSpinner({ message }) {
  return (
    <div className="d-flex align-items-center justify-content-center py-5 gap-3">
      <div
        className="spinner-border spinner-border-sm"
        role="status"
        style={{ color: "var(--primary)" }}
      >
        <span className="visually-hidden">Loading…</span>
      </div>
      <span className="text-muted">{message || "Loading…"}</span>
    </div>
  );
}
