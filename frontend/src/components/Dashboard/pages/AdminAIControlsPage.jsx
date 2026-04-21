import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import { useAuthContext } from "../../../context/AuthContext.js";
import api from "../../../services/api/api.js";
import useActiveTenantScope from "../hooks/useActiveTenantScope.js";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";

const DEFAULTS = {
  enabled: true,
  feedbackTone: "neutral",
  softCapDaily: 50000,
  softCapWeekly: 250000,
  features: {
    aiGrading: true,
    aiQuizGen: true,
    aiTutor: true,
    aiSummaries: true,
  },
};

const FEATURES = [
  {
    key: "aiGrading",
    label: "AI Grading",
    desc: "Allow teachers to use AI-assisted grading and draft feedback.",
  },
  {
    key: "aiQuizGen",
    label: "AI Quiz Generation",
    desc: "Allow teachers to generate quiz questions with AI.",
  },
  {
    key: "aiTutor",
    label: "AI Tutor",
    desc: "Enable the study assistant for students and teachers.",
  },
  {
    key: "aiSummaries",
    label: "AI Summaries",
    desc: "Allow AI summaries for uploaded and authored lesson materials.",
  },
];

function mergeSettings(raw) {
  return {
    ...DEFAULTS,
    ...raw,
    features: { ...DEFAULTS.features, ...(raw?.features || {}) },
  };
}

function stableStringify(value) {
  return JSON.stringify(value, Object.keys(value || {}).sort());
}

