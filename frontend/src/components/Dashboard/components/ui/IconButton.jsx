import React from "react";

export default function IconButton({
  children,
  label,
  className = "",
  type = "button",
  ...props
}) {
  return (
    <button
      className={`pg-icon-button ${className}`.trim()}
      type={type}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
