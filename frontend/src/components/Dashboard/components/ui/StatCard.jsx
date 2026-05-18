import React from "react";

export default function StatCard({
  label,
  value,
  icon,
  tone = "info",
  extra,
}) {
  return (
    <article className={`pg-stat-card pg-stat-card--${tone}`}>
      <div>
        <p className="pg-stat-card__label">{label}</p>
        <div className="pg-stat-card__value">{value}</div>
        {extra ? <div className="pg-stat-card__extra">{extra}</div> : null}
      </div>
      {icon ? <span className="pg-stat-card__icon">{icon}</span> : null}
    </article>
  );
}
