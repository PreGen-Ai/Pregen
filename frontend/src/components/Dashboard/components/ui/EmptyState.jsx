import React from "react";
import Button from "./Button";

export default function EmptyState({
  icon,
  title = "No results",
  message = "Try adjusting your filters or check back later.",
  action,
  onAction,
}) {
  return (
    <div className="pg-empty-state">
      {icon ? (
        <div className="pg-empty-state__icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h3 className="pg-empty-state__title">{title}</h3>
      <p className="pg-empty-state__message">{message}</p>
      {action && onAction ? (
        <Button variant="primary" onClick={onAction}>
          {action}
        </Button>
      ) : null}
    </div>
  );
}
