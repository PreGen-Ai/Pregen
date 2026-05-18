import React from "react";
import { Link } from "react-router-dom";

export default function Button({
  children,
  variant = "primary",
  loading = false,
  loadingText,
  className = "",
  to,
  type = "button",
  disabled,
  ...props
}) {
  const classes = `pg-button pg-button--${variant} ${className}`.trim();
  const isDisabled = disabled || loading;
  const content = loading ? loadingText || "Loading..." : children;

  if (to) {
    return (
      <Link className={classes} to={to} {...props}>
        {content}
      </Link>
    );
  }

  return (
    <button className={classes} type={type} disabled={isDisabled} {...props}>
      {loading ? <span className="pg-button__spinner" aria-hidden="true" /> : null}
      {content}
    </button>
  );
}
