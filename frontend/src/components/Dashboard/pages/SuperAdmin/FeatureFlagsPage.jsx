import React, { useEffect, useMemo, useState } from "react";
import { FaExclamationTriangle, FaSyncAlt } from "react-icons/fa";

import api from "../../../../services/api/api.js";
import EmptyState from "../../components/ui/EmptyState.jsx";

const Pill = ({ children, tone = "neutral" }) => {
  const cls =
    tone === "success"
      ? "bg-success-subtle text-success"
      : tone === "warning"
        ? "bg-warning-subtle text-warning-emphasis"
        : tone === "danger"
          ? "bg-danger-subtle text-danger"
          : "bg-secondary-subtle text-secondary-emphasis";

  return <span className={`badge ${cls}`}>{children}</span>;
};

const Toggle = ({ checked }) => (
  <button type="button" disabled aria-disabled="true" className={`btn btn-sm ${checked ? "btn-success" : "btn-outline-secondary"}`}>
    {checked ? "Enabled" : "Disabled"}
  </button>
);

function ErrorPanel({ message }) {
  if (!message) return null;
  return (
    <div className="alert alert-danger">
      <div className="fw-semibold d-flex align-items-center gap-2">
        <FaExclamationTriangle /> {message}
      </div>
      <div className="small mt-2">
        Expected endpoint: <code>/api/admin/system/super/feature-flags</code>
      </div>
    </div>
  );
}

export default function FeatureFlagsPage() {
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("all");
  const [sortKey, setSortKey] = useState("updatedAt");
  const [sortDir, setSortDir] = useState("desc");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await api.admin.listFeatureFlags();
      setPayload(response || null);
    } catch (loadError) {
      setError(loadError?.message || "Unable to load feature flags.");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, []);

  const flags = Array.isArray(payload?.items) ? payload.items : [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return flags.filter((flag) => {
      const matchesScope = scope === "all" || String(flag.scope || "").toLowerCase() === scope;
      const matchesQuery =
        !needle ||
        String(flag.key || "").toLowerCase().includes(needle) ||
        String(flag.description || "").toLowerCase().includes(needle);
      return matchesScope && matchesQuery;
    });
  }, [flags, q, scope]);

  const sorted = useMemo(() => {
    const multiplier = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "overrides") {
        return ((a.tenantOverridesCount || 0) - (b.tenantOverridesCount || 0)) * multiplier;
      }
      if (sortKey === "updatedAt") {
        const aDate = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bDate = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return (aDate - bDate) * multiplier;
      }
      return String(a.key || "").localeCompare(String(b.key || "")) * multiplier;
    });
  }, [filtered, sortDir, sortKey]);

  const stats = useMemo(() => {
    let globalCount = 0;
    let tenantCount = 0;
    let enabledDefaults = 0;

    for (const flag of flags) {
      if (flag.scope === "global") globalCount += 1;
      if (flag.scope === "tenant") tenantCount += 1;
      if (flag.defaultEnabled) enabledDefaults += 1;
    }

    return { globalCount, tenantCount, enabledDefaults };
  }, [flags]);

  const onSort = (key) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("desc");
      return;
    }
    setSortDir((current) => (current === "desc" ? "asc" : "desc"));
  };

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h2>Feature Flags</h2>
          <p className="text-muted mb-0">Read-only rollout visibility for platform and tenant flags.</p>
          <div className="d-flex flex-wrap gap-2 mt-2">
            <Pill>{stats.globalCount} global</Pill>
            <Pill>{stats.tenantCount} tenant</Pill>
            <Pill>{stats.enabledDefaults} default enabled</Pill>
          </div>
        </div>

        <button type="button" onClick={load} className="btn btn-outline-secondary d-inline-flex align-items-center gap-2" disabled={loading}>
          <FaSyncAlt />
          Refresh
        </button>
      </div>

      <div className="dash-card">
        <div className="alert alert-secondary mb-3">
          <div className="fw-semibold">Read-only mode</div>
          <div className="small mt-1">
            Backend list support is available. Update and rollout endpoints are not wired yet, so this page intentionally avoids implying live mutations.
          </div>
        </div>

        <div className="row g-3 align-items-end mb-3">
          <div className="col-md-5">
            <label className="form-label mb-1">Search</label>
            <input value={q} onChange={(event) => setQ(event.target.value)} className="form-control" placeholder="Search by key or description" />
          </div>
          <div className="col-md-3">
            <label className="form-label mb-1">Scope</label>
            <select value={scope} onChange={(event) => setScope(event.target.value)} className="form-select">
              <option value="all">All scopes</option>
              <option value="global">Global</option>
              <option value="tenant">Tenant</option>
            </select>
          </div>
          <div className="col-md-4 d-flex justify-content-md-end gap-2">
            <Pill>{sorted.length} shown</Pill>
            <Pill>{flags.length} total</Pill>
          </div>
        </div>

        <ErrorPanel message={error} />

        {loading ? (
          <div className="text-muted">Loading...</div>
        ) : sorted.length === 0 ? (
          <EmptyState
            title={payload?.label || "No feature flags have been created yet"}
            message="Create flags in the backend first, then return here for read-only visibility across global and tenant scope."
            action="Refresh"
            onAction={load}
          />
        ) : (
          <div className="table-responsive">
            <table className="table align-middle mb-0">
              <thead>
                <tr>
                  <th className="cursor-pointer" onClick={() => onSort("key")}>
                    Key {sortKey === "key" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                  </th>
                  <th>Description</th>
                  <th>Default</th>
                  <th className="text-end cursor-pointer" onClick={() => onSort("overrides")}>
                    Overrides {sortKey === "overrides" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                  </th>
                  <th>Scope</th>
                  <th className="cursor-pointer" onClick={() => onSort("updatedAt")}>
                    Updated {sortKey === "updatedAt" ? (sortDir === "desc" ? "↓" : "↑") : ""}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((flag) => (
                  <tr key={flag.key}>
                    <td>
                      <div className="fw-semibold">{flag.key}</div>
                    </td>
                    <td>{flag.description || "-"}</td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <Toggle checked={!!flag.defaultEnabled} />
                        <Pill tone={flag.defaultEnabled ? "success" : "danger"}>
                          {flag.defaultEnabled ? "enabled" : "disabled"}
                        </Pill>
                      </div>
                    </td>
                    <td className="text-end">{flag.tenantOverridesCount ?? 0}</td>
                    <td>
                      <Pill tone={flag.scope === "tenant" ? "warning" : "neutral"}>{flag.scope || "-"}</Pill>
                    </td>
                    <td>{flag.updatedAt ? new Date(flag.updatedAt).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
