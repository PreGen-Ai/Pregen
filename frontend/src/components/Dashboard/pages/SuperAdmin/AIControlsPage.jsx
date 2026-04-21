import React, { useCallback, useEffect, useState } from "react";
import { FaBuilding, FaGlobe } from "react-icons/fa";
import { toast } from "react-toastify";

import api from "../../../../services/api/api.js";
import LoadingSpinner from "../../components/ui/LoadingSpinner.jsx";

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
    desc: "Auto-grade quiz and assignment submissions using AI.",
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
    desc: "Allow AI summaries for lesson materials on demand.",
  },
];

function mergeSettings(raw) {
  return {
    ...DEFAULTS,
    ...raw,
    features: { ...DEFAULTS.features, ...(raw?.features || {}) },
  };
}

export default function AIControlsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(DEFAULTS);
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");

  const selectedTenant = tenants.find((tenant) => tenant.tenantId === selectedTenantId);
  const isGlobal = !selectedTenantId;
  const tenantLabel = selectedTenant?.name || selectedTenantId;

  useEffect(() => {
    api.admin
      .listTenants()
      .then((response) => {
        setTenants(Array.isArray(response?.items) ? response.items : []);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const config = selectedTenantId
        ? { headers: { "x-tenant-id": selectedTenantId } }
        : undefined;
      const response = await api.admin.getAiSettings(config);
      setSettings(mergeSettings(response?.settings || {}));
    } catch (e) {
      toast.error(e?.message || "Failed to load platform AI controls");
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const config = selectedTenantId
        ? { headers: { "x-tenant-id": selectedTenantId } }
        : undefined;
      await api.admin.updateAiSettings(settings, config);
      toast.success(
        isGlobal
          ? "Platform AI defaults saved"
          : `AI override saved for ${tenantLabel}`,
      );
    } catch (e) {
      toast.error(e?.message || "Failed to save platform AI controls");
    } finally {
      setSaving(false);
    }
  };

  const resetToPlatformDefaults = async () => {
    if (!selectedTenantId) return;
    if (
      !window.confirm(
        `Reset AI settings for "${tenantLabel}" to the current platform defaults?`,
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const response = await api.admin.getAiSettings();
      const globalSettings = mergeSettings(response?.settings || {});
      await api.admin.updateAiSettings(globalSettings, {
        headers: { "x-tenant-id": selectedTenantId },
      });
      setSettings(globalSettings);
      toast.success("School override reset to platform defaults");
    } catch (e) {
      toast.error(e?.message || "Failed to reset override");
    } finally {
      setSaving(false);
    }
  };

  const setField = (key, value) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const setFeature = (key, value) =>
    setSettings((prev) => ({
      ...prev,
      features: { ...prev.features, [key]: value },
    }));

  return (
    <div className="quizzes-page">
      <div className="dash-page-header">
        <div>
          <div className="dash-page-kicker">Platform Scope</div>
          <h2 className="dash-page-title">Platform AI Controls</h2>
          <p className="dash-page-subtitle">
            Set platform-wide defaults first, then apply school-specific
            overrides only when a school needs different AI behavior.
          </p>
        </div>
        <div className="dash-page-actions">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={load}
            disabled={loading || saving}
          >
            Reload
          </button>
        </div>
      </div>

      <div className="dash-card mb-4">
        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-auto">
            <label className="form-label fw-semibold mb-1">Editing scope</label>
            <select
              className="form-select"
              style={{ minWidth: 280 }}
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
            >
              <option value="">Platform defaults — all schools</option>
              {tenants.map((tenant) => (
                <option key={tenant._id || tenant.tenantId} value={tenant.tenantId}>
                  {tenant.name || tenant.tenantId}
                </option>
              ))}
            </select>
          </div>

          {!isGlobal ? (
            <div className="col-12 col-md-auto">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={resetToPlatformDefaults}
                disabled={saving}
              >
                Reset to Platform Defaults
              </button>
            </div>
          ) : null}
        </div>

        <div
          className={`tenant-scope-banner mt-3 ${
            isGlobal ? "scope-global" : "scope-tenant"
          }`}
        >
          {isGlobal ? <FaGlobe /> : <FaBuilding />}
          {isGlobal ? (
            <span>
              <strong>Platform defaults</strong> — changes apply across the
              platform. Individual schools can override these settings when they
              need different limits or feature access.
            </span>
          ) : (
            <span>
              <strong>School override: {tenantLabel}</strong> — changes apply
              only to this school and override the platform defaults.
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading platform AI controls..." />
      ) : (
        <>
          <div className="dash-card mb-4">
            <h3 className="dash-card-title mb-4">
              {isGlobal ? "Platform Defaults" : `School Override — ${tenantLabel}`}
            </h3>
            <div className="row g-4">
              <div className="col-lg-6">
                <div className="form-check form-switch mb-4">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="platform-ai-enabled"
                    checked={!!settings.enabled}
                    onChange={(e) => setField("enabled", e.target.checked)}
                  />
                  <label
                    className="form-check-label fw-semibold"
                    htmlFor="platform-ai-enabled"
                  >
                    AI features enabled
                  </label>
                  <div className="form-text">
                    {isGlobal
                      ? "Disabling this turns off AI features across every school."
                      : `Disabling this turns off AI features for ${tenantLabel} only.`}
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
                    Default tone used when AI drafts teacher-facing feedback.
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
                    value={settings.softCapDaily}
                    min={1000}
                    step={1000}
                    onChange={(e) =>
                      setField("softCapDaily", Number(e.target.value || 0))
                    }
                  />
                  <div className="form-text">
                    Warning threshold per day. This warns before usage becomes
                    surprising, but it does not hard-block requests.
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    Weekly token soft cap
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    value={settings.softCapWeekly}
                    min={5000}
                    step={5000}
                    onChange={(e) =>
                      setField("softCapWeekly", Number(e.target.value || 0))
                    }
                  />
                  <div className="form-text">
                    Keep this higher than the daily threshold so the warning
                    model stays consistent for admins.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="dash-card mb-4">
            <h3 className="dash-card-title mb-3">Feature Access</h3>
            <p className="dash-supporting-text mb-3">
              {isGlobal
                ? "These toggles set the default AI feature access across the platform."
                : `These toggles apply only to ${tenantLabel}.`}
            </p>
            <div className="row g-3">
              {FEATURES.map(({ key, label, desc }) => (
                <div key={key} className="col-md-6">
                  <div className="dash-surface-panel h-100">
                    <div className="form-check form-switch mb-0">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`platform-feature-${key}`}
                        checked={!!settings.features?.[key]}
                        onChange={(e) => setFeature(key, e.target.checked)}
                      />
                      <label
                        className="form-check-label fw-semibold"
                        htmlFor={`platform-feature-${key}`}
                      >
                        {label}
                      </label>
                    </div>
                    <p className="dash-supporting-text mb-0 mt-2">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="d-flex flex-wrap gap-3 align-items-center">
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : isGlobal
                  ? "Save Platform Defaults"
                  : `Save for ${tenantLabel}`}
            </button>
            {!isGlobal ? (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={resetToPlatformDefaults}
                disabled={saving}
              >
                Reset to Platform Defaults
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
