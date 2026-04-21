import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaBolt,
  FaClock,
  FaExclamationTriangle,
  FaHeartbeat,
  FaMoneyBillWave,
  FaRobot,
  FaServer,
  FaSyncAlt,
  FaUsers,
} from "react-icons/fa";

import api from "../../../../services/api/api.js";
import {
  collectionItems,
  formatMetricValue,
  metricDescription,
  sourceBadgeClass,
} from "../../../../utils/analyticsState.js";

const fmtInt = (value) => new Intl.NumberFormat().format(Number(value || 0));
const fmtMoney = (value) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Number(value || 0));
const fmtMs = (value) => `${Math.round(Number(value || 0))} ms`;

function HealthBadge({ status }) {
  const normalized = String(status || "unknown").toLowerCase();
  const label = normalized.replaceAll("_", " ");
  return (
    <span className={`badge ${sourceBadgeClass(normalized)} d-inline-flex align-items-center gap-1`}>
      <FaHeartbeat />
      {label}
    </span>
  );
}

function StatCard({ title, value, sub, icon: Icon, state }) {
  return (
    <div className="dash-card py-3 h-100">
      <div className="d-flex align-items-start justify-content-between gap-2">
        <div>
          <div
            className="dash-muted-label"
            style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em" }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: typeof value === "string" && value.length > 18 ? "1rem" : "1.45rem",
              fontWeight: 800,
              color: state === "ok" || state === "zero" ? "var(--text-heading)" : "var(--text-muted)",
              lineHeight: 1.2,
              marginTop: 4,
            }}
          >
            {value}
          </div>
          {sub ? (
            <div className="dash-supporting-text mt-2">
              {sub}
            </div>
          ) : null}
        </div>
        {Icon ? (
        <div className="dash-supporting-text" style={{ fontSize: "1.1rem", flexShrink: 0 }}>
          <Icon />
        </div>
        ) : null}
      </div>
    </div>
  );
}

function ErrorPanel({ message }) {
  if (!message) return null;
  return (
    <div className="alert alert-danger d-flex align-items-start gap-2 mb-4">
      <FaExclamationTriangle className="flex-shrink-0 mt-1" />
      <div>
        <div className="fw-semibold">Unable to load platform overview</div>
        <div className="mt-1" style={{ fontSize: "0.85em" }}>
          {message}
        </div>
      </div>
    </div>
  );
}

function SourceStatusPill({ label, status }) {
  return (
    <div className="d-flex align-items-center gap-2">
      <span className={`badge ${sourceBadgeClass(status?.state)} text-uppercase`}>
        {String(status?.state || "unknown").replaceAll("_", " ")}
      </span>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div className="text-muted" style={{ fontSize: "0.78rem" }}>
          {status?.label || "No status available"}
        </div>
      </div>
    </div>
  );
}

