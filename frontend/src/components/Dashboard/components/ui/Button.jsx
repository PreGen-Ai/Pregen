import React from "react";
import { Link } from "react-router-dom";

export default function Button({
  children,
  variant = "primary",
  className = "",
  to,
  type = "button",
  ...props
}) {
  const classes = `pg-button pg-button--${variant} ${className}`.trim();

  if (to) {
    return (
      <Link className={classes} to={to} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} type={type} {...props}>
      {children}
    </button>
  );
}
