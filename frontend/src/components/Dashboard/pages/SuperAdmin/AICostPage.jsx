// AICostPage — SuperAdmin AI usage & cost overview
import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../../../services/api/api.js";
import LoadingSpinner from "../../components/ui/LoadingSpinner.jsx";
import EmptyState from "../../components/ui/EmptyState.jsx";

const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const fmtInt = (v) => new Intl.NumberFormat().format(Math.round(n(v)));
const fmtMoney = (v) =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n(v));
const fmtPct = (v) => `${Math.round(n(v) * 100)}%`;
const fmtMs = (v) => `${Math.round(n(v))} ms`;

const RANGES = [
  { value: "24h", label: "Last 24 h" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function errMsg(e, fallback) {
  return e?.response?.data?.message || e?.response?.data?.error || e?.message || fallback;
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="dash-card py-3 px-4">
      <div className="text-muted" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-heading)", lineHeight: 1.2 }}>{value}</div>
      {sub && <div className="text-muted" style={{ fontSize: "0.75rem", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function sortRows(rows, key, dir) {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a?.[key], bv = b?.[key];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * mul;
    return String(av ?? "").localeCompare(String(bv ?? "")) * mul;
  });
}

function SortTh({ label, sortKey, currentKey, currentDir, onSort }) {
  const active = currentKey === sortKey;
  return (
    <th
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => onSort(sortKey)}
    >
      {label}{" "}
      {active ? (currentDir === "desc" ? "↓" : "↑") : <span style={{ opacity: 0.3 }}>↕</span>}
    </th>
  );
}

export default function AICostPage() {
  const [tab, setTab] = useState("requests");
  const [range, setRange] = useState("7d");

  // Tenants for filter
  const [tenants, setTenants] = useState([]);
  const [tenantFilter, setTenantFilter] = useState("");

  // Requests
  const [reqLoading, setReqLoading] = useState(true);
  const [reqError, setReqError] = useState("");
  const [reqSummary, setReqSummary] = useState(null);
  const [reqRows, setReqRows] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [cacheHit, setCacheHit] = useState("");
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(1);
  const skip = useMemo(() => (page - 1) * limit, [page, limit]);

  // Cost
  const [costLoading, setCostLoading] = useState(true);
  const [costError, setCostError] = useState("");
  const [byTenant, setByTenant] = useState([]);
  const [byFeature, setByFeature] = useState([]);
  const [tenantSortKey, setTenantSortKey] = useState("cost");
  const [tenantSortDir, setTenantSortDir] = useState("desc");
  const [featureSortKey, setFeatureSortKey] = useState("cost");
  const [featureSortDir, setFeatureSortDir] = useState("desc");

  useEffect(() => {
    api.admin.listTenants().then((res) => {
      setTenants(Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : []);
    }).catch(() => {});
  }, []);

  const reqTotals = useMemo(() => {
    // backend returns { summary: {...} } or { totals: {...} }
    const t = reqSummary?.totals || reqSummary?.summary || {};
    return {
      requests: n(t.requests),
      totalTokens: n(t.totalTokens ?? t.tokens),
      avgLatencyMs: n(t.avgLatencyMs),
      cacheHitRate: n(t.cacheHitRate),
    };
  }, [reqSummary]);

  const costTotals = useMemo(() => {
    const rows = tenantFilter ? byTenant.filter((r) => r.tenantId === tenantFilter) : byTenant;
    return {
      tokens: rows.reduce((a, r) => a + n(r.tokens), 0),
      cost: rows.reduce((a, r) => a + n(r.cost), 0),
      requests: rows.reduce((a, r) => a + n(r.requests), 0),
    };
  }, [byTenant, tenantFilter]);

  const sortedTenants = useMemo(() => {
    const rows = tenantFilter ? byTenant.filter((r) => r.tenantId === tenantFilter) : byTenant;
    return sortRows(rows, tenantSortKey, tenantSortDir);
  }, [byTenant, tenantFilter, tenantSortKey, tenantSortDir]);

  const sortedFeatures = useMemo(
    () => sortRows(byFeature, featureSortKey, featureSortDir),
    [byFeature, featureSortKey, featureSortDir],
  );

  const fetchRequests = useCallback(async () => {
    setReqLoading(true);
    setReqError("");
    try {
      const params = { range, limit, skip };
      if (q.trim()) params.q = q.trim();
      if (statusFilter) params.status = statusFilter;
      if (provider) params.provider = provider;
      if (model) params.model = model;
      if (cacheHit) params.cacheHit = cacheHit;
      if (tenantFilter) params.tenantId = tenantFilter;

      const [summary, list] = await Promise.all([
        api.admin.getAiRequestsSummary({ range }),
        api.admin.listAiRequests(params),
      ]);

      setReqSummary(summary || null);
      setReqRows(Array.isArray(list?.items) ? list.items : Array.isArray(list) ? list : []);
    } catch (e) {
      setReqError(errMsg(e, "Unable to load AI requests."));
      setReqRows([]);
      setReqSummary(null);
    } finally {
      setReqLoading(false);
    }
  }, [range, limit, skip, q, statusFilter, provider, model, cacheHit, tenantFilter]);

  const fetchCost = useCallback(async () => {
    setCostLoading(true);
    setCostError("");
    try {
      const data = await api.admin.getAICost({ range });
      setByTenant(Array.isArray(data?.byTenant) ? data.byTenant : []);
      setByFeature(Array.isArray(data?.byFeature) ? data.byFeature : []);
    } catch (e) {
      setCostError(errMsg(e, "Unable to load AI cost data."));
      setByTenant([]);
      setByFeature([]);
    } finally {
      setCostLoading(false);
    }
  }, [range]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);
  useEffect(() => { fetchCost(); }, [fetchCost]);
  useEffect(() => { setPage(1); }, [q, statusFilter, provider, model, cacheHit, tenantFilter]);

  const toggleTenantSort = (key) => {
    if (tenantSortKey !== key) { setTenantSortKey(key); setTenantSortDir("desc"); }
    else setTenantSortDir((d) => d === "desc" ? "asc" : "desc");
  };
  const toggleFeatureSort = (key) => {
    if (featureSortKey !== key) { setFeatureSortKey(key); setFeatureSortDir("desc"); }
    else setFeatureSortDir((d) => d === "desc" ? "asc" : "desc");
  };

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h2>AI Usage &amp; Cost</h2>
          <p className="text-muted mb-0">Requests, tokens, latency, cache rate and cost breakdown across tenants.</p>
        </div>
        <button
          className="btn btn-outline-light"
          type="button"
          onClick={() => { fetchRequests(); fetchCost(); }}
        >
          Refresh
        </button>
      </div>

      {/* Controls bar */}
      <div className="dash-card mb-4">
        <div className="d-flex flex-wrap gap-3 align-items-center">
          <div className="d-flex align-items-center gap-2">
            <label className="text-muted mb-0" style={{ fontSize: "0.85em" }}>Range</label>
            <select className="form-select" style={{ width: "auto" }} value={range} onChange={(e) => setRange(e.target.value)}>
              {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="d-flex align-items-center gap-2">
            <label className="text-muted mb-0" style={{ fontSize: "0.85em" }}>Tenant</label>
            <select className="form-select" style={{ width: "auto", minWidth: 180 }} value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)}>
              <option value="">All tenants</option>
              {tenants.map((t) => <option key={t._id} value={t.tenantId}>{t.name || t.tenantId}</option>)}
            </select>
          </div>
          <div className="ms-auto d-flex gap-2">
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
              Cost
            </button>
          </div>
        </div>
      </div>

      {/* Requests tab */}
      {tab === "requests" && (
        <>
          <div className="row g-3 mb-4">
            <div className="col-6 col-md-3">
              <SummaryCard label="Requests" value={fmtInt(reqTotals.requests)} />
            </div>
            <div className="col-6 col-md-3">
              <SummaryCard label="Total tokens" value={fmtInt(reqTotals.totalTokens)} />
            </div>
            <div className="col-6 col-md-3">
              <SummaryCard label="Avg latency" value={fmtMs(reqTotals.avgLatencyMs)} />
            </div>
            <div className="col-6 col-md-3">
              <SummaryCard label="Cache hit rate" value={fmtPct(reqTotals.cacheHitRate)} />
            </div>
          </div>

          <div className="dash-card mb-3">
            <div className="row g-2">
              <div className="col-md-3">
                <input className="form-control" placeholder="Search request text…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="col-md-2">
                <input className="form-control" placeholder="Provider…" value={provider} onChange={(e) => setProvider(e.target.value)} />
              </div>
              <div className="col-md-2">
                <input className="form-control" placeholder="Model…" value={model} onChange={(e) => setModel(e.target.value)} />
              </div>
              <div className="col-md-2">
                <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="ok">ok</option>
                  <option value="error">error</option>
                </select>
              </div>
              <div className="col-md-2">
                <select className="form-select" value={cacheHit} onChange={(e) => setCacheHit(e.target.value)}>
                  <option value="">Cache — any</option>
                  <option value="true">Cache hit</option>
                  <option value="false">Cache miss</option>
                </select>
              </div>
              <div className="col-md-1">
                <select className="form-select" value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>

          {reqError && (
            <div className="alert alert-danger mb-3">{reqError}</div>
          )}

          <div className="dash-card">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3 className="dash-card-title mb-0">Latest requests</h3>
              <div className="d-flex gap-2 align-items-center">
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
                <span className="text-muted" style={{ fontSize: "0.85em" }}>Page {page}</span>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPage((p) => p + 1)} disabled={reqRows.length < limit}>Next</button>
              </div>
            </div>

            {reqLoading ? (
              <LoadingSpinner message="Loading requests…" />
            ) : reqRows.length === 0 ? (
              <EmptyState title="No requests found" message="Try adjusting your filters or date range." />
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.85em" }}>
                  <thead>
                    <tr>
                      <th>Updated</th>
                      <th>Provider</th>
                      <th>Model</th>
                      <th>Status</th>
                      <th className="text-end">Tokens</th>
                      <th className="text-end">Latency</th>
                      <th>Cache</th>
                      <th>Request</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reqRows.map((r) => (
                      <tr key={r._id}>
                        <td style={{ whiteSpace: "nowrap" }}>{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : "—"}</td>
                        <td>{r.provider || "—"}</td>
                        <td>{r.model || "—"}</td>
                        <td>
                          <span className={`badge ${r.lastStatus === "error" ? "bg-danger" : "bg-success"}`}>
                            {r.lastStatus || "—"}
                          </span>
                        </td>
                        <td className="text-end">{fmtInt(r.totalTokens)}</td>
                        <td className="text-end">{fmtMs(r.totalLatencyMs)}</td>
                        <td>
                          <span className={`badge ${r.cacheHit ? "bg-primary" : "bg-secondary"}`}>
                            {r.cacheHit ? "hit" : "miss"}
                          </span>
                        </td>
                        <td style={{ maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r?.payload?.requestText || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Cost tab */}
      {tab === "cost" && (
        <>
          <div className="row g-3 mb-4">
            <div className="col-6 col-md-4">
              <SummaryCard label="Total requests" value={fmtInt(costTotals.requests)} sub={tenantFilter ? "filtered tenant" : "all tenants"} />
            </div>
            <div className="col-6 col-md-4">
              <SummaryCard label="Total tokens" value={fmtInt(costTotals.tokens)} sub={tenantFilter ? "filtered tenant" : "all tenants"} />
            </div>
            <div className="col-6 col-md-4">
              <SummaryCard label="Estimated cost" value={`$${fmtMoney(costTotals.cost)}`} sub={tenantFilter ? "filtered tenant" : "sum of all tenants"} />
            </div>
          </div>

          {costError && (
            <div className="alert alert-danger mb-3">{costError}</div>
          )}

          {costLoading ? (
            <LoadingSpinner message="Loading cost data…" />
          ) : (
            <div className="row g-4">
              <div className="col-xl-6">
                <div className="dash-card">
                  <h3 className="dash-card-title mb-3">By tenant</h3>
                  {sortedTenants.length === 0 ? (
                    <EmptyState title="No data" message="No cost data for this range." />
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.85em" }}>
                        <thead>
                          <tr>
                            <th>Tenant</th>
                            <SortTh label="Requests" sortKey="requests" currentKey={tenantSortKey} currentDir={tenantSortDir} onSort={toggleTenantSort} />
                            <SortTh label="Tokens" sortKey="tokens" currentKey={tenantSortKey} currentDir={tenantSortDir} onSort={toggleTenantSort} />
                            <SortTh label="Cost" sortKey="cost" currentKey={tenantSortKey} currentDir={tenantSortDir} onSort={toggleTenantSort} />
                          </tr>
                        </thead>
                        <tbody>
                          {sortedTenants.map((r) => (
                            <tr key={r.tenantId}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{r.name || "—"}</div>
                                <div className="text-muted" style={{ fontSize: "0.75em" }}>{r.tenantId}</div>
                              </td>
                              <td className="text-end">{fmtInt(r.requests)}</td>
                              <td className="text-end">{fmtInt(r.tokens)}</td>
                              <td className="text-end">${fmtMoney(r.cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              <div className="col-xl-6">
                <div className="dash-card">
                  <h3 className="dash-card-title mb-3">By feature</h3>
                  {sortedFeatures.length === 0 ? (
                    <EmptyState title="No data" message="No feature cost data for this range." />
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0" style={{ fontSize: "0.85em" }}>
                        <thead>
                          <tr>
                            <th>Feature</th>
                            <SortTh label="Requests" sortKey="requests" currentKey={featureSortKey} currentDir={featureSortDir} onSort={toggleFeatureSort} />
                            <SortTh label="Tokens" sortKey="tokens" currentKey={featureSortKey} currentDir={featureSortDir} onSort={toggleFeatureSort} />
                            <SortTh label="Cost" sortKey="cost" currentKey={featureSortKey} currentDir={featureSortDir} onSort={toggleFeatureSort} />
                          </tr>
                        </thead>
                        <tbody>
                          {sortedFeatures.map((r) => (
                            <tr key={r.feature || `${r.feature}-${r.tokens}`}>
                              <td style={{ fontWeight: 600 }}>{r.feature || "—"}</td>
                              <td className="text-end">{fmtInt(r.requests)}</td>
                              <td className="text-end">{fmtInt(r.tokens)}</td>
                              <td className="text-end">${fmtMoney(r.cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
