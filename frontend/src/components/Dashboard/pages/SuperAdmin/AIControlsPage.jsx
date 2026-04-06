// SuperAdmin AI Controls — manages global defaults + per-tenant AI settings
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { FaGlobe, FaBuilding } from "react-icons/fa";
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

function mergeSettings(raw) {
  return {
    ...DEFAULTS,
    ...raw,
    features: { ...DEFAULTS.features, ...(raw?.features || {}) },
  };
}

const FEATURES = [
  { key: "aiGrading",   label: "AI Grading",         desc: "Auto-grade quiz and assignment submissions using AI" },
  { key: "aiQuizGen",   label: "AI Quiz Generation",  desc: "Let teachers generate quiz questions with AI" },
  { key: "aiTutor",     label: "AI Tutor",            desc: "Enable the AI study helper for students and teachers" },
  { key: "aiSummaries", label: "AI Summaries",        desc: "Allow AI to summarize lesson materials per request" },
];

export default function AIControlsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(DEFAULTS);

  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");

  const selectedTenant = tenants.find((t) => t.tenantId === selectedTenantId);
  const isGlobal = !selectedTenantId;
  const tenantLabel = selectedTenant?.name || selectedTenantId;

  useEffect(() => {
    api.admin.listTenants().then((res) => {
      setTenants(Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : []);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = selectedTenantId ? { headers: { "x-tenant-id": selectedTenantId } } : undefined;
      const res = await api.admin.getAiSettings(cfg);
      setSettings(res?.settings ? mergeSettings(res.settings) : DEFAULTS);
    } catch (e) {
      toast.error(e?.message || "Failed to load AI settings");
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const cfg = selectedTenantId ? { headers: { "x-tenant-id": selectedTenantId } } : undefined;
      await api.admin.updateAiSettings(settings, cfg);
      toast.success(
        isGlobal
          ? "Global AI settings saved"
          : `AI settings saved for ${tenantLabel}`
      );
    } catch (e) {
      toast.error(e?.message || "Failed to save AI settings");
    } finally {
      setSaving(false);
    }
  };

  const resetToGlobal = async () => {
    if (!selectedTenantId) return;
    if (!window.confirm(
      `Reset AI settings for "${tenantLabel}" to global defaults?\n\nThis will overwrite any tenant-specific overrides.`
    )) return;
    setSaving(true);
    try {
      const globalRes = await api.admin.getAiSettings();
      const globalSettings = globalRes?.settings ? mergeSettings(globalRes.settings) : DEFAULTS;
      await api.admin.updateAiSettings(globalSettings, { headers: { "x-tenant-id": selectedTenantId } });
      setSettings(globalSettings);
      toast.success("Tenant settings reset to global defaults");
    } catch (e) {
      toast.error(e?.message || "Failed to reset settings");
    } finally {
      setSaving(false);
    }
  };

  const setField = (key, val) => setSettings((prev) => ({ ...prev, [key]: val }));
  const setFeature = (key, val) =>
    setSettings((prev) => ({ ...prev, features: { ...prev.features, [key]: val } }));

  return (
    <div className="quizzes-page">
      {/* Page header */}
      <div className="mb-4">
        <h2>AI Controls</h2>
        <p className="text-muted mb-0">
          Configure platform-wide AI defaults, or apply overrides for a specific tenant.
        </p>
      </div>

      {/* Tenant selector card */}
      <div className="dash-card mb-4">
        <div className="row g-3 align-items-end">
          <div className="col-12 col-md-auto">
            <label className="form-label fw-semibold mb-1">Scope</label>
            <select
              className="form-select"
              style={{ minWidth: 260 }}
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
            >
              <option value="">Global defaults — all tenants</option>
              {tenants.map((t) => (
                <option key={t._id} value={t.tenantId}>
                  {t.name || t.tenantId}
                </option>
              ))}
            </select>
          </div>
          {!isGlobal && (
            <div className="col-12 col-md-auto">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={resetToGlobal}
                disabled={saving}
              >
                Reset to global defaults
              </button>
            </div>
          )}
        </div>

        {/* Scope context banner */}
        <div className={`tenant-scope-banner mt-3 ${isGlobal ? "scope-global" : "scope-tenant"}`}>
          {isGlobal ? <FaGlobe /> : <FaBuilding />}
          {isGlobal ? (
            <span>
              <strong>Global defaults</strong> — changes apply platform-wide. Individual tenants can override these settings.
            </span>
          ) : (
            <span>
              <strong>Tenant override: {tenantLabel}</strong> — changes apply only to this tenant and override the global defaults.
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner message="Loading AI settings…" />
      ) : (
        <>
          {/* General settings */}
          <div className="dash-card mb-4">
            <h3 className="dash-card-title mb-4">
              {isGlobal ? "Global Settings" : `Settings — ${tenantLabel}`}
            </h3>
            <div className="row g-4">
              <div className="col-md-6">
                <div className="form-check form-switch mb-4">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="aiEnabled"
                    checked={!!settings.enabled}
                    onChange={(e) => setField("enabled", e.target.checked)}
                  />
                  <label className="form-check-label fw-semibold" htmlFor="aiEnabled">
                    AI features enabled
                  </label>
                  <div className="form-text">
                    {isGlobal
                      ? "Disabling this turns off all AI features across every tenant."
                      : `Disabling this turns off AI features for ${tenantLabel} only.`}
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">Feedback tone</label>
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
                    Default tone when AI drafts grade feedback for teachers.
                  </div>
                </div>
              </div>

              <div className="col-md-6">
                <div className="mb-3">
                  <label className="form-label">Daily token soft cap</label>
                  <input
                    type="number"
                    className="form-control"
                    value={settings.softCapDaily}
                    min={1000}
                    step={1000}
                    onChange={(e) => setField("softCapDaily", Number(e.target.value))}
                  />
                  <div className="form-text">
                    Warning threshold per day (tokens). Not a hard block.
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Weekly token soft cap</label>
                  <input
                    type="number"
                    className="form-control"
                    value={settings.softCapWeekly}
                    min={5000}
                    step={5000}
                    onChange={(e) => setField("softCapWeekly", Number(e.target.value))}
                  />
                  <div className="form-text">
                    Warning threshold per week (tokens). Not a hard block.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature toggles */}
          <div className="dash-card mb-4">
            <h3 className="dash-card-title mb-3">Feature Toggles</h3>
            <p className="text-muted mb-3" style={{ fontSize: "0.85em" }}>
              {isGlobal
                ? "Enable or disable specific AI features platform-wide."
                : `Enable or disable specific AI features for ${tenantLabel}.`}
            </p>
            <div className="row g-3">
              {FEATURES.map(({ key, label, desc }) => (
                <div key={key} className="col-md-6">
                  <div
                    className="p-3 rounded"
                    style={{ border: "1px solid var(--border-color)", background: "rgba(255,255,255,0.02)" }}
                  >
                    <div className="form-check form-switch mb-0">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`feat-${key}`}
                        checked={!!settings.features?.[key]}
                        onChange={(e) => setFeature(key, e.target.checked)}
                      />
                      <label className="form-check-label fw-semibold" htmlFor={`feat-${key}`}>
                        {label}
                      </label>
                    </div>
                    <p className="text-muted mb-0 mt-1" style={{ fontSize: "0.82em" }}>
                      {desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Save bar */}
          <div className="d-flex flex-wrap gap-3 align-items-center">
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving
                ? "Saving…"
                : isGlobal
                  ? "Save global settings"
                  : `Save for ${tenantLabel}`}
            </button>
            {!isGlobal && (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={resetToGlobal}
                disabled={saving}
              >
                Reset to global defaults
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={load}
              disabled={loading || saving}
            >
              Reload
            </button>
          </div>
        </>
      )}
    </div>
  );
}
