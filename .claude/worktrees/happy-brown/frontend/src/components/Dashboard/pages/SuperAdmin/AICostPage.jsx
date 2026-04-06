// AiCostpage.jsx (updated)
// - Uses the SUPERADMIN endpoints directly (same auth path as tenants)
// - Separates fetch for cost (depends only on range) from requests (depends on range + pagination + filters)
// - Better axios error messages
// - Removed Oxford comma from UI copy

import React, { useEffect, useMemo, useState } from "react";
import api from "../../../../services/api/api.js";

const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

const fmtInt = (v) => new Intl.NumberFormat().format(Math.round(n(v)));
const fmtMoney = (v) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n(v));
const fmtPct = (v) => `${Math.round(n(v) * 100)}%`;
const fmtMs = (v) => `${Math.round(n(v))} ms`;

const ranges = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

function sortRows(rows, key, dir) {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a?.[key];
    const bv = b?.[key];
    if (typeof av === "number" && typeof bv === "number")
      return (av - bv) * mul;
    return String(av ?? "").localeCompare(String(bv ?? "")) * mul;
  });
}

function Card({ label, value, sub }) {
  return (
    <div className="px-3 py-2 rounded-lg border dark:border-gray-800">
      <div className="opacity-70 text-xs uppercase tracking-wider">{label}</div>
      <div className="font-extrabold text-lg leading-tight">{value}</div>
      {sub ? <div className="text-xs opacity-70 mt-0.5">{sub}</div> : null}
    </div>
  );
}

function ErrorBox({ title, message }) {
  if (!message) return null;
  return (
    <div className="mt-3 p-3 rounded-lg border border-red-300 bg-red-50 text-red-700">
      <div className="font-bold">{title}</div>
      <div className="text-sm mt-1">{message}</div>
    </div>
  );
}

function errMsg(e, fallback) {
  return (
    e?.response?.data?.message ||
    e?.response?.data?.error ||
    e?.message ||
    fallback
  );
}

/**
 * NOTE:
 * This file assumes `api` is an axios instance (api.get exists).
 * If your api export is wrapped, replace `api.get` with your axios client
 * (example: api.client.get or api.http.get).
 */
