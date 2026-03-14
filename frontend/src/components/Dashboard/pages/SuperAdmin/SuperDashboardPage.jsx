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
    s === "healthy"
      ? "bg-green-100 text-green-800 border-green-200"
      : s === "warning"
        ? "bg-yellow-100 text-yellow-800 border-yellow-200"
        : s === "degraded"
          ? "bg-red-100 text-red-800 border-red-200"
          : "bg-gray-100 text-gray-800 border-gray-200";

  return (
    <span
      className={`inline-flex items-center gap-2 px-2 py-1 rounded-full border text-xs ${cls}`}
    >
      <FaHeartbeat />
      {s}
    </span>
  );
}

function StatCard({ title, value, sub, icon: Icon }) {
  return (
    <div className="p-4 rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider opacity-70">
            {title}
          </div>
          <div className="text-2xl font-extrabold mt-1">{value}</div>
          {sub ? <div className="text-xs opacity-70 mt-1">{sub}</div> : null}
        </div>
        {Icon ? (
          <div className="opacity-60 text-xl">
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
    <div className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-700">
      <div className="font-semibold flex items-center gap-2">
        <FaExclamationTriangle /> Error
      </div>
      <div className="text-sm mt-1">{message}</div>
      <div className="text-xs opacity-80 mt-2">
        Expected endpoint: <code>/api/admin/system/super/overview</code>
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

      // ✅ Correct backend mount: /api/admin/system/super/overview
      const data = await api.admin.superOverview();
      
      setOverview(data || null);
      setSpikes(Array.isArray(data?.spikes) ? data.spikes : []);
      setLastRefreshedAt(new Date());
    } catch (e) {
      setError(e?.message || "Unable to load super admin overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const cards = useMemo(() => {
    const o = overview || {};
    return [
      {
        title: "Active Tenants",
        value: fmtInt(o.activeTenants),
        sub: "Tenants not suspended",
        icon: FaServer,
      },
      {
        title: "Total Students",
        value: fmtInt(o.totalStudents),
        sub: "Across all tenants",
        icon: FaUsers,
      },
      {
        title: "AI Calls (24h)",
        value: fmtInt(o.aiCalls24h),
        sub: "Usage in last 24 hours",
        icon: FaRobot,
      },
      {
        title: "Cost Today",
        value: fmtMoney(o.costToday),
        sub: "Estimated cost",
        icon: FaMoneyBillWave,
      },
      {
        title: "Cost MTD",
        value: fmtMoney(o.costMTD),
        sub: "Month to date",
        icon: FaMoneyBillWave,
      },
      {
        title: "P95 Latency",
        value: fmtMs(o.p95LatencyMs),
        sub: "AI / backend latency",
        icon: FaClock,
      },
      {
        title: "Errors (24h)",
        value: fmtInt(o.errorsToday),
        sub: "Error + security logs",
        icon: FaBolt,
      },
      {
        title: "Health",
        value: <HealthBadge status={o.healthStatus} />,
        sub: "Aggregate status",
        icon: FaHeartbeat,
      },
    ];
  }, [overview]);

  // Adjust these to match your routing
  const links = useMemo(
    () => [
      {
        title: "Next: Tenants",
        icon: FaUsers,
        desc: "View tenants, suspend, set limits, drill down into usage.",
        to: "/dashboard/superadmin/tenants",
        label: "Open Tenants",
      },
      {
        title: "Next: AI Cost Control",
        icon: FaRobot,
        desc: "Token usage and cost per tenant and per feature.",
        to: "/dashboard/superadmin/ai-cost",
        label: "Open AI Cost",
      },
      {
        title: "Next: Feature Flags",
        icon: FaMoneyBillWave,
        desc: "Safe rollouts, kill switches, tenant-based toggles.",
        to: "/dashboard/superadmin/feature-flags",
        label: "Open Feature Flags",
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Super Admin Dashboard</h1>
          <p className="opacity-80 text-sm">
            Control plane overview: tenants, AI usage, cost, latency, errors.
          </p>
          {lastRefreshedAt ? (
            <div className="text-xs opacity-70 mt-1">
              Last refreshed: {lastRefreshedAt.toLocaleString()}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-950"
          disabled={loading}
        >
          <FaSyncAlt />
          Refresh
        </button>
      </div>

      <ErrorPanel message={error} />

      {loading ? (
        <div className="opacity-70">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {cards.map((c) => (
              <StatCard
                key={c.title}
                title={c.title}
                value={c.value}
                sub={c.sub}
                icon={c.icon}
              />
            ))}
          </div>

          <div className="p-4 rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800">
            <div className="font-bold flex items-center gap-2">
              <FaServer /> Usage Spikes / Alerts
            </div>
            <div className="text-sm opacity-80 mt-1">
              Recent notable events detected by the platform.
            </div>

            {spikes.length === 0 ? (
              <div className="text-sm opacity-70 mt-3">No spikes recorded.</div>
            ) : (
              <div className="mt-3 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="opacity-70">
                    <tr>
                      <th className="text-left p-2">Time</th>
                      <th className="text-left p-2">Level</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spikes.map((s, idx) => (
                      <tr
                        key={s.id || idx}
                        className="border-t dark:border-gray-800"
                      >
                        <td className="p-2">
                          {s.timestamp
                            ? new Date(s.timestamp).toLocaleString()
                            : "-"}
                        </td>
                        <td className="p-2">{s.level || "-"}</td>
                        <td className="p-2">{s.type || "-"}</td>
                        <td className="p-2">{s.message || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {links.map((x) => (
              <div
                key={x.to}
                className="p-4 rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800"
              >
                <div className="font-bold flex items-center gap-2">
                  <x.icon /> {x.title}
                </div>
                <div className="text-sm opacity-80 mt-1">{x.desc}</div>
                <Link
                  className="inline-block mt-3 text-sm font-semibold underline"
                  to={x.to}
                >
                  {x.label}
                </Link>
              </div>
            ))}
          </div>

          <div className="text-xs opacity-70">
            If you still see 401 errors, open DevTools and confirm the request
            includes <code>Authorization: Bearer ...</code> or a valid session
            cookie.
          </div>
        </>
      )}
    </div>
  );
}
