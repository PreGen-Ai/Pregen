// src/pages/superadmin/AuditLogsPage.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../../../services/api/api.js";
import {
  FaExclamationTriangle,
  FaSyncAlt,
  FaSearch,
  FaCopy,
} from "react-icons/fa";

const Pill = ({ children, tone = "neutral" }) => {
  const cls =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/40 dark:bg-green-950/40 dark:text-green-200"
      : tone === "warning"
        ? "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-950/40 dark:text-yellow-200"
        : tone === "danger"
          ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
          : "border-gray-200 bg-white text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100";

  return (
    <span className={`px-2 py-1 rounded-full text-xs border ${cls}`}>
      {children}
    </span>
  );
};

const fmtInt = (v) => new Intl.NumberFormat().format(Number(v || 0));
const fmtMoney = (v) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v || 0));

function toneFromLevel(level) {
  const lv = String(level || "").toLowerCase();
  if (lv === "error") return "danger";
  if (lv === "security") return "danger";
  if (lv === "warn" || lv === "warning") return "warning";
  if (lv === "ok" || lv === "info") return "neutral";
  return "neutral";
}

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
    // ignore
  }
}

function ErrorPanel({ message, hint }) {
  if (!message) return null;
  return (
    <div className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-700">
      <div className="font-semibold flex items-center gap-2">
        <FaExclamationTriangle /> {message}
      </div>
      {hint ? <div className="text-xs opacity-80 mt-2">{hint}</div> : null}
      <div className="text-xs opacity-80 mt-1">
        If this is 401, confirm the request includes{" "}
        <code>Authorization: Bearer ...</code>.
      </div>
    </div>
  );
}

