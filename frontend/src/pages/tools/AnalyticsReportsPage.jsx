// src/pages/tools/AnalyticsReportsPage.jsx
import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api from "../../services/api/api.js";

import "../../components/styles/admin-tools.css";

export default function AnalyticsReportsPage() {
  const [range, setRange] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [summary, setSummary] = useState({
    avgScore: 0,
    aiGraded: 0,
    aiRequests: 0,
    teacherActive: 0,
  });

  async function load() {
    setLoading(true);
    try {
      const data = await api.admin.getAnalyticsSummary({ range });

      const next = data?.summary ||
        data?.data ||
        data || {
          avgScore: 0,
          aiGraded: 0,
          aiRequests: 0,
          teacherActive: 0,
        };

      setSummary((prev) => ({ ...prev, ...next }));
    } catch (e) {
      toast.error(e?.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }

  function downloadBlob(blob, filename) {
    try {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
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
    } catch (e) {
      toast.error(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  return (
    <div className="admin-shell">
      <div className="admin-content">
        <div className="admin-title">Analytics & Reports</div>

        <div className="card">
          <div className="card-inner">
            <div className="toolbar" style={{ gap: 10, flexWrap: "wrap" }}>
              <select
                className="select"
                value={range}
                onChange={(e) => setRange(e.target.value)}
                disabled={loading || exporting}
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>

              <button
                className="btn-gold"
                onClick={load}
                disabled={loading || exporting}
              >
                {loading ? "Loading..." : "Refresh"}
              </button>

              <button
                className="btn-ghost"
                onClick={() => onExport("performance")}
                disabled={loading || exporting}
                title="Download CSV export"
              >
                {exporting ? "Exporting..." : "Export Performance"}
              </button>

              <button
                className="btn-ghost"
                onClick={() => onExport("ai-usage")}
                disabled={loading || exporting}
                title="Download CSV export"
              >
                {exporting ? "Exporting..." : "Export AI Usage"}
              </button>
            </div>

            {loading ? (
              <div>Loading...</div>
            ) : (
              <div
                className="grid-kpis"
                style={{ gridTemplateColumns: "repeat(4, minmax(220px, 1fr))" }}
              >
                <div className="card">
                  <div className="card-inner">
                    <div className="kpi-title">Avg Score</div>
                    <div className="kpi-value">{summary.avgScore}%</div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-inner">
                    <div className="kpi-title">AI Graded</div>
                    <div className="kpi-value">{summary.aiGraded}</div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-inner">
                    <div className="kpi-title">AI Requests</div>
                    <div className="kpi-value">{summary.aiRequests}</div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-inner">
                    <div className="kpi-title">Active Teachers</div>
                    <div className="kpi-value">{summary.teacherActive}</div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
