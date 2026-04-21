import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FaBolt, FaBuilding, FaGlobe, FaRobot } from "react-icons/fa";

import api from "../../../../services/api/api.js";
import LoadingSpinner from "../../components/ui/LoadingSpinner.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";
import {
  chartHasData,
  collectionItems,
  formatChartPoints,
  formatMetricValue,
  metricDescription,
  sourceBadgeClass,
} from "../../../../utils/analyticsState.js";

const fmtInt = (value) => new Intl.NumberFormat().format(Math.round(Number(value || 0)));
const fmtMoney = (value) =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(value || 0));
const fmtPct = (value) => `${Math.round(Number(value || 0) * 100)}%`;
const fmtMs = (value) => `${Math.round(Number(value || 0))} ms`;

const RANGES = [
  { value: "24h", label: "Last 24 h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function errMsg(error, fallback) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback;
}

function SummaryCard({ label, metric, formatter, fallback }) {
  return (
    <div className="dash-card py-3">
      <div className="text-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: metric?.value === null || metric?.value === undefined ? "1rem" : "1.45rem",
          fontWeight: 800,
          color: metric?.value === null || metric?.value === undefined ? "var(--text-muted)" : "var(--text-heading)",
          lineHeight: 1.2,
          marginTop: 4,
        }}
      >
        {formatMetricValue(metric, formatter, fallback)}
      </div>
      <div className="text-muted mt-1" style={{ fontSize: "0.72rem" }}>
        {metricDescription(metric, fallback)}
      </div>
    </div>
  );
}

function SortTh({ label, sortKey, currentKey, currentDir, onSort, className = "" }) {
  const active = currentKey === sortKey;
  return (
    <th
      className={className}
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => onSort(sortKey)}
    >
      {label} {active ? (currentDir === "desc" ? "↓" : "↑") : <span style={{ opacity: 0.3 }}>↕</span>}
    </th>
  );
}

function sortRows(rows, key, dir) {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a?.[key];
    const bv = b?.[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
    return String(av ?? "").localeCompare(String(bv ?? "")) * mul;
  });
}

function SourcePill({ label, status }) {
  return (
    <div className="d-flex align-items-center gap-2">
      <span className={`badge ${sourceBadgeClass(status?.state)} text-uppercase`}>
        {String(status?.state || "unknown").replaceAll("_", " ")}
      </span>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div className="text-muted" style={{ fontSize: "0.75rem" }}>
          {status?.label || "No status available"}
        </div>
      </div>
    </div>
  );
}

function formatAxisLabel(label) {
  if (!label) return "";
  const parsed = new Date(label);
  if (Number.isNaN(parsed.getTime())) return String(label);
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
}

function ChartCard({ title, chart, color = "#0d6efd", bar = false, emptyMessage }) {
  const points = formatChartPoints(chart);
  const gradientId = `chart-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;

  return (
    <div className="dash-card h-100">
      <h3 className="dash-card-title mb-3">{title}</h3>
      {chartHasData(chart) ? (
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer>
            {bar ? (
              <BarChart data={points}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickFormatter={formatAxisLabel} fontSize={12} />
                <YAxis fontSize={12} allowDecimals={false} />
                <Tooltip labelFormatter={(value) => formatAxisLabel(value)} />
                <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={points}>
                <defs>
                  <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickFormatter={formatAxisLabel} fontSize={12} />
                <YAxis fontSize={12} allowDecimals={!bar} />
                <Tooltip labelFormatter={(value) => formatAxisLabel(value)} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  fill={`url(#${gradientId})`}
                  strokeWidth={2}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState
          icon={<FaBolt />}
          title={chart?.label || "No chart data yet"}
          message={emptyMessage || "Generate a quiz, run AI grading, or open AI tutor, then refresh."}
        />
      )}
    </div>
  );
}

