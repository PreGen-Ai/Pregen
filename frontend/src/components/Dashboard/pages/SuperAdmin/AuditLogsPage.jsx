// Platform Analytics — system logs + AI usage logs (superadmin)
import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../../../services/api/api.js";
import {
  FaExclamationTriangle,
  FaSyncAlt,
  FaSearch,
  FaCopy,
} from "react-icons/fa";

const fmtInt = (v) => new Intl.NumberFormat().format(Number(v || 0));
const fmtMoney = (v) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v || 0));

function levelBadgeCls(level) {
  const lv = String(level || "").toLowerCase();
  if (lv === "error" || lv === "security") return "badge bg-danger";
  if (lv === "warn" || lv === "warning") return "badge bg-warning text-dark";
  if (lv === "ok" || lv === "info") return "badge bg-secondary";
  return "badge bg-secondary";
}

function safeJson(obj) {
  try { return JSON.stringify(obj, null, 2); }
  catch { return String(obj); }
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(String(text)); }
  catch { /* ignore */ }
}

function ErrorPanel({ message }) {
  if (!message) return null;
  return (
    <div className="alert alert-danger d-flex align-items-start gap-2 mb-3">
      <FaExclamationTriangle className="flex-shrink-0 mt-1" />
      <div>
        <div className="fw-semibold">Unable to load logs</div>
        <div className="mt-1" style={{ fontSize: "0.85em" }}>{message}</div>
      </div>
    </div>
  );
}

