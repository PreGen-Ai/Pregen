import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import { useAuthContext } from "../../../context/AuthContext.js";
import api from "../../../services/api/api.js";
import useActiveTenantScope from "../hooks/useActiveTenantScope.js";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";
import {
  formatMetricValue,
  metricDescription,
} from "../../../utils/analyticsState.js";

const fmtInt = (value) => new Intl.NumberFormat().format(Number(value || 0));
const fmtPct = (value) => `${Math.round(Number(value || 0))}%`;

function SummaryCard({ title, metric, formatter, fallback }) {
  const isEmpty = metric?.value === null || metric?.value === undefined;

  return (
    <div className="dash-card py-3 h-100">
      <div className="dash-muted-label">{title}</div>
      <div
        className={`dash-metric-value ${isEmpty ? "is-empty" : ""}`}
        style={{ marginTop: 6 }}
      >
        {formatMetricValue(metric, formatter, fallback)}
      </div>
      <div className="dash-supporting-text mt-2">
        {metricDescription(metric, fallback)}
      </div>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const { user } = useAuthContext() || {};
  const navigate = useNavigate();
  const isSuperAdmin = String(user?.role || "").toUpperCase() === "SUPERADMIN";
  const institutionName =
    user?.tenantName || user?.institutionName || user?.tenantId || "";
  const { tenantId: activeTenantId, tenantName: activeTenantName } =
    useActiveTenantScope();

  const [range, setRange] = useState("7d");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [payload, setPayload] = useState(null);

  const schoolLabel =
    activeTenantName || activeTenantId || institutionName || "your school";

  const load = useCallback(async () => {
    if (isSuperAdmin && !activeTenantId) {
      setPayload(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await api.admin.getAnalyticsSummary({ range });
      setPayload(data || null);
    } catch (error) {
      toast.error(error?.message || "Failed to load school analytics");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, isSuperAdmin, range]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadBlob = (blob, filename) => {
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
  };

  const onExport = async (type) => {
    if (exporting) return;

    try {
      setExporting(true);
      const blob = await api.admin.exportAnalytics(type, { range });
      downloadBlob(blob, `${type}-${range}.csv`);
      toast.success("Export ready");
    } catch (error) {
      toast.error(error?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const summary = payload?.summary || {};

  return (
    <div className="quizzes-page">
      <div className="dash-page-header">
        <div>
          <div className="dash-page-kicker">School Scope</div>
          <h2 className="dash-page-title">School Analytics</h2>
          <p className="dash-page-subtitle">
            Understand activity, grading coverage, and AI usage for{" "}
            <strong>{schoolLabel}</strong>. Metrics that have no telemetry yet
            are labeled clearly instead of rendering as misleading zeros.
          </p>
        </div>
        <div className="dash-page-actions">
          <select
            className="form-select"
            style={{ minWidth: 150 }}
            value={range}
            onChange={(event) => setRange(event.target.value)}
            disabled={loading || exporting}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={load}
            disabled={loading || exporting}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {isSuperAdmin ? (
        <div
          className={`tenant-scope-banner mb-4 ${
            activeTenantId ? "scope-tenant" : "scope-global"
          }`}
        >
          <span>
            {activeTenantId ? (
              <>
                Viewing school analytics for <strong>{schoolLabel}</strong>.
                Use Schools to change the selected school.
              </>
            ) : (
              <>
                Choose a school before opening school-scoped analytics or
                exports.
              </>
            )}
          </span>
          {!activeTenantId ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary ms-auto"
              onClick={() => navigate("/dashboard/superadmin/tenants")}
            >
              Choose a School
            </button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <LoadingSpinner message="Loading school analytics..." />
      ) : isSuperAdmin && !activeTenantId ? (
        <div className="dash-card dash-empty-shell">
          <h3 className="dash-card-title mb-2">No school selected</h3>
          <p className="dash-supporting-text mb-0">
            School analytics is intentionally tenant-scoped for superadmins.
            Select a school from the Schools page, then return here to review
            grading coverage and AI activity for that school only.
          </p>
        </div>
      ) : (
        <>
          <div className="row g-3 mb-4">
            <div className="col-12 col-sm-6 col-xl-3">
              <SummaryCard
                title="Average Score"
                metric={summary.avgScore}
                formatter={fmtPct}
                fallback="No grading data yet"
              />
            </div>
            <div className="col-12 col-sm-6 col-xl-3">
              <SummaryCard
                title="AI-Graded Submissions"
                metric={summary.aiGraded}
                formatter={fmtInt}
                fallback="No AI grading activity yet"
              />
            </div>
            <div className="col-12 col-sm-6 col-xl-3">
              <SummaryCard
                title="AI Requests"
                metric={summary.aiRequests}
                formatter={fmtInt}
                fallback="No AI activity yet"
              />
            </div>
            <div className="col-12 col-sm-6 col-xl-3">
              <SummaryCard
                title="Active Teachers"
                metric={summary.activeTeachers}
                formatter={fmtInt}
                fallback="No teacher activity in this range"
              />
            </div>
          </div>

          <div className="dash-card mb-4">
            <div className="dash-muted-label">Metric Notes</div>
            <p className="dash-supporting-text mb-0" style={{ marginTop: 8 }}>
              Active teachers reflect recent teacher activity during the chosen
              time range, not the total number of teacher accounts. That keeps
              the metric trustworthy when a school has dormant or newly created
              teacher records.
            </p>
          </div>

          <div className="dash-card">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
              <div>
                <h3 className="dash-card-title mb-1">Exports</h3>
                <div className="dash-supporting-text">
                  Download school-scoped CSV exports for operational review.
                </div>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onExport("performance")}
                  disabled={exporting}
                >
                  {exporting ? "Exporting..." : "Export Performance"}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => onExport("ai-usage")}
                  disabled={exporting}
                >
                  {exporting ? "Exporting..." : "Export AI Usage"}
                </button>
              </div>
            </div>
            {payload?.generatedAt ? (
              <div className="dash-supporting-text mt-3">
                Last updated: {new Date(payload.generatedAt).toLocaleString()}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