export default function SuperAdminAICenterPage() {
  // Tabs
  const [tab, setTab] = useState("requests"); // "requests" | "cost"

  // Shared range
  const [range, setRange] = useState("7d");

  // Requests state
  const [reqLoading, setReqLoading] = useState(true);
  const [reqError, setReqError] = useState("");
  const [reqSummary, setReqSummary] = useState(null);
  const [reqRows, setReqRows] = useState([]);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [cacheHit, setCacheHit] = useState(""); // "", "true", "false"

  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(1);

  // Cost state
  const [costLoading, setCostLoading] = useState(true);
  const [costError, setCostError] = useState("");
  const [byTenant, setByTenant] = useState([]);
  const [byFeature, setByFeature] = useState([]);

  const [tenantSortKey, setTenantSortKey] = useState("cost");
  const [tenantSortDir, setTenantSortDir] = useState("desc");
  const [featureSortKey, setFeatureSortKey] = useState("cost");
  const [featureSortDir, setFeatureSortDir] = useState("desc");

  const skip = useMemo(() => (page - 1) * limit, [page, limit]);

  const reqTotals = useMemo(() => {
    const t = reqSummary?.totals || {};
    return {
      requests: n(t.requests),
      totalTokens: n(t.totalTokens),
      avgLatencyMs: n(t.avgLatencyMs),
      cacheHitRate: n(t.cacheHitRate),
    };
  }, [reqSummary]);

  const costTotals = useMemo(() => {
    const tokens = byTenant.reduce((acc, r) => acc + n(r.tokens), 0);
    const cost = byTenant.reduce((acc, r) => acc + n(r.cost), 0);
    const requests = byTenant.reduce((acc, r) => acc + n(r.requests), 0);
    return { tokens, cost, requests };
  }, [byTenant]);

  const sortedTenants = useMemo(
    () => sortRows(byTenant, tenantSortKey, tenantSortDir),
    [byTenant, tenantSortKey, tenantSortDir],
  );

  const sortedFeatures = useMemo(
    () => sortRows(byFeature, featureSortKey, featureSortDir),
    [byFeature, featureSortKey, featureSortDir],
  );

  const fetchRequests = async () => {
    try {
      setReqLoading(true);
      setReqError("");

      const params = { range, limit, skip };
      if (q.trim()) params.q = q.trim();
      if (status) params.status = status;
      if (provider) params.provider = provider;
      if (model) params.model = model;
      if (cacheHit) params.cacheHit = cacheHit;

      const [summaryRes, listRes] = await Promise.all([
        api.get("/api/admin/super/ai-requests/summary", { params: { range } }),
        api.get("/api/admin/super/ai-requests", { params }),
      ]);

      const s = summaryRes?.data ?? summaryRes;
      const list = listRes?.data ?? listRes;

      setReqSummary(s);

      const items = Array.isArray(list?.items)
        ? list.items
        : Array.isArray(list)
          ? list
          : [];

      setReqRows(items);
    } catch (e) {
      setReqError(errMsg(e, "Unable to load AI requests."));
      setReqRows([]);
      setReqSummary(null);
    } finally {
      setReqLoading(false);
    }
  };

  const fetchCost = async () => {
    try {
      setCostLoading(true);
      setCostError("");

      // Expected:
      // { byTenant:[{tenantId,name,tokens,cost,requests}], byFeature:[{feature,tokens,cost,requests}] }
      const res = await api.get("/api/admin/super/ai-cost", {
        params: { range },
      });

      const data = res?.data ?? res;

      setByTenant(Array.isArray(data?.byTenant) ? data.byTenant : []);
      setByFeature(Array.isArray(data?.byFeature) ? data.byFeature : []);
    } catch (e) {
      setCostError(errMsg(e, "Unable to load AI cost data."));
      setByTenant([]);
      setByFeature([]);
    } finally {
      setCostLoading(false);
    }
  };

  // Requests: refetch when range, pagination changes
  useEffect(() => {
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, limit, skip]);

  // Cost: refetch only when range changes
  useEffect(() => {
    fetchCost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // If filters change, reset to page 1
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, provider, model, cacheHit]);

  const toggleSort = (key, currentKey, currentDir, setKey, setDir) => {
    if (currentKey !== key) {
      setKey(key);
      setDir("desc");
      return;
    }
    setDir(currentDir === "desc" ? "asc" : "desc");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Super Admin · AI Center</h1>
        <p className="opacity-80 text-sm">
          Requests, tokens, latency, cache rate and cost breakdown across
          tenants and features.
        </p>
      </div>

      {/* Controls */}
      <div className="p-4 rounded-xl border bg-white dark:bg-gray-900 dark:border-gray-800 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm opacity-70">Range</span>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="border rounded-lg px-3 py-2 bg-white dark:bg-gray-950 dark:border-gray-800"
            >
              {ranges.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>

            <div className="w-px h-8 bg-gray-200 dark:bg-gray-800 mx-1" />

            <button
              onClick={() => {
                fetchRequests();
                fetchCost();
              }}
              className="px-3 py-2 rounded-lg border dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-950"
              type="button"
            >
              Refresh
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("requests")}
              className={`px-3 py-2 rounded-lg border dark:border-gray-800 ${
                tab === "requests"
                  ? "bg-gray-900 text-white dark:bg-white dark:text-black"
                  : "hover:bg-gray-50 dark:hover:bg-gray-950"
              }`}
            >
              Requests
            </button>
            <button
              type="button"
              onClick={() => setTab("cost")}
              className={`px-3 py-2 rounded-lg border dark:border-gray-800 ${
                tab === "cost"
                  ? "bg-gray-900 text-white dark:bg-white dark:text-black"
                  : "hover:bg-gray-50 dark:hover:bg-gray-950"
              }`}
            >
              Cost
            </button>
          </div>
        </div>

        {/* Requests Tab */}
        {tab === "requests" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card label="Requests" value={fmtInt(reqTotals.requests)} />
              <Card label="Tokens" value={fmtInt(reqTotals.totalTokens)} />
              <Card label="Avg latency" value={fmtMs(reqTotals.avgLatencyMs)} />
              <Card label="Cache hit" value={fmtPct(reqTotals.cacheHitRate)} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-6 gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search request text…"
                className="lg:col-span-2 border rounded-lg px-3 py-2 bg-white dark:bg-gray-950 dark:border-gray-800"
              />
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="Provider (gemini, openai)…"
                className="border rounded-lg px-3 py-2 bg-white dark:bg-gray-950 dark:border-gray-800"
              />
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Model (gemini-2.5-flash)…"
                className="border rounded-lg px-3 py-2 bg-white dark:bg-gray-950 dark:border-gray-800"
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="border rounded-lg px-3 py-2 bg-white dark:bg-gray-950 dark:border-gray-800"
              >
                <option value="">All statuses</option>
                <option value="ok">ok</option>
                <option value="error">error</option>
              </select>
              <select
                value={cacheHit}
                onChange={(e) => setCacheHit(e.target.value)}
                className="border rounded-lg px-3 py-2 bg-white dark:bg-gray-950 dark:border-gray-800"
              >
                <option value="">Cache any</option>
                <option value="true">Cache hit</option>
                <option value="false">Cache miss</option>
              </select>
            </div>

            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div className="flex gap-2 items-center">
                <span className="text-sm opacity-70">Rows</span>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="border rounded-lg px-3 py-2 bg-white dark:bg-gray-950 dark:border-gray-800"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-2 rounded-lg border dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-950"
                >
                  Prev
                </button>
                <div className="text-sm opacity-80">
                  Page <span className="font-semibold">{page}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-2 rounded-lg border dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-950"
                >
                  Next
                </button>
              </div>
            </div>

            <ErrorBox title="Requests error" message={reqError} />

            {reqLoading ? (
              <div className="opacity-70">Loading…</div>
            ) : (
              <div className="rounded-xl border dark:border-gray-800 overflow-auto">
                <div className="p-3 font-bold bg-gray-50 dark:bg-gray-950">
                  Latest requests
                </div>
                <table className="min-w-[1100px] w-full text-sm">
                  <thead className="opacity-70">
                    <tr>
                      <th className="text-left p-2">Updated</th>
                      <th className="text-left p-2">Provider</th>
                      <th className="text-left p-2">Model</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-right p-2">Tokens</th>
                      <th className="text-right p-2">Latency</th>
                      <th className="text-left p-2">Cache</th>
                      <th className="text-left p-2">Request</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reqRows.map((r) => (
                      <tr key={r._id} className="border-t dark:border-gray-800">
                        <td className="p-2">
                          {r.updatedAt
                            ? new Date(r.updatedAt).toLocaleString()
                            : "-"}
                        </td>
                        <td className="p-2">{r.provider || "-"}</td>
                        <td className="p-2">{r.model || "-"}</td>
                        <td className="p-2">{r.lastStatus || "-"}</td>
                        <td className="p-2 text-right">
                          {fmtInt(r.totalTokens)}
                        </td>
                        <td className="p-2 text-right">
                          {fmtMs(r.totalLatencyMs)}
                        </td>
                        <td className="p-2">{String(r.cacheHit)}</td>
                        <td className="p-2 max-w-[520px] whitespace-nowrap overflow-hidden text-ellipsis">
                          {r?.payload?.requestText || "-"}
                        </td>
                      </tr>
                    ))}
                    {reqRows.length === 0 ? (
                      <tr>
                        <td className="p-3 opacity-70" colSpan={8}>
                          No data for this range and filter set.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}

        {/* Cost Tab */}
        {tab === "cost" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card label="Requests" value={fmtInt(costTotals.requests)} />
              <Card label="Tokens" value={fmtInt(costTotals.tokens)} />
              <Card
                label="Cost"
                value={fmtMoney(costTotals.cost)}
                sub="Sum of tenant costs"
              />
            </div>

            <ErrorBox title="Cost error" message={costError} />

            {costLoading ? (
              <div className="opacity-70">Loading…</div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="rounded-xl border dark:border-gray-800 overflow-auto">
                  <div className="p-3 font-bold bg-gray-50 dark:bg-gray-950 flex items-center justify-between">
                    <span>By Tenant</span>
                    <span className="text-xs opacity-70">
                      Sort:{" "}
                      <button
                        type="button"
                        onClick={() =>
                          toggleSort(
                            "cost",
                            tenantSortKey,
                            tenantSortDir,
                            setTenantSortKey,
                            setTenantSortDir,
                          )
                        }
                        className="underline"
                      >
                        cost
                      </button>{" "}
                      ·{" "}
                      <button
                        type="button"
                        onClick={() =>
                          toggleSort(
                            "tokens",
                            tenantSortKey,
                            tenantSortDir,
                            setTenantSortKey,
                            setTenantSortDir,
                          )
                        }
                        className="underline"
                      >
                        tokens
                      </button>{" "}
                      ·{" "}
                      <button
                        type="button"
                        onClick={() =>
                          toggleSort(
                            "requests",
                            tenantSortKey,
                            tenantSortDir,
                            setTenantSortKey,
                            setTenantSortDir,
                          )
                        }
                        className="underline"
                      >
                        requests
                      </button>
                    </span>
                  </div>

                  <table className="min-w-full text-sm">
                    <thead className="opacity-70">
                      <tr>
                        <th className="text-left p-2">Tenant</th>
                        <th className="text-right p-2">Requests</th>
                        <th className="text-right p-2">Tokens</th>
                        <th className="text-right p-2">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTenants.map((r) => (
                        <tr
                          key={r.tenantId}
                          className="border-t dark:border-gray-800"
                        >
                          <td className="p-2">
                            <div className="font-semibold">{r.name || "-"}</div>
                            <div className="text-xs opacity-70">
                              {r.tenantId}
                            </div>
                          </td>
                          <td className="p-2 text-right">
                            {fmtInt(r.requests)}
                          </td>
                          <td className="p-2 text-right">{fmtInt(r.tokens)}</td>
                          <td className="p-2 text-right">{fmtMoney(r.cost)}</td>
                        </tr>
                      ))}
                      {sortedTenants.length === 0 ? (
                        <tr>
                          <td className="p-3 opacity-70" colSpan={4}>
                            No data for this range.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-xl border dark:border-gray-800 overflow-auto">
                  <div className="p-3 font-bold bg-gray-50 dark:bg-gray-950 flex items-center justify-between">
                    <span>By Feature</span>
                    <span className="text-xs opacity-70">
                      Sort:{" "}
                      <button
                        type="button"
                        onClick={() =>
                          toggleSort(
                            "cost",
                            featureSortKey,
                            featureSortDir,
                            setFeatureSortKey,
                            setFeatureSortDir,
                          )
                        }
                        className="underline"
                      >
                        cost
                      </button>{" "}
                      ·{" "}
                      <button
                        type="button"
                        onClick={() =>
                          toggleSort(
                            "tokens",
                            featureSortKey,
                            featureSortDir,
                            setFeatureSortKey,
                            setFeatureSortDir,
                          )
                        }
                        className="underline"
                      >
                        tokens
                      </button>{" "}
                      ·{" "}
                      <button
                        type="button"
                        onClick={() =>
                          toggleSort(
                            "requests",
                            featureSortKey,
                            featureSortDir,
                            setFeatureSortKey,
                            setFeatureSortDir,
                          )
                        }
                        className="underline"
                      >
                        requests
                      </button>
                    </span>
                  </div>

                  <table className="min-w-full text-sm">
                    <thead className="opacity-70">
                      <tr>
                        <th className="text-left p-2">Feature</th>
                        <th className="text-right p-2">Requests</th>
                        <th className="text-right p-2">Tokens</th>
                        <th className="text-right p-2">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFeatures.map((r) => (
                        <tr
                          key={
                            r.feature ||
                            `${r.feature}-${r.tokens}-${r.cost}-${r.requests}`
                          }
                          className="border-t dark:border-gray-800"
                        >
                          <td className="p-2 font-semibold">
                            {r.feature || "-"}
                          </td>
                          <td className="p-2 text-right">
                            {fmtInt(r.requests)}
                          </td>
                          <td className="p-2 text-right">{fmtInt(r.tokens)}</td>
                          <td className="p-2 text-right">{fmtMoney(r.cost)}</td>
                        </tr>
                      ))}
                      {sortedFeatures.length === 0 ? (
                        <tr>
                          <td className="p-3 opacity-70" colSpan={4}>
                            No data for this range.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="text-xs opacity-70">
              Tip: add hard caps and kill switches in backend, then expose them
              here.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
