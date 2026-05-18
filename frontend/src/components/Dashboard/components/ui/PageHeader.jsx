import React from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";

export default function PageHeader({
  title,
  subtitle,
  action,
  actions,
  backTo,
  status,
}) {
  return (
    <header className="pg-page-header">
      <div className="pg-page-header__main">
        <div className="pg-page-header__title-row">
          {backTo ? (
            <Link className="pg-back-link" to={backTo} aria-label="Go back">
              <FiArrowLeft />
            </Link>
          ) : null}
          <h1 className="pg-page-title">{title}</h1>
          {status}
        </div>
        {subtitle ? <p className="pg-page-subtitle">{subtitle}</p> : null}
      </div>
      {action || actions ? (
        <div className="pg-page-actions">
          {actions}
          {action}
        </div>
      ) : null}
    </header>
  );
}