function DetailsModal({ open, onClose, title, data, footer }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="absolute left-1/2 top-1/2 w-[95vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 shadow-xl">
        <div className="p-4 border-b dark:border-gray-800 flex items-start justify-between gap-3">
          <div>
            <div className="font-extrabold text-lg">{title}</div>
            <div className="text-xs opacity-70 mt-1">
              Sanitize logs. Avoid raw prompts and PII.
            </div>
          </div>
          <button
            type="button"
            className="px-3 py-2 rounded-lg border dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-950"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="p-4">
          <pre className="text-xs overflow-auto max-h-[60vh] rounded-lg border dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-3">
            {safeJson(data)}
          </pre>
          {footer ? <div className="mt-3">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

export default function AuditLogsPage() {
  // Tabs
  const [tab, setTab] = useState("system"); // system | ai

  // Shared UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal
  const [selected, setSelected] = useState(null);

  // Filters
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("all"); // system: all|info|warn|error|security
  const [aiStatus, setAiStatus] = useState("all"); // ai: all|ok|error
  const [tenantId, setTenantId] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 200;

  // Data
  const [systemLogs, setSystemLogs] = useState([]);
  const [aiUsage, setAiUsage] = useState([]);
  const [aiMeta, setAiMeta] = useState({ page: 1, pages: 1, total: 0 });

  const loadSystem = useCallback(async () => {
    // GET /api/admin/system/super/logs?limit=200
    const data = await api.admin.listAuditLogs({ limit });

    const items = Array.isArray(data)
      ? data
      : Array.isArray(data?.items)
        ? data.items
        : [];
    return items;
  }, []);

  const loadAiUsage = useCallback(async () => {
    // GET /api/ai-usage?page=1&limit=200&sortBy=timestamp&sortDir=desc
    const payload = await api.ai.listUsage({
      page,
      limit,
      sortBy: "timestamp",
      sortDir: "desc",
    });

    return {
      items: Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload)
          ? payload
          : [],
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
    (async () => {
      if (!alive) return;
      await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  // reset paging when switching tabs or key filters
  useEffect(() => {
    setPage(1);
  }, [tab, aiStatus]);

  // ---------- Normalize + Filter ----------

  const normalizedSystem = useMemo(() => {
    return systemLogs.map((l) => ({
      id: l.id || l._id,
      timestamp: l.timestamp,
      level: l.level || "info",
      type: l.type || "event",
      tenantId: l.tenantId || "-",
      actor: l.actor || "-",
      message: l.message || "-",
      meta: l.meta || {},
      raw: l,
    }));
  }, [systemLogs]);

  const normalizedAi = useMemo(() => {
    return aiUsage.map((l) => {
      const status = String(l.status || "").toLowerCase();
      const lv = status === "error" ? "error" : "info";
      const type = l.feature || l.endpoint || l.provider || "ai";

      const actor =
        typeof l.userId === "string"
          ? l.userId
          : l.userId?._id || l.userId?.id || "-";

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
        return parts.length ? parts.join(" • ") : "AI request";
      })();

      return {
        id: l._id,
        timestamp: l.timestamp || l.createdAt,
        level: lv,
        type,
        tenantId: l.tenantId || "-",
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
    });
  }, [aiUsage]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const lv = String(level || "all").toLowerCase();
    const st = String(aiStatus || "all").toLowerCase();
    const tenantNeedle = tenantId.trim().toLowerCase();

    const rows = tab === "system" ? normalizedSystem : normalizedAi;

    return rows.filter((r) => {
      const rowLevel = String(r.level || "").toLowerCase();

      const okLevel =
        tab === "system" ? (lv === "all" ? true : rowLevel === lv) : true;

      const okStatus =
        tab === "ai"
          ? st === "all"
            ? true
            : String(r.raw?.status || "").toLowerCase() === st
          : true;

      const okTenant =
        !tenantNeedle ||
        String(r.tenantId || "")
          .toLowerCase()
          .includes(tenantNeedle);

      const hay =
        `${r.type || ""} ${r.message || ""} ${r.actor || ""} ${r.tenantId || ""}`.toLowerCase();
      const okQuery = !needle || hay.includes(needle);

      return okLevel && okStatus && okTenant && okQuery;
    });
  }, [tab, normalizedSystem, normalizedAi, q, level, aiStatus, tenantId]);

  const hint = useMemo(() => {
    if (!error) return "";
    if (tab === "system") return "Endpoint: /api/admin/system/super/logs";
    return "Endpoint: /api/ai-usage";
  }, [error, tab]);

  // ---------- UI ----------

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Audit & Logs</h1>
          <p className="opacity-80 text-sm">
            Searchable events and AI usage logs, sanitized, tenant-aware.
          </p>
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

      <div className="p-4 rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("system")}
              className={`px-3 py-2 rounded-lg border dark:border-gray-800 ${
                tab === "system"
                  ? "bg-gray-900 text-white dark:bg-white dark:text-black"
                  : "hover:bg-gray-50 dark:hover:bg-gray-950"
              }`}
            >
              System logs
            </button>
            <button
              type="button"
              onClick={() => setTab("ai")}
              className={`px-3 py-2 rounded-lg border dark:border-gray-800 ${
                tab === "ai"
                  ? "bg-gray-900 text-white dark:bg-white dark:text-black"
                  : "hover:bg-gray-50 dark:hover:bg-gray-950"
              }`}
            >
              AI usage
            </button>
          </div>

          {tab === "ai" ? (
            <div className="text-xs opacity-70">
              Page {aiMeta.page} of {aiMeta.pages} · {fmtInt(aiMeta.total)}{" "}
              total
            </div>
          ) : (
            <div className="text-xs opacity-70">
              {fmtInt(systemLogs.length)} loaded
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-white dark:bg-gray-950 dark:border-gray-800">
              <FaSearch className="opacity-60" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full bg-transparent outline-none text-sm"
                placeholder="Search by tenant, actor, type, message"
              />
            </div>
          </div>

          <div className="lg:col-span-3">
            <input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-950 dark:border-gray-800 text-sm"
              placeholder="Tenant id filter"
            />
          </div>

          <div className="lg:col-span-2">
            {tab === "system" ? (
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-950 dark:border-gray-800 text-sm"
              >
                <option value="all">All levels</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
                <option value="security">Security</option>
              </select>
            ) : (
              <select
                value={aiStatus}
                onChange={(e) => setAiStatus(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-950 dark:border-gray-800 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="ok">ok</option>
                <option value="error">error</option>
              </select>
            )}
          </div>

          <div className="lg:col-span-2 flex gap-2">
            {tab === "ai" ? (
              <>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="w-full px-3 py-2 rounded-lg border dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-950 text-sm"
                  disabled={loading || page <= 1}
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  className="w-full px-3 py-2 rounded-lg border dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-950 text-sm"
                  disabled={loading || page >= aiMeta.pages}
                >
                  Next
                </button>
              </>
            ) : (
              <div className="w-full text-sm opacity-70 flex items-center justify-end">
                {fmtInt(filtered.length)} results
              </div>
            )}
          </div>
        </div>

        <ErrorPanel message={error} hint={hint} />

        {loading ? (
          <div className="opacity-70">Loading…</div>
        ) : (
          <div className="overflow-auto rounded-xl border dark:border-gray-800">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="opacity-70 bg-gray-50 dark:bg-gray-950">
                <tr>
                  <th className="text-left p-2">Time</th>
                  <th className="text-left p-2">Level</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-left p-2">Tenant</th>
                  <th className="text-left p-2">Actor</th>
                  <th className="text-left p-2">Message</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((r, idx) => (
                  <tr
                    key={r.id || idx}
                    className="border-t dark:border-gray-800"
                  >
                    <td className="p-2">
                      {r.timestamp
                        ? new Date(r.timestamp).toLocaleString()
                        : "-"}
                    </td>

                    <td className="p-2">
                      <Pill tone={toneFromLevel(r.level)}>
                        {r.level || "-"}
                      </Pill>
                    </td>

                    <td className="p-2">{r.type || "-"}</td>
                    <td className="p-2">{r.tenantId || "-"}</td>
                    <td className="p-2">{r.actor || "-"}</td>
                    <td className="p-2 max-w-[520px] whitespace-nowrap overflow-hidden text-ellipsis">
                      {r.message || "-"}
                    </td>

                    <td className="p-2">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="text-sm font-semibold underline"
                          onClick={() => setSelected(r)}
                        >
                          View
                        </button>

                        {tab === "ai" && r?.meta?.requestId ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 text-sm font-semibold underline"
                            onClick={() => copyText(r.meta.requestId)}
                            title="Copy request id"
                          >
                            <FaCopy /> Copy req
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 ? (
                  <tr>
                    <td className="p-3 opacity-70" colSpan={7}>
                      No logs found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-xs opacity-70">
          Keep tenant isolation strict and keep logs sanitized.
        </div>
      </div>

      <DetailsModal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={
          selected
            ? `${tab === "system" ? "System log" : "AI usage"} details`
            : "Details"
        }
        data={selected?.raw || selected}
        footer={
          tab === "ai" && selected ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="p-2 rounded-lg border dark:border-gray-800">
                <div className="opacity-70">Tokens</div>
                <div className="font-semibold">
                  {fmtInt(selected?.meta?.totalTokens)}
                </div>
              </div>
              <div className="p-2 rounded-lg border dark:border-gray-800">
                <div className="opacity-70">Cost</div>
                <div className="font-semibold">
                  {fmtMoney(selected?.meta?.totalCost)}{" "}
                  {selected?.meta?.currency || ""}
                </div>
              </div>
              <div className="p-2 rounded-lg border dark:border-gray-800">
                <div className="opacity-70">Provider</div>
                <div className="font-semibold">
                  {selected?.meta?.provider || "-"}
                </div>
              </div>
              <div className="p-2 rounded-lg border dark:border-gray-800">
                <div className="opacity-70">Model</div>
                <div className="font-semibold">
                  {selected?.meta?.model || "-"}
                </div>
              </div>
            </div>
          ) : null
        }
      />
    </div>
  );
}
