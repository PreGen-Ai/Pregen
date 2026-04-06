// SuperAdmin dashboard — platform-level overview
import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../../../services/api/api.js";
import { Link } from "react-router-dom";
import {
  FaServer,
  FaUsers,
  FaRobot,
  FaMoneyBillWave,
  FaExclamationTriangle,
  FaHeartbeat,
  FaClock,
  FaSyncAlt,
  FaBolt,
} from "react-icons/fa";

const fmtInt = (v) => new Intl.NumberFormat().format(Number(v || 0));
const fmtMoney = (v) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v || 0));
const fmtMs = (v) => `${Math.round(Number(v || 0))} ms`;

function HealthBadge({ status }) {
  const s = String(status || "unknown").toLowerCase();
  const cls =
    s === "healthy" ? "bg-success" :
    s === "warning"  ? "bg-warning text-dark" :
    s === "degraded" ? "bg-danger" :
    "bg-secondary";
  return (
    <span className={`badge ${cls} d-inline-flex align-items-center gap-1`}>
      <FaHeartbeat />
      {s}
    </span>
  );
}

function StatCard({ title, value, sub, icon: Icon }) {
  return (
    <div className="dash-card py-3 h-100">
      <div className="d-flex align-items-start justify-content-between gap-2">
        <div>
          <div className="text-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {title}
          </div>
          <div style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--text-heading)", lineHeight: 1.2, marginTop: 4 }}>
            {value}
          </div>
          {sub && <div className="text-muted mt-1" style={{ fontSize: "0.72rem" }}>{sub}</div>}
        </div>
        {Icon && (
          <div className="text-muted" style={{ fontSize: "1.1rem", opacity: 0.45, flexShrink: 0 }}>
            <Icon />
          </div>
        )}
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
        <div className="mt-1" style={{ fontSize: "0.85em" }}>{message}</div>
      </div>
    </div>
  );
}

export default function SuperDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [spikes, setSpikes] = useState([]);
  const [error, setError] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await api.admin.superOverview();
      setOverview(data || null);
      setSpikes(Array.isArray(data?.spikes) ? data.spikes : []);
      setLastRefreshedAt(new Date());
    } catch (e) {
      setError(e?.message || "Unable to load platform overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await load(); })();
    return () => { alive = false; };
  }, [load]);

  const cards = useMemo(() => {
    const o = overview || {};
    return [
      { title: "Active Tenants",  value: fmtInt(o.activeTenants),     sub: "Not suspended",     icon: FaServer },
      { title: "Total Students",  value: fmtInt(o.totalStudents),      sub: "Across all tenants", icon: FaUsers },
      { title: "AI Calls (24h)",  value: fmtInt(o.aiCalls24h),         sub: "Last 24 hours",     icon: FaRobot },
      { title: "Cost Today",      value: `$${fmtMoney(o.costToday)}`,  sub: "Estimated today",   icon: FaMoneyBillWave },
      { title: "Cost MTD",        value: `$${fmtMoney(o.costMTD)}`,    sub: "Month to date",     icon: FaMoneyBillWave },
      { title: "P95 Latency",     value: fmtMs(o.p95LatencyMs),        sub: "AI response time",  icon: FaClock },
      { title: "Errors (24h)",    value: fmtInt(o.errorsToday),         sub: "Platform errors",   icon: FaBolt },
      { title: "Health",          value: <HealthBadge status={o.healthStatus} />, sub: "Platform status", icon: FaHeartbeat },
    ];
  }, [overview]);

  const links = useMemo(() => [
    {
      title: "Tenants",
      icon: FaUsers,
      desc: "Status, plan, headcounts, and AI usage signals.",
      to: "/dashboard/superadmin/tenants",
      label: "Open Tenants",
    },
    {
      title: "AI Cost",
      icon: FaRobot,
      desc: "Token usage and cost breakdown per tenant and feature.",
      to: "/dashboard/superadmin/ai-cost",
      label: "Open AI Cost",
    },
    {
      title: "Feature Flags",
      icon: FaMoneyBillWave,
      desc: "Safe rollouts, kill switches, and tenant-level toggles.",
      to: "/dashboard/superadmin/flags",
      label: "Open Flags",
    },
  ], []);

  return (
    <div className="quizzes-page">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h2>Platform Overview</h2>
          <p className="text-muted mb-0">
            Control plane: tenants, AI usage, cost, latency, and platform health.
          </p>
          {lastRefreshedAt && (
            <div className="text-muted mt-1" style={{ fontSize: "0.75rem" }}>
              Last refreshed: {lastRefreshedAt.toLocaleString()}
            </div>
          )}
        </div>
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

      <ErrorPanel message={error} />

      {loading ? (
        <div className="dash-card text-center text-muted py-5">Loading…</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="row g-3 mb-4">
            {cards.map((c) => (
              <div key={c.title} className="col-6 col-xl-3">
                <StatCard title={c.title} value={c.value} sub={c.sub} icon={c.icon} />
              </div>
            ))}
          </div>

          {/* Spikes / alerts */}
          <div className="dash-card mb-4">
            <h3 className="dash-card-title mb-1 d-flex align-items-center gap-2">
              <FaServer /> Usage Spikes &amp; Alerts
            </h3>
            <p className="text-muted mb-3" style={{ fontSize: "0.85em" }}>
              Recent notable events detected by the platform.
            </p>
            {spikes.length === 0 ? (
              <p className="text-muted mb-0" style={{ fontSize: "0.85em" }}>No spikes recorded.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.85em" }}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Level</th>
                      <th>Type</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spikes.map((s, idx) => (
                      <tr key={s.id || idx}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {s.timestamp ? new Date(s.timestamp).toLocaleString() : "—"}
                        </td>
                        <td>{s.level || "—"}</td>
                        <td>{s.type || "—"}</td>
                        <td>{s.message || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick-nav cards */}
          <div className="row g-3">
            {links.map((x) => (
              <div key={x.to} className="col-md-4">
                <div className="dash-card h-100">
                  <h3 className="dash-card-title mb-2 d-flex align-items-center gap-2">
                    <x.icon /> {x.title}
                  </h3>
                  <p className="text-muted mb-3" style={{ fontSize: "0.85em" }}>{x.desc}</p>
                  <Link className="btn btn-sm btn-outline-primary" to={x.to}>
                    {x.label}
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