export default function AdminAIControlsPage() {
  const { user } = useAuthContext() || {};
  const navigate = useNavigate();
  const isSuperAdmin = String(user?.role || "").toUpperCase() === "SUPERADMIN";
  const institutionName =
    user?.tenantName || user?.institutionName || user?.tenantId || "";
  const { tenantId: activeTenantId, tenantName: activeTenantName } =
    useActiveTenantScope();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(DEFAULTS);
  const [baseline, setBaseline] = useState(DEFAULTS);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  const baselineRef = useRef(stableStringify(DEFAULTS));
  const schoolLabel =
    activeTenantName || activeTenantId || institutionName || "your school";

  useEffect(() => {
    baselineRef.current = stableStringify(baseline);
  }, [baseline]);

  const isDirty = useMemo(
    () => stableStringify(settings) !== baselineRef.current,
    [settings],
  );

  const weeklyIsLower = useMemo(() => {
    return (
      Number(settings.softCapDaily || 0) > 0 &&
      Number(settings.softCapWeekly || 0) > 0 &&
      Number(settings.softCapWeekly) < Number(settings.softCapDaily)
    );
  }, [settings.softCapDaily, settings.softCapWeekly]);

  const load = useCallback(async () => {
    if (isSuperAdmin && !activeTenantId) {
      setSettings(DEFAULTS);
      setBaseline(DEFAULTS);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await api.admin.getAiSettings();
      const merged = mergeSettings(res?.settings || {});
      setSettings(merged);
      setBaseline(merged);
      setLastSavedAt(null);
    } catch (e) {
      toast.error(e?.message || "Failed to load school AI controls");
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, isSuperAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const setField = (key, value) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const setFeature = (key, value) =>
    setSettings((prev) => ({
      ...prev,
      features: { ...prev.features, [key]: value },
    }));

  const save = async () => {
    if (saving || !isDirty) return;

    if (weeklyIsLower) {
      toast.error(
        "Weekly token soft cap must be greater than or equal to the daily soft cap.",
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...settings,
        softCapDaily: Number(settings.softCapDaily || 0),
        softCapWeekly: Number(settings.softCapWeekly || 0),
      };
      const res = await api.admin.updateAiSettings(payload);
      const merged = mergeSettings(res?.settings || payload);
      setSettings(merged);
      setBaseline(merged);
      setLastSavedAt(new Date());
      toast.success("School AI controls saved");
    } catch (e) {
      toast.error(e?.message || "Failed to save school AI controls");
    } finally {
      setSaving(false);
    }
  };

  const resetChanges = () => {
    setSettings(baseline);
    toast.info("Unsaved changes were reset");
  };

  if (loading) return <LoadingSpinner message="Loading school AI controls..." />;

  return (
    <div className="quizzes-page">
      <div className="dash-page-header">
        <div>
          <div className="dash-page-kicker">School Scope</div>
          <h2 className="dash-page-title">School AI Controls</h2>
          <p className="dash-page-subtitle">
            Configure AI access, feedback tone, and usage warnings for{" "}
            <strong>{schoolLabel}</strong>.
          </p>
        </div>
        <div className="dash-page-actions">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={load}
            disabled={saving}
          >
            Reload from Server
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={saving || !isDirty}
          >
            {saving ? "Saving..." : "Save School Controls"}
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
                Changes apply only to <strong>{schoolLabel}</strong> and do not
                change platform defaults.
              </>
            ) : (
              <>
                Choose a school before editing school-scoped AI controls.
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

      {isSuperAdmin && !activeTenantId ? (
        <div className="dash-card dash-empty-shell">
          <h3 className="dash-card-title mb-2">No school selected</h3>
          <p className="dash-supporting-text mb-0">
            School AI controls are intentionally separated from platform AI
            controls. Select a school from the Schools page, then return here to
            manage local overrides such as feature access and soft caps.
          </p>
        </div>
      ) : (
        <>
          <div className="dash-card mb-4">
            <div className="row g-4">
              <div className="col-lg-6">
                <div className="form-check form-switch mb-4">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="school-ai-enabled"
                    checked={!!settings.enabled}
                    onChange={(e) => setField("enabled", e.target.checked)}
                  />
                  <label
                    className="form-check-label fw-semibold"
                    htmlFor="school-ai-enabled"
                  >
                    AI features enabled for this school
                  </label>
                  <div className="form-text">
                    Turn this off to pause AI tools at the school level without
                    changing platform defaults.
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold">Feedback tone</label>
                  <select
                    className="form-select"
                    value={settings.feedbackTone}
                    onChange={(e) => setField("feedbackTone", e.target.value)}
                  >
                    <option value="strict">Strict</option>
                    <option value="neutral">Neutral</option>
                    <option value="encouraging">Encouraging</option>
                  </select>
                  <div className="form-text">
                    Default tone used when AI drafts feedback for teachers.
                  </div>
                </div>
              </div>

              <div className="col-lg-6">
                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    Daily token soft cap
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    step={1000}
                    value={settings.softCapDaily}
                    onChange={(e) =>
                      setField("softCapDaily", Number(e.target.value || 0))
                    }
                  />
                  <div className="form-text">
                    Warning threshold only. This does not hard-block requests.
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    Weekly token soft cap
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    min={0}
                    step={1000}
                    value={settings.softCapWeekly}
                    onChange={(e) =>
                      setField("softCapWeekly", Number(e.target.value || 0))
                    }
                  />
                  <div className="form-text">
                    Keep this greater than or equal to the daily threshold.
                  </div>
                </div>

                {weeklyIsLower ? (
                  <div className="alert alert-danger mb-0">
                    Weekly token soft cap is lower than the daily soft cap.
                    Saving is blocked until that is corrected.
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="dash-card mb-4">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
              <div>
                <h3 className="dash-card-title mb-1">Feature Access</h3>
                <div className="dash-supporting-text">
                  These toggles control what staff and learners can use inside
                  this school.
                </div>
              </div>
              <div className="d-flex flex-wrap align-items-center gap-2">
                <span className={`badge ${isDirty ? "bg-warning text-dark" : "bg-success"}`}>
                  {isDirty ? "Unsaved changes" : "Saved"}
                </span>
                {lastSavedAt ? (
                  <span className="dash-supporting-text">
                    Last saved: {lastSavedAt.toLocaleString()}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="row g-3">
              {FEATURES.map(({ key, label, desc }) => (
                <div key={key} className="col-md-6">
                  <div className="dash-surface-panel h-100">
                    <div className="form-check form-switch mb-0">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`school-feature-${key}`}
                        checked={!!settings.features?.[key]}
                        onChange={(e) => setFeature(key, e.target.checked)}
                        disabled={!settings.enabled}
                      />
                      <label
                        className="form-check-label fw-semibold"
                        htmlFor={`school-feature-${key}`}
                      >
                        {label}
                      </label>
                    </div>
                    <p className="dash-supporting-text mb-0 mt-2">{desc}</p>
                    {!settings.enabled ? (
                      <div className="dash-inline-note mt-3">
                        Disabled by the school-wide AI master switch.
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="dash-card">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
              <div>
                <h3 className="dash-card-title mb-1">Review Before Saving</h3>
                <div className="dash-supporting-text">
                  Use Reset to discard local edits. Reload pulls the latest saved
                  state from the server for this school.
                </div>
              </div>
              <div className="d-flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={resetChanges}
                  disabled={!isDirty || saving}
                >
                  Reset Changes
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={save}
                  disabled={!isDirty || saving}
                >
                  {saving ? "Saving..." : "Save School Controls"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
