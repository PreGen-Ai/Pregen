import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FaCopy,
  FaExclamationTriangle,
  FaRobot,
  FaSearch,
  FaShieldAlt,
  FaSyncAlt,
} from "react-icons/fa";

import api from "../../../../services/api/api.js";
import EmptyState from "../../components/ui/EmptyState.jsx";
import { collectionItems, sourceBadgeClass } from "../../../../utils/analyticsState.js";

function safeJson(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text));
  } catch {
    // Ignore clipboard failures.
  }
}

function ErrorPanel({ message }) {
  if (!message) return null;
  return (
    <div className="alert alert-danger d-flex align-items-start gap-2 mb-3">
      <FaExclamationTriangle className="flex-shrink-0 mt-1" />
      <div>
        <div className="fw-semibold">Unable to load audit data</div>
        <div className="dash-supporting-text mt-1">{message}</div>
      </div>
    </div>
  );
}

function DetailsModal({ open, onClose, title, data }) {
  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1060 }}>
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          border: "none",
          cursor: "pointer",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(95vw, 820px)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid rgba(148, 163, 184, 0.24)",
          background: "linear-gradient(180deg, rgba(16, 28, 44, 0.98), rgba(9, 18, 31, 0.98))",
          boxShadow: "0 26px 70px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div
          className="d-flex align-items-center justify-content-between gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.18)" }}
        >
          <div>
            <div className="dash-card-title">{title}</div>
            <div className="dash-supporting-text mt-1">
              Structured payload for operational review and escalation.
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="p-4" style={{ overflowY: "auto" }}>
          <pre
            style={{
              margin: 0,
              padding: 14,
              borderRadius: 14,
              border: "1px solid rgba(148, 163, 184, 0.18)",
              background: "rgba(6, 14, 25, 0.8)",
              color: "#f3f8ff",
              fontSize: "0.79rem",
              lineHeight: 1.55,
              overflow: "auto",
            }}
          >
            {safeJson(data)}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function AuditLogsPage() {
  const [tab, setTab] = useState("system");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  const [q, setQ] = useState("");
  const [level, setLevel] = useState("all");
  const [aiStatus, setAiStatus] = useState("all");
  const [tenantId, setTenantId] = useState("");
  const [page, setPage] = useState(1);
  const limit = 100;

  const [systemPayload, setSystemPayload] = useState(null);
  const [aiPayload, setAiPayload] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      if (tab === "system") {
        const payload = await api.admin.listAuditLogs({ limit });
        setSystemPayload(payload || null);
      } else {
        const payload = await api.admin.listAiRequests({
          limit,
          skip: (page - 1) * limit,
          tenantId: tenantId || undefined,
          q: q.trim() || undefined,
          status: aiStatus === "all" ? undefined : aiStatus,
        });
        setAiPayload(payload || null);
      }
    } catch (loadError) {
      setError(loadError?.message || "Unable to load logs.");
    } finally {
      setLoading(false);
    }
  }, [aiStatus, limit, page, q, tab, tenantId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, aiStatus, q, tenantId]);

  const systemRows = useMemo(
    () =>
      collectionItems(systemPayload).map((item) => ({
        id: item.id || item._id,
        timestamp: item.timestamp || item.createdAt,
        level: item.level || "info",
        type: item.type || "event",
        tenantId: item.tenantId || "Platform",
        actor: item.actor || "system",
        message: item.message || "-",
        raw: item,
      })),
    [systemPayload],
  );

  const aiRows = useMemo(
    () =>
      collectionItems(aiPayload).map((item) => ({
        id: item.requestId || `${item.provider}-${item.updatedAt}`,
        timestamp: item.updatedAt || item.createdAt,
        level: item.status === "error" ? "error" : "info",
        type: item.feature || item.endpoint || "ai_request",
        tenantId: item.tenantName || item.tenantId || "Unattributed",
        actor: item.provider || "ai",
        message:
          item.status === "error"
            ? `AI request failed for ${item.feature || item.endpoint || "unknown feature"}`
            : `${item.feature || item.endpoint || "AI request"}${item.latencyMs ? ` | ${Math.round(item.latencyMs)} ms` : ""}`,
        raw: item,
      })),
    [aiPayload],
  );

  const filteredSystemRows = useMemo(() => {
    const search = q.trim().toLowerCase();
    return systemRows.filter((row) => {
      const levelMatches = level === "all" || String(row.level).toLowerCase() === level;
      const tenantMatches = !tenantId || String(row.tenantId || "").toLowerCase().includes(tenantId.toLowerCase());
      const haystack = `${row.type} ${row.message} ${row.actor} ${row.tenantId}`.toLowerCase();
      const searchMatches = !search || haystack.includes(search);
      return levelMatches && tenantMatches && searchMatches;
    });
  }, [level, q, systemRows, tenantId]);

  const rows = tab === "system" ? filteredSystemRows : aiRows;
  const currentLabel = tab === "system" ? systemPayload?.label : aiPayload?.label;
  const currentTotal = tab === "system" ? filteredSystemRows.length : Number(aiPayload?.meta?.total || 0);
  const canGoNext = tab === "ai" ? page * limit < Number(aiPayload?.meta?.total || 0) : false;

  return (
    <div className="quizzes-page">
      <div className="dash-page-header">
        <div>
          <div className="dash-page-kicker">Observability</div>
          <h2 className="dash-page-title">Audit Logs</h2>
          <p className="dash-page-subtitle">
            Review platform audit events and AI request telemetry without mixing them into
            analytics summaries. Missing telemetry is labeled clearly so no-data states are
            not mistaken for quiet or healthy systems.
          </p>
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

      <div className="dash-card mb-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
          <div className="btn-group" role="group" aria-label="Audit views">
            <button
              type="button"
              className={`btn btn-sm ${tab === "system" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setTab("system")}
            >
              System audit events
            </button>
            <button
              type="button"
              className={`btn btn-sm ${tab === "ai" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setTab("ai")}
            >
              AI request telemetry
            </button>
          </div>

          <div className="dash-supporting-text">
            {currentLabel || "Recent platform events"}
            {tab === "ai" ? ` | ${currentTotal} total records` : ""}
          </div>
        </div>

        <div className="dash-inline-note mb-3">
          Use system audit events for operational review and compliance traces. Use AI request
          telemetry to inspect provider behavior, latency, and errors without treating missing
          logs as real zero activity.
        </div>

        <div className="row g-2">
          <div className="col-12 col-md-5">
            <div className="input-group input-group-sm">
              <span className="input-group-text">
                <FaSearch />
              </span>
              <input
                className="form-control"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder={
                  tab === "system"
                    ? "Search by school, actor, event type, or message"
                    : "Search request, feature, provider, model, or school"
                }
              />
            </div>
          </div>
          <div className="col-12 col-md-3">
            <input
              className="form-control form-control-sm"
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              placeholder="Filter by school"
            />
          </div>
          <div className="col-6 col-md-2">
            {tab === "system" ? (
              <select className="form-select form-select-sm" value={level} onChange={(event) => setLevel(event.target.value)}>
                <option value="all">All levels</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
                <option value="security">Security</option>
              </select>
            ) : (
              <select className="form-select form-select-sm" value={aiStatus} onChange={(event) => setAiStatus(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="ok">Success</option>
                <option value="error">Error</option>
              </select>
            )}
          </div>
          {tab === "ai" ? (
            <div className="col-6 col-md-2 d-flex gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary flex-fill"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={loading || page <= 1}
              >
                Prev
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary flex-fill"
                onClick={() => setPage((current) => current + 1)}
                disabled={loading || !canGoNext}
              >
                Next
              </button>
            </div>
          ) : null}
        </div>

        <ErrorPanel message={error} />
      </div>

      <div className="dash-card">
        {loading ? (
          <div className="dash-supporting-text py-4 text-center">Loading audit data...</div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={tab === "system" ? <FaShieldAlt /> : <FaRobot />}
            title={currentLabel || "No logs found"}
            message={
              tab === "system"
                ? "Audit logging has not recorded matching events yet."
                : "Generate a quiz, run AI grading, or open AI tutor, then refresh after activity."
            }
            action="Refresh"
            onAction={load}
          />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th style={{ whiteSpace: "nowrap" }}>Time</th>
                  <th>Level</th>
                  <th>Type</th>
                  <th>School</th>
                  <th>Actor</th>
                  <th>Message</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id || index}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {row.timestamp ? new Date(row.timestamp).toLocaleString() : "-"}
                    </td>
                    <td>
                      <span className={`badge ${sourceBadgeClass(row.level)}`}>{row.level || "-"}</span>
                    </td>
                    <td>{row.type || "-"}</td>
                    <td>{row.tenantId || "-"}</td>
                    <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.actor || "-"}
                    </td>
                    <td style={{ maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.message || "-"}
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setSelected(row)}>
                          View
                        </button>
                        {tab === "ai" && row.raw?.requestId ? (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
                            onClick={() => copyText(row.raw.requestId)}
                            title="Copy request ID"
                          >
                            <FaCopy />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DetailsModal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${tab === "system" ? "System audit event" : "AI request"} details` : "Details"}
        data={selected?.raw || selected}
      />
    </div>
  );
}
