import React from "react";

export default function LoadingSkeleton({ rows = 4, variant = "table" }) {
  if (variant === "stats") {
    return (
      <div className="pg-stats-grid" aria-label="Loading statistics">
        {Array.from({ length: rows }).map((_, index) => (
          <div className="pg-stat-card pg-skeleton-card" key={index}>
            <span className="pg-skeleton-line w50" />
            <span className="pg-skeleton-line w70" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="pg-skeleton-table" aria-label="Loading rows">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="pg-skeleton-row" key={index}>
          <span className="pg-skeleton-line w35" />
          <span className="pg-skeleton-line w70" />
          <span className="pg-skeleton-line w50" />
        </div>
      ))}
    </div>
  );
}
