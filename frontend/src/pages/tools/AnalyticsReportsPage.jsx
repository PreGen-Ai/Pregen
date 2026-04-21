import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";

import api from "../../services/api/api.js";
import { formatMetricValue, metricDescription } from "../../utils/analyticsState.js";

import "../../components/styles/admin-tools.css";

const fmtInt = (value) => new Intl.NumberFormat().format(Number(value || 0));
const fmtPct = (value) => `${Math.round(Number(value || 0))}%`;

function MetricCard({ title, metric, formatter, fallback }) {
  const empty = metric?.value === null || metric?.value === undefined;

  return (
    <div className="card">
      <div className="card-inner">
        <div className="kpi-title">{title}</div>
        <div
          className="kpi-value"
          style={{ fontSize: empty ? "1.15rem" : undefined, color: empty ? "var(--text-muted)" : undefined }}
        >
          {formatMetricValue(metric, formatter, fallback)}
        </div>
        <div className="text-muted" style={{ fontSize: "0.82rem", marginTop: 8 }}>
          {metricDescription(metric, fallback)}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsReportsPage() {
  const [range, setRange] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [payload, setPayload] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.admin.getAnalyticsSummary({ range });
      setPayload(data || null);
    } catch (error) {
      toast.error(error?.message || "Failed to load analytics");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }

  function downloadBlob(blob, filename) {
    try {
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Download failed");
    }
  }

  async function onExport(type) {
    if (exporting) return;

    try {
      setExporting(true);
      const blob = await api.admin.exportAnalytics(type, { range });
      const safeType = String(type || "export").replace(/[^a-z0-9-_]/gi, "_");
      downloadBlob(blob, `${safeType}-${range}.csv`);
      toast.success("Export ready");
    } catch (error) {
      toast.error(error?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const summary = payload?.summary || {};

  return (
    <div className="admin-shell">
      <div className="admin-content">
        <div className="admin-title">Analytics and Reports</div>

        <div className="card">
          <div className="card-inner">
            <div className="toolbar" style={{ gap: 10, flexWrap: "wrap" }}>
              <select className="select" value={range} onChange={(event) => setRange(event.target.value)} disabled={loading || exporting}>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>

              <button className="btn-gold" onClick={load} disabled={loading || exporting}>
                {loading ? "Loading..." : "Refresh"}
              </button>

              <button className="btn-ghost" onClick={() => onExport("performance")} disabled={loading || exporting} title="Download CSV export">
                {exporting ? "Exporting..." : "Export Performance"}
              </button>

              <button className="btn-ghost" onClick={() => onExport("ai-usage")} disabled={loading || exporting} title="Download CSV export">
                {exporting ? "Exporting..." : "Export AI Usage"}
              </button>

              {payload?.generatedAt ? (
                <div className="text-muted" style={{ marginLeft: "auto", fontSize: "0.82rem" }}>
                  Last updated: {new Date(payload.generatedAt).toLocaleString()}
                </div>
              ) : null}
            </div>

            {loading ? (
              <div>Loading...</div>
            ) : (
              <>
                <div className="grid-kpis" style={{ gridTemplateColumns: "repeat(4, minmax(220px, 1fr))" }}>
                  <MetricCard title="Avg Score" metric={summary.avgScore} formatter={fmtPct} fallback="No grading data yet" />
                  <MetricCard title="AI Graded" metric={summary.aiGraded} formatter={fmtInt} fallback="No AI grading activity yet" />
                  <MetricCard title="AI Requests" metric={summary.aiRequests} formatter={fmtInt} fallback="No AI activity yet" />
                  <MetricCard title="Active Teachers" metric={summary.activeTeachers} formatter={fmtInt} fallback="No teacher activity in this range" />
                </div>

                <div className="text-muted mt-3" style={{ fontSize: "0.85rem" }}>
                  Active teachers are derived from recent teacher account activity rather than total teacher count so the signal stays less misleading for admins.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