export default function AICostPage() {
  const [tab, setTab] = useState("requests");
  const [range, setRange] = useState("7d");
  const [tenants, setTenants] = useState([]);
  const [tenantFilter, setTenantFilter] = useState("");

  const [reqLoading, setReqLoading] = useState(true);
  const [reqError, setReqError] = useState("");
  const [reqSummary, setReqSummary] = useState(null);
  const [reqListState, setReqListState] = useState(null);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [cacheHit, setCacheHit] = useState("");
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(1);

  const [costLoading, setCostLoading] = useState(true);
  const [costError, setCostError] = useState("");
  const [costPayload, setCostPayload] = useState(null);
  const [tenantSortKey, setTenantSortKey] = useState("requests");
  const [tenantSortDir, setTenantSortDir] = useState("desc");
  const [featureSortKey, setFeatureSortKey] = useState("requests");
  const [featureSortDir, setFeatureSortDir] = useState("desc");

  const skip = useMemo(() => (page - 1) * limit, [page, limit]);
  const selectedTenant = tenants.find((tenant) => tenant.tenantId === tenantFilter);

  useEffect(() => {
    api.admin
      .listTenants()
      .then((response) => {
        setTenants(Array.isArray(response?.items) ? response.items : []);
      })
      .catch(() => {});
  }, []);

  const fetchRequests = useCallback(async () => {
    setReqLoading(true);
    setReqError("");
    try {
      const params = {
        range,
        limit,
        skip,
        tenantId: tenantFilter || undefined,
        q: q.trim() || undefined,
        status: statusFilter || undefined,
        provider: provider.trim() || undefined,
        model: model.trim() || undefined,
        cacheHit: cacheHit || undefined,
      };

      const [summaryPayload, listPayload] = await Promise.all([
        api.admin.getAiRequestsSummary({
          range,
          tenantId: tenantFilter || undefined,
        }),
        api.admin.listAiRequests(params),
      ]);

      setReqSummary(summaryPayload || null);
      setReqListState(listPayload || null);
    } catch (error) {
      setReqError(errMsg(error, "Unable to load AI requests."));
      setReqSummary(null);
      setReqListState(null);
    } finally {
      setReqLoading(false);
    }
  }, [range, limit, skip, tenantFilter, q, statusFilter, provider, model, cacheHit]);

  const fetchCost = useCallback(async () => {
    setCostLoading(true);
    setCostError("");
    try {
      const payload = await api.admin.getAICost({
        range,
        tenantId: tenantFilter || undefined,
      });
      setCostPayload(payload || null);
    } catch (error) {
      setCostError(errMsg(error, "Unable to load AI cost data."));
      setCostPayload(null);
    } finally {
      setCostLoading(false);
    }
  }, [range, tenantFilter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    fetchCost();
  }, [fetchCost]);

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, provider, model, cacheHit, tenantFilter]);

  const requestSummary = reqSummary?.summary || {};
  const requestRows = collectionItems(reqListState);
  const requestMeta = reqListState?.meta || {};

  const costSummary = costPayload?.summary || {};
  const byTenant = Array.isArray(costPayload?.byTenant) ? costPayload.byTenant : [];
  const byFeature = Array.isArray(costPayload?.byFeature) ? costPayload.byFeature : [];
  const charts = costPayload?.charts || {};
  const sourceStatus = costPayload?.sourceStatus || reqSummary?.sourceStatus || {};

  const sortedTenants = useMemo(() => sortRows(byTenant, tenantSortKey, tenantSortDir), [byTenant, tenantSortKey, tenantSortDir]);
  const sortedFeatures = useMemo(() => sortRows(byFeature, featureSortKey, featureSortDir), [byFeature, featureSortKey, featureSortDir]);

  const toggleTenantSort = (key) => {
    if (tenantSortKey !== key) {
      setTenantSortKey(key);
      setTenantSortDir("desc");
      return;
    }
    setTenantSortDir((current) => (current === "desc" ? "asc" : "desc"));
  };

  const toggleFeatureSort = (key) => {
    if (featureSortKey !== key) {
      setFeatureSortKey(key);
      setFeatureSortDir("desc");
      return;
    }
    setFeatureSortDir((current) => (current === "desc" ? "asc" : "desc"));
  };

  const totalRequests = Number(requestMeta.total || 0);
  const canGoNext = skip + limit < totalRequests;

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h2>AI Usage and Cost</h2>
          <p className="text-muted mb-0">
            Truthful AI telemetry across requests, tokens, latency, cache behavior, and cost.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => {
            fetchRequests();
            fetchCost();
          }}
        >
          Refresh
        </button>
      </div>

      <div className="dash-card mb-4">
        <div className="row g-3 align-items-end">
          <div className="col-12 col-sm-6 col-md-auto">
            <label className="form-label mb-1" style={{ fontSize: "0.82rem" }}>
              Time range
            </label>
            <select className="form-select" style={{ minWidth: 140 }} value={range} onChange={(event) => setRange(event.target.value)}>
              {RANGES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-sm-6 col-md-auto">
            <label className="form-label mb-1" style={{ fontSize: "0.82rem" }}>
              Tenant
            </label>
            <select className="form-select" style={{ minWidth: 220 }} value={tenantFilter} onChange={(event) => setTenantFilter(event.target.value)}>
              <option value="">All tenants</option>
              {tenants.map((tenant) => (
                <option key={tenant.tenantId || tenant._id} value={tenant.tenantId}>
                  {tenant.name || tenant.tenantId}
                </option>
              ))}
            </select>
          </div>

          <div className="col-12 col-md-auto ms-md-auto">
            <label className="form-label mb-1 d-none d-md-block" style={{ visibility: "hidden", fontSize: "0.82rem" }}>
              View
            </label>
            <div className="btn-group" role="group">
              <button
                type="button"
                className={`btn btn-sm ${tab === "requests" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setTab("requests")}
              >
                Requests
              </button>
              <button
                type="button"
                className={`btn btn-sm ${tab === "cost" ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => setTab("cost")}
              >
                Cost and charts
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 d-flex flex-wrap gap-3">
          <SourcePill label="AI provider" status={sourceStatus.aiProvider} />
          <SourcePill label="Usage logging" status={sourceStatus.aiLogging} />
          <SourcePill label="Audit logging" status={sourceStatus.auditLogging} />
        </div>

        {tenantFilter ? (
          <div className="tenant-scope-banner scope-tenant mt-3">
            <FaBuilding />
            <span>
              Filtered to <strong>{selectedTenant?.name || tenantFilter}</strong>
            </span>
            <button type="button" className="btn btn-sm btn-outline-secondary ms-auto" onClick={() => setTenantFilter("")}>
              Clear filter
            </button>
          </div>
        ) : (
          <div className="tenant-scope-banner scope-global mt-3">
            <FaGlobe />
            <span>
              Showing data for <strong>all tenants</strong>
            </span>
          </div>
        )}
      </div>

      {tab === "requests" ? (
        <>
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6 col-xl-3">
              <SummaryCard label="Requests" metric={requestSummary.requests} formatter={fmtInt} fallback="No AI activity yet" />
            </div>
            <div className="col-12 col-sm-6 col-xl-3">
              <SummaryCard label="Total tokens" metric={requestSummary.totalTokens} formatter={fmtInt} fallback="No token data yet" />
            </div>
            <div className="col-12 col-sm-6 col-xl-3">
              <SummaryCard label="Avg latency" metric={requestSummary.avgLatencyMs} formatter={fmtMs} fallback="No latency data yet" />
            </div>
            <div className="col-12 col-sm-6 col-xl-3">
              <SummaryCard label="Cache hit rate" metric={requestSummary.cacheHitRate} formatter={fmtPct} fallback="No cache data" />
            </div>
          </div>

          <div className="dash-card mb-3">
            <div className="row g-2">
              <div className="col-12 col-md-4">
                <input className="form-control form-control-sm" placeholder="Search request, feature, model, or tenant" value={q} onChange={(event) => setQ(event.target.value)} />
              </div>
              <div className="col-6 col-md-2">
                <input className="form-control form-control-sm" placeholder="Provider" value={provider} onChange={(event) => setProvider(event.target.value)} />
              </div>
              <div className="col-6 col-md-2">
                <input className="form-control form-control-sm" placeholder="Model" value={model} onChange={(event) => setModel(event.target.value)} />
              </div>
              <div className="col-6 col-md-2">
                <select className="form-select form-select-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="ok">Success</option>
                  <option value="error">Error</option>
                </select>
              </div>
              <div className="col-6 col-md-2">
                <select className="form-select form-select-sm" value={cacheHit} onChange={(event) => setCacheHit(event.target.value)}>
                  <option value="">Cache any</option>
                  <option value="true">Cache hit</option>
                  <option value="false">Cache miss</option>
                </select>
              </div>
            </div>
          </div>

          {reqError ? <div className="alert alert-danger mb-3">{reqError}</div> : null}

          <div className="dash-card">
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <div>
                <h3 className="dash-card-title mb-0">Latest requests</h3>
                <div className="text-muted" style={{ fontSize: "0.8rem" }}>
                  {reqListState?.label || "Recent AI requests"}
                </div>
              </div>
              <div className="d-flex align-items-center gap-2">
                <select className="form-select form-select-sm" style={{ width: "auto" }} value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                </select>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
                  Prev
                </button>
                <span className="text-muted" style={{ fontSize: "0.82em", whiteSpace: "nowrap" }}>
                  Page {page}
                </span>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPage((current) => current + 1)} disabled={!canGoNext}>
                  Next
                </button>
              </div>
            </div>

            {reqLoading ? (
              <LoadingSpinner message="Loading requests..." />
            ) : requestRows.length === 0 ? (
              <EmptyState
                icon={<FaRobot />}
                title={reqListState?.label || "No AI activity yet"}
                message="Generate a quiz, run AI grading, or open AI tutor, then refresh after activity."
                action="Refresh"
                onAction={fetchRequests}
              />
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.83em" }}>
                  <thead>
                    <tr>
                      <th style={{ whiteSpace: "nowrap" }}>Time</th>
                      <th>Tenant</th>
                      <th>Provider</th>
                      <th>Model</th>
                      <th>Status</th>
                      <th>Feature</th>
                      <th className="text-end">Tokens</th>
                      <th className="text-end">Latency</th>
                      <th>Cache</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestRows.map((row) => (
                      <tr key={row.requestId || `${row.provider}-${row.updatedAt}`}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"}
                        </td>
                        <td>{row.tenantId || "Unattributed"}</td>
                        <td>{row.provider || "-"}</td>
                        <td>{row.model || "-"}</td>
                        <td>
                          <span className={`badge ${row.status === "error" ? "bg-danger" : "bg-success"}`}>
                            {row.status || "-"}
                          </span>
                        </td>
                        <td>{row.feature || row.endpoint || "-"}</td>
                        <td className="text-end">{row.totalTokens === null || row.totalTokens === undefined ? "-" : fmtInt(row.totalTokens)}</td>
                        <td className="text-end">{row.latencyMs === null || row.latencyMs === undefined ? "-" : fmtMs(row.latencyMs)}</td>
                        <td>
                          {row.cacheHit === null || row.cacheHit === undefined ? (
                            <span className="badge bg-secondary">n/a</span>
                          ) : (
                            <span className={`badge ${row.cacheHit ? "bg-primary" : "bg-secondary"}`}>
                              {row.cacheHit ? "hit" : "miss"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6 col-xl-4">
              <SummaryCard label="Requests" metric={costSummary.requests} formatter={fmtInt} fallback="No AI activity yet" />
            </div>
            <div className="col-12 col-sm-6 col-xl-4">
              <SummaryCard label="Total tokens" metric={costSummary.totalTokens} formatter={fmtInt} fallback="No token data yet" />
            </div>
            <div className="col-12 col-sm-6 col-xl-4">
              <SummaryCard label="Estimated cost" metric={costSummary.estimatedCost} formatter={(value) => `$${fmtMoney(value)}`} fallback="Cost logging not available yet" />
            </div>
          </div>

          {costError ? <div className="alert alert-danger mb-3">{costError}</div> : null}

          {costLoading ? (
            <LoadingSpinner message="Loading AI telemetry..." />
          ) : (
            <>
              <div className="row g-4 mb-4">
                <div className="col-xl-6">
                  <ChartCard title="Requests over time" chart={charts.requestsOverTime} color="#0d6efd" emptyMessage="No request chart data yet. Generate a quiz or open AI tutor, then refresh." />
                </div>
                <div className="col-xl-6">
                  <ChartCard title="Cost over time" chart={charts.costOverTime} color="#198754" emptyMessage="Cost data only appears when explicit cost logging is available." />
                </div>
                <div className="col-xl-6">
                  <ChartCard title="Latency over time" chart={charts.latencyOverTime} color="#fd7e14" emptyMessage="Latency appears after real AI requests complete." />
                </div>
                <div className="col-xl-6">
                  <ChartCard title="Usage by tenant" chart={charts.usageByTenant} color="#6f42c1" bar emptyMessage="Tenant usage will appear once requests include tenant attribution." />
                </div>
              </div>

              <div className="row g-4">
                <div className="col-xl-6">
                  <div className="dash-card h-100">
                    <h3 className="dash-card-title mb-3">By tenant</h3>
                    {sortedTenants.length === 0 ? (
                      <EmptyState
                        icon={<FaBuilding />}
                        title={costPayload?.charts?.usageByTenant?.label || "No tenant usage data yet"}
                        message="Run AI features from a tenant context, then refresh to see attribution."
                      />
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.85em" }}>
                          <thead>
                            <tr>
                              <th>Tenant</th>
                              <SortTh label="Requests" sortKey="requests" currentKey={tenantSortKey} currentDir={tenantSortDir} onSort={toggleTenantSort} className="text-end" />
                              <SortTh label="Tokens" sortKey="tokens" currentKey={tenantSortKey} currentDir={tenantSortDir} onSort={toggleTenantSort} className="text-end" />
                              <SortTh label="Cost" sortKey="cost" currentKey={tenantSortKey} currentDir={tenantSortDir} onSort={toggleTenantSort} className="text-end" />
                            </tr>
                          </thead>
                          <tbody>
                            {sortedTenants.map((row) => (
                              <tr key={row.tenantId}>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{row.name || row.tenantId}</div>
                                  <div className="text-muted" style={{ fontSize: "0.75em" }}>
                                    {row.tenantId}
                                    {row.plan ? ` · ${row.plan}` : ""}
                                  </div>
                                </td>
                                <td className="text-end">{fmtInt(row.requests)}</td>
                                <td className="text-end">{fmtInt(row.tokens)}</td>
                                <td className="text-end">{row.cost ? `$${fmtMoney(row.cost)}` : "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-xl-6">
                  <div className="dash-card h-100">
                    <h3 className="dash-card-title mb-3">By feature</h3>
                    {sortedFeatures.length === 0 ? (
                      <EmptyState
                        icon={<FaRobot />}
                        title="No feature usage yet"
                        message="Use quiz generation, AI grading, or tutoring to populate feature analytics."
                      />
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.85em" }}>
                          <thead>
                            <tr>
                              <th>Feature</th>
                              <SortTh label="Requests" sortKey="requests" currentKey={featureSortKey} currentDir={featureSortDir} onSort={toggleFeatureSort} className="text-end" />
                              <SortTh label="Tokens" sortKey="tokens" currentKey={featureSortKey} currentDir={featureSortDir} onSort={toggleFeatureSort} className="text-end" />
                              <SortTh label="Cost" sortKey="cost" currentKey={featureSortKey} currentDir={featureSortDir} onSort={toggleFeatureSort} className="text-end" />
                            </tr>
                          </thead>
                          <tbody>
                            {sortedFeatures.map((row) => (
                              <tr key={row.feature || `${row.feature}-${row.requests}`}>
                                <td style={{ fontWeight: 600 }}>{row.feature || "-"}</td>
                                <td className="text-end">{fmtInt(row.requests)}</td>
                                <td className="text-end">{fmtInt(row.tokens)}</td>
                                <td className="text-end">{row.cost ? `$${fmtMoney(row.cost)}` : "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