function DetailsModal({ open, onClose, title, data, footer }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1060 }}>
      {/* backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          border: "none",
          cursor: "pointer",
        }}
      />
      {/* dialog */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          width: "min(95vw, 780px)",
          borderRadius: 12,
          border: "1px solid var(--border-color, #374151)",
          background: "var(--card-bg, #1e293b)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          overflow: "hidden",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* header */}
        <div
          className="d-flex align-items-center justify-content-between gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border-color, #374151)", flexShrink: 0 }}
        >
          <div className="fw-bold" style={{ fontSize: "1rem" }}>{title}</div>
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {/* body */}
        <div className="p-4" style={{ overflowY: "auto" }}>
          <pre
            style={{
              fontSize: "0.78rem",
              overflow: "auto",
              maxHeight: "50vh",
              borderRadius: 8,
              border: "1px solid var(--border-color, #374151)",
              background: "rgba(0,0,0,0.2)",
              padding: "12px",
              margin: 0,
              color: "var(--text-body)",
            }}
          >
            {safeJson(data)}
          </pre>
          {footer && <div className="mt-3">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export default function AuditLogsPage() {
  const [tab, setTab] = useState("system"); // system | ai
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  // Filters
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("all");
  const [aiStatus, setAiStatus] = useState("all");
  const [tenantId, setTenantId] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 200;

  // Data
  const [systemLogs, setSystemLogs] = useState([]);
  const [aiUsage, setAiUsage] = useState([]);
  const [aiMeta, setAiMeta] = useState({ page: 1, pages: 1, total: 0 });

  const loadSystem = useCallback(async () => {
    const data = await api.admin.listAuditLogs({ limit });
    return Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  }, []);

  const loadAiUsage = useCallback(async () => {
    const payload = await api.ai.listUsage({
      page,
      limit,
      sortBy: "timestamp",
      sortDir: "desc",
    });
    return {
      items: Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [],
      meta: {
        page: payload?.page || page,
        pages: payload?.pages || 1,
        total: payload?.total || 0,
      },
    };
  }, [page]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      if (tab === "system") {
        const rows = await loadSystem();
        setSystemLogs(rows);
      } else {
        const out = await loadAiUsage();
        setAiUsage(out.items);
        setAiMeta(out.meta);
      }
    } catch (e) {
      setError(e?.message || "Unable to load logs.");
    } finally {
      setLoading(false);
    }
  }, [tab, loadSystem, loadAiUsage]);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await load(); })();
    return () => { alive = false; };
  }, [load]);

  useEffect(() => { setPage(1); }, [tab, aiStatus]);

  const normalizedSystem = useMemo(() =>
    systemLogs.map((l) => ({
      id: l.id || l._id,
      timestamp: l.timestamp,
      level: l.level || "info",
      type: l.type || "event",
      tenantId: l.tenantId || "—",
      actor: l.actor || "—",
      message: l.message || "—",
      meta: l.meta || {},
      raw: l,
    })), [systemLogs]);

  const normalizedAi = useMemo(() =>
    aiUsage.map((l) => {
      const status = String(l.status || "").toLowerCase();
      const lv = status === "error" ? "error" : "info";
      const type = l.feature || l.endpoint || l.provider || "ai";
      const actor = typeof l.userId === "string" ? l.userId : l.userId?._id || l.userId?.id || "—";
      const msg = (() => {
        if (status === "error") {
          const em = l?.error?.message || "AI request failed";
          const code = l?.error?.code ? ` (${l.error.code})` : "";
          return `${em}${code}`;
        }
        const parts = [];
        if (l.endpoint) parts.push(l.endpoint);
        if (l.requestId) parts.push(`req:${l.requestId}`);
        if (typeof l.latencyMs === "number") parts.push(`${l.latencyMs}ms`);
        return parts.length ? parts.join(" · ") : "AI request";
      })();
      return {
        id: l._id,
        timestamp: l.timestamp || l.createdAt,
        level: lv,
        type,
        tenantId: l.tenantId || "—",
        actor,
        message: msg,
        meta: {
          provider: l.provider,
          model: l.model,
          requestId: l.requestId,
          sessionId: l.sessionId,
          feature: l.feature,
          endpoint: l.endpoint,
          inputTokens: l.inputTokens,
          outputTokens: l.outputTokens,
          totalTokens: l.totalTokens,
          totalCost: l.totalCost,
          currency: l.currency,
          latencyMs: l.latencyMs,
          status: l.status,
          success: l.success,
        },
        raw: l,
      };
    }), [aiUsage]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const lv = String(level || "all").toLowerCase();
    const st = String(aiStatus || "all").toLowerCase();
    const tenantNeedle = tenantId.trim().toLowerCase();
    const rows = tab === "system" ? normalizedSystem : normalizedAi;

    return rows.filter((r) => {
      const rowLevel = String(r.level || "").toLowerCase();
      const okLevel  = tab === "system" ? (lv === "all" || rowLevel === lv) : true;
      const okStatus = tab === "ai" ? (st === "all" || String(r.raw?.status || "").toLowerCase() === st) : true;
      const okTenant = !tenantNeedle || String(r.tenantId || "").toLowerCase().includes(tenantNeedle);
      const hay = `${r.type || ""} ${r.message || ""} ${r.actor || ""} ${r.tenantId || ""}`.toLowerCase();
      const okQuery = !needle || hay.includes(needle);
      return okLevel && okStatus && okTenant && okQuery;
    });
  }, [tab, normalizedSystem, normalizedAi, q, level, aiStatus, tenantId]);

  const modalFooter = useMemo(() => {
    if (tab !== "ai" || !selected) return null;
    const m = selected?.meta || {};
    return (
      <div className="row g-2 mt-1">
        {[
          { label: "Tokens",   value: fmtInt(m.totalTokens) },
          { label: "Cost",     value: `${fmtMoney(m.totalCost)} ${m.currency || ""}`.trim() },
          { label: "Provider", value: m.provider || "—" },
          { label: "Model",    value: m.model || "—" },
        ].map(({ label, value }) => (
          <div key={label} className="col-6 col-md-3">
            <div className="dash-card py-2 px-3">
              <div className="text-muted" style={{ fontSize: "0.72rem" }}>{label}</div>
              <div className="fw-semibold" style={{ fontSize: "0.9rem" }}>{value}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }, [tab, selected]);

  return (
    <div className="quizzes-page">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h2>Platform Analytics</h2>
          <p className="text-muted mb-0">
            System events and AI usage logs across all tenants.
          </p>
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

      {/* Filters card */}
      <div className="dash-card mb-4">
        {/* Tab row */}
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
          <div className="d-flex gap-2">
            <button
              type="button"
              className={`btn btn-sm ${tab === "system" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setTab("system")}
            >
              System logs
            </button>
            <button
              type="button"
              className={`btn btn-sm ${tab === "ai" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setTab("ai")}
            >
              AI usage
            </button>
          </div>
          <div className="text-muted" style={{ fontSize: "0.8rem" }}>
            {tab === "ai"
              ? `Page ${aiMeta.page} of ${aiMeta.pages} · ${fmtInt(aiMeta.total)} total`
              : `${fmtInt(filtered.length)} results`}
          </div>
        </div>

        {/* Filter inputs */}
        <div className="row g-2">
          <div className="col-12 col-md-5">
            <div className="input-group input-group-sm">
              <span className="input-group-text"><FaSearch /></span>
              <input
                className="form-control"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by tenant, actor, type, message…"
              />
            </div>
          </div>
          <div className="col-12 col-md-3">
            <input
              className="form-control form-control-sm"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="Filter by tenant…"
            />
          </div>
          <div className="col-6 col-md-2">
            {tab === "system" ? (
              <select
                className="form-select form-select-sm"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                <option value="all">All levels</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
                <option value="security">Security</option>
              </select>
            ) : (
              <select
                className="form-select form-select-sm"
                value={aiStatus}
                onChange={(e) => setAiStatus(e.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="ok">Success</option>
                <option value="error">Error</option>
              </select>
            )}
          </div>
          {tab === "ai" && (
            <div className="col-6 col-md-2 d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary flex-fill"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={loading || page <= 1}
              >
                Prev
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary flex-fill"
                onClick={() => setPage((p) => p + 1)}
                disabled={loading || page >= aiMeta.pages}
              >
                Next
              </button>
            </div>
          )}
        </div>

        <ErrorPanel message={error} />
      </div>

      {/* Log table */}
      <div className="dash-card">
        {loading ? (
          <div className="text-muted py-4 text-center">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-muted py-4 text-center">No logs found.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.83em" }}>
              <thead>
                <tr>
                  <th style={{ whiteSpace: "nowrap" }}>Time</th>
                  <th>Level</th>
                  <th>Type</th>
                  <th>Tenant</th>
                  <th>Actor</th>
                  <th>Message</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={r.id || idx}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.timestamp ? new Date(r.timestamp).toLocaleString() : "—"}
                    </td>
                    <td>
                      <span className={levelBadgeCls(r.level)}>{r.level || "—"}</span>
                    </td>
                    <td>{r.type || "—"}</td>
                    <td>{r.tenantId || "—"}</td>
                    <td style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.actor || "—"}
                    </td>
                    <td style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.message || "—"}
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setSelected(r)}
                        >
                          View
                        </button>
                        {tab === "ai" && r?.meta?.requestId && (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                            onClick={() => copyText(r.meta.requestId)}
                            title="Copy request ID"
                          >
                            <FaCopy />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details modal */}
      <DetailsModal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${tab === "system" ? "System log" : "AI usage"} — details` : "Details"}
        data={selected?.raw || selected}
        footer={modalFooter}
      />
    </div>
  );
}