export default function SuperDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await api.admin.superOverview();
      setOverview(data || null);
      setLastRefreshedAt(new Date());
    } catch (loadError) {
      setError(loadError?.message || "Unable to load platform overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const metrics = overview?.metrics || {};
  const alerts = collectionItems(overview?.alerts || { items: overview?.spikes || [] });
  const sourceStatus = overview?.sourceStatus || {};
  const health = overview?.health || {};

  const cards = useMemo(
    () => [
      {
        title: "Active Schools",
        value: formatMetricValue(metrics.activeTenants, fmtInt, "No school data"),
        sub: metricDescription(metrics.activeTenants, "Not suspended"),
        icon: FaServer,
        state: metrics.activeTenants?.state,
      },
      {
        title: "Total Students",
        value: formatMetricValue(metrics.totalStudents, fmtInt, "No student data"),
        sub: metricDescription(metrics.totalStudents, "Across all schools"),
        icon: FaUsers,
        state: metrics.totalStudents?.state,
      },
      {
        title: "AI Calls (24h)",
        value: formatMetricValue(metrics.aiCalls24h, fmtInt, "No AI activity yet"),
        sub: metricDescription(metrics.aiCalls24h, "Last 24 hours"),
        icon: FaRobot,
        state: metrics.aiCalls24h?.state,
      },
      {
        title: "Cost Today",
        value: formatMetricValue(metrics.costToday, (value) => `$${fmtMoney(value)}`, "No AI cost data yet"),
        sub: metricDescription(metrics.costToday, "Estimated today"),
        icon: FaMoneyBillWave,
        state: metrics.costToday?.state,
      },
      {
        title: "Cost MTD",
        value: formatMetricValue(metrics.costMTD, (value) => `$${fmtMoney(value)}`, "No MTD cost data yet"),
        sub: metricDescription(metrics.costMTD, "Month to date"),
        icon: FaMoneyBillWave,
        state: metrics.costMTD?.state,
      },
      {
        title: "P95 Latency",
        value: formatMetricValue(metrics.p95LatencyMs, fmtMs, "No latency data yet"),
        sub: metricDescription(metrics.p95LatencyMs, "AI response time"),
        icon: FaClock,
        state: metrics.p95LatencyMs?.state,
      },
      {
        title: "Errors (24h)",
        value: formatMetricValue(metrics.errors24h, fmtInt, "Audit logging has no events yet"),
        sub: metricDescription(metrics.errors24h, "Platform errors"),
        icon: FaBolt,
        state: metrics.errors24h?.state,
      },
      {
        title: "Health",
        value: <HealthBadge status={health.state || metrics.health?.value} />,
        sub: health.label || metricDescription(metrics.health, "Platform status"),
        icon: FaHeartbeat,
        state: health.state || metrics.health?.state,
      },
    ],
    [health, metrics],
  );

  const links = useMemo(
    () => [
      {
        title: "Schools",
        icon: FaUsers,
        desc: "Operational view of plans, status, headcounts, and selected-school entry points.",
        to: "/dashboard/superadmin/tenants",
        label: "Open Schools",
      },
      {
        title: "AI Usage & Cost",
        icon: FaRobot,
        desc: "Requests over time, cost, latency, attribution, and telemetry gaps.",
        to: "/dashboard/superadmin/ai-cost",
        label: "Open AI Usage & Cost",
      },
      {
        title: "Platform AI Controls",
        icon: FaMoneyBillWave,
        desc: "Configure platform defaults and inspect school-level overrides from one control surface.",
        to: "/dashboard/superadmin/ai-controls",
        label: "Open Platform AI Controls",
      },
      {
        title: "Audit Logs",
        icon: FaServer,
        desc: "Review system audit events and AI request telemetry in one observability surface.",
        to: "/dashboard/superadmin/audit",
        label: "Open Audit Logs",
      },
      {
        title: "Feature Flags",
        icon: FaBolt,
        desc: "Limited operational visibility only. This surface remains read-only until rollout mutations are production-ready.",
        to: "/dashboard/superadmin/feature-flags",
        label: "Open Limited View",
      },
    ],
    [],
  );

  return (
    <div className="quizzes-page">
      <div className="dash-page-header">
        <div>
          <div className="dash-page-kicker">Platform Scope</div>
          <h2 className="dash-page-title">Platform Analytics</h2>
          <p className="dash-page-subtitle">
            Trustworthy platform telemetry across schools, AI usage, cost,
            latency, audit activity, and health.
          </p>
          {lastRefreshedAt ? (
            <div className="dash-supporting-text mt-2">
              Last refreshed: {lastRefreshedAt.toLocaleString()}
            </div>
          ) : null}
        </div>
        <div className="dash-page-actions">
          <button
            type="button"
            onClick={load}
            className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
            disabled={loading}
          >
            <FaSyncAlt />
            Refresh
          </button>
        </div>
      </div>

      <ErrorPanel message={error} />

      {loading ? (
        <div className="dash-card text-center text-muted py-5">Loading...</div>
      ) : (
        <>
          <div className="row g-3 mb-4">
            {cards.map((card) => (
              <div key={card.title} className="col-12 col-sm-6 col-xl-3">
                <StatCard
                  title={card.title}
                  value={card.value}
                  sub={card.sub}
                  icon={card.icon}
                  state={card.state}
                />
              </div>
            ))}
          </div>

          <div className="row g-3 mb-4">
            <div className="col-lg-5">
              <div className="dash-card h-100">
                <h3 className="dash-card-title mb-3">Telemetry Status</h3>
                <div className="d-grid gap-3">
                  <SourceStatusPill label="AI provider" status={sourceStatus.aiProvider} />
                  <SourceStatusPill label="Usage logging" status={sourceStatus.aiLogging} />
                  <SourceStatusPill label="Audit logging" status={sourceStatus.auditLogging} />
                </div>
              </div>
            </div>

            <div className="col-lg-7">
              <div className="dash-card h-100">
                <h3 className="dash-card-title mb-1 d-flex align-items-center gap-2">
                  <FaServer /> Platform Alerts
                </h3>
                <p className="dash-supporting-text mb-3">
                  Recent notable events from audit logs and AI telemetry. When
                  telemetry is incomplete, that is reflected in the labels
                  rather than being rendered as healthy-looking zeros.
                </p>
                {alerts.length === 0 ? (
                  <div className="dash-supporting-text">
                    <div style={{ fontWeight: 600, color: "var(--text-heading)" }}>
                      {overview?.alerts?.label || "No recent spikes detected"}
                    </div>
                    <div className="mt-2">
                      Generate a quiz, run AI grading, or open AI tutor, then refresh to confirm telemetry.
                    </div>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.85em" }}>
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Level</th>
                          <th>Type</th>
                          <th>School</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alerts.map((item, index) => (
                          <tr key={item.id || index}>
                            <td style={{ whiteSpace: "nowrap" }}>
                              {item.timestamp ? new Date(item.timestamp).toLocaleString() : "-"}
                            </td>
                            <td>
                              <span className={`badge ${sourceBadgeClass(item.level)}`}>{item.level || "-"}</span>
                            </td>
                            <td>{item.type || "-"}</td>
                            <td>{item.tenantId || "Platform"}</td>
                            <td>{item.message || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="row g-3">
            {links.map((item) => (
              <div key={item.to} className="col-md-6 col-xl-3">
                <div className="dash-card h-100">
                  <h3 className="dash-card-title mb-2 d-flex align-items-center gap-2">
                    <item.icon /> {item.title}
                  </h3>
                  <p className="dash-supporting-text mb-3">
                    {item.desc}
                  </p>
                  <Link className="btn btn-sm btn-outline-primary" to={item.to}>
                    {item.label}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
