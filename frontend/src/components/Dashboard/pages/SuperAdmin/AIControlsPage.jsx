import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FaBuilding, FaGlobe, FaUndoAlt } from "react-icons/fa";
import { toast } from "react-toastify";

import api from "../../../../services/api/api.js";
import LoadingSpinner from "../../components/ui/LoadingSpinner.jsx";

const DEFAULTS = {
  enabled: true,
  feedbackTone: "neutral",
  minTokens: 256,
  maxTokens: 4096,
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
    desc: "Allow teachers to generate quizzes and related assessment drafts with AI.",
  },
  {
    key: "aiTutor",
    label: "AI Tutor",
    desc: "Enable the study assistant for students and teachers.",
  },
  {
    key: "aiSummaries",
    label: "AI Summaries",
    desc: "Allow AI summaries and lesson condensation workflows.",
  },
];

const SCALAR_FIELDS = [
  {
    key: "enabled",
    label: "AI enabled",
    type: "boolean",
    description:
      "Master switch for AI. Turning this off blocks AI requests for the selected scope.",
    format: (value) => (value ? "Enabled" : "Disabled"),
  },
  {
    key: "feedbackTone",
    label: "Feedback tone",
    type: "select",
    description:
      "Default tone used when AI drafts teacher-facing feedback or guidance.",
    options: [
      { value: "strict", label: "Strict" },
      { value: "neutral", label: "Neutral" },
      { value: "encouraging", label: "Encouraging" },
    ],
    format: (value) => {
      const text = String(value || "neutral");
      return text.charAt(0).toUpperCase() + text.slice(1);
    },
  },
  {
    key: "minTokens",
    label: "Minimum token threshold",
    type: "number",
    min: 0,
    step: 1,
    description:
      "Lower-bound token floor used when a request exposes an adjustable token budget.",
    format: (value) => `${Number(value || 0)} tokens`,
  },
  {
    key: "maxTokens",
    label: "Maximum token threshold",
    type: "number",
    min: 0,
    step: 1,
    description:
      "Upper-bound token ceiling used when a request exposes an adjustable token budget.",
    format: (value) => `${Number(value || 0)} tokens`,
  },
  {
    key: "softCapDaily",
    label: "Daily token soft cap",
    type: "number",
    min: 0,
    step: 1000,
    description:
      "Warning threshold for daily usage. Preserved as a soft cap and returned in the effective policy.",
    format: (value) => `${Number(value || 0)} tokens/day`,
  },
  {
    key: "softCapWeekly",
    label: "Weekly token soft cap",
    type: "number",
    min: 0,
    step: 1000,
    description:
      "Warning threshold for weekly usage. Keep it greater than or equal to the daily soft cap.",
    format: (value) => `${Number(value || 0)} tokens/week`,
  },
];

function mergeSettings(raw) {
  return {
    ...DEFAULTS,
    ...(raw || {}),
    features: {
      ...DEFAULTS.features,
      ...(raw?.features || {}),
    },
  };
}

function normalizeOverride(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const out = {};

  for (const key of [
    "enabled",
    "feedbackTone",
    "minTokens",
    "maxTokens",
    "softCapDaily",
    "softCapWeekly",
  ]) {
    if (source[key] !== undefined) out[key] = source[key];
  }

  if (source.features && typeof source.features === "object") {
    const features = {};
    for (const { key } of FEATURES) {
      if (source.features[key] !== undefined) {
        features[key] = source.features[key];
      }
    }
    if (Object.keys(features).length > 0) {
      out.features = features;
    }
  }

  return out;
}

function stableStringify(value) {
  return JSON.stringify(value, (key, currentValue) => {
    if (
      currentValue &&
      typeof currentValue === "object" &&
      !Array.isArray(currentValue)
    ) {
      return Object.keys(currentValue)
        .sort()
        .reduce((acc, currentKey) => {
          acc[currentKey] = currentValue[currentKey];
          return acc;
        }, {});
    }
    return currentValue;
  });
}

function fieldStatusClass(overridden) {
  return overridden ? "bg-primary-subtle text-primary" : "bg-secondary-subtle text-secondary-emphasis";
}

function getFieldValue(source, key) {
  return source?.[key];
}

function setOverrideValue(override, key, value) {
  const next = normalizeOverride(override);
  if (key.startsWith("features.")) {
    const featureKey = key.split(".")[1];
    next.features = { ...(next.features || {}), [featureKey]: value };
    return next;
  }
  next[key] = value;
  return next;
}

function unsetOverrideValue(override, key) {
  const next = normalizeOverride(override);
  if (key.startsWith("features.")) {
    const featureKey = key.split(".")[1];
    if (!next.features) return next;
    delete next.features[featureKey];
    if (!Object.keys(next.features).length) delete next.features;
    return next;
  }
  delete next[key];
  return next;
}

function isOverridden(override, key) {
  if (key.startsWith("features.")) {
    const featureKey = key.split(".")[1];
    return override?.features?.[featureKey] !== undefined;
  }
  return override?.[key] !== undefined;
}

function getEffectiveFieldValue(platformDefaults, override, key) {
  if (key.startsWith("features.")) {
    const featureKey = key.split(".")[1];
    return override?.features?.[featureKey] ?? platformDefaults?.features?.[featureKey];
  }
  return override?.[key] ?? platformDefaults?.[key];
}

function validateSettings(settings) {
  const minTokens = Number(settings.minTokens || 0);
  const maxTokens = Number(settings.maxTokens || 0);
  const softCapDaily = Number(settings.softCapDaily || 0);
  const softCapWeekly = Number(settings.softCapWeekly || 0);

  if (maxTokens > 0 && minTokens > maxTokens) {
    return "Maximum token threshold must be greater than or equal to the minimum token threshold.";
  }

  if (softCapDaily > 0 && softCapWeekly > 0 && softCapWeekly < softCapDaily) {
    return "Weekly token soft cap must be greater than or equal to the daily soft cap.";
  }

  return "";
}

function Badge({ overridden }) {
  return (
    <span className={`badge ${fieldStatusClass(overridden)}`}>
      {overridden ? "Overridden for this tenant" : "Inherited from platform"}
    </span>
  );
}

function TenantOverrideField({
  fieldKey,
  label,
  description,
  type,
  value,
  platformValue,
  overridden,
  onModeChange,
  onValueChange,
  min = 0,
  step = 1,
  formatValue,
  options = [],
}) {
  return (
    <div className="dash-surface-panel h-100">
      <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
        <div>
          <div className="fw-semibold">{label}</div>
          <div className="dash-supporting-text mt-1">{description}</div>
        </div>
        <Badge overridden={overridden} />
      </div>

      <div className="row g-3 mt-1">
        <div className="col-12 col-lg-5">
          <label className="form-label fw-semibold mb-1">Value source</label>
          <select
            className="form-select"
            value={overridden ? "override" : "inherit"}
            onChange={(event) => onModeChange(event.target.value === "override")}
          >
            <option value="inherit">Inherited from platform</option>
            <option value="override">Tenant override</option>
          </select>
        </div>

        <div className="col-12 col-lg-7">
          {type === "boolean" ? (
            <div className="form-check form-switch mt-4">
              <input
                className="form-check-input"
                type="checkbox"
                id={`tenant-field-${fieldKey}`}
                checked={!!value}
                disabled={!overridden}
                onChange={(event) => onValueChange(event.target.checked)}
              />
              <label
                className="form-check-label fw-semibold"
                htmlFor={`tenant-field-${fieldKey}`}
              >
                {value ? "Enabled" : "Disabled"}
              </label>
            </div>
          ) : type === "select" ? (
            <>
              <label className="form-label fw-semibold mb-1">Tenant value</label>
              <select
                className="form-select"
                value={value}
                disabled={!overridden}
                onChange={(event) => onValueChange(event.target.value)}
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <label className="form-label fw-semibold mb-1">Tenant value</label>
              <input
                type="number"
                className="form-control"
                min={min}
                step={step}
                value={value}
                disabled={!overridden}
                onChange={(event) => onValueChange(Number(event.target.value || 0))}
              />
            </>
          )}
        </div>
      </div>

      <div className="form-text mt-3">
        Platform default: {formatValue(platformValue)}. Effective for this tenant: {formatValue(value)}.
      </div>
    </div>
  );
}

export default function AIControlsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [platformDraft, setPlatformDraft] = useState(DEFAULTS);
  const [platformBaseline, setPlatformBaseline] = useState(DEFAULTS);
  const [tenantPlatformDefaults, setTenantPlatformDefaults] = useState(DEFAULTS);
  const [tenantOverrideDraft, setTenantOverrideDraft] = useState({});
  const [tenantOverrideBaseline, setTenantOverrideBaseline] = useState({});

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.tenantId === selectedTenantId),
    [selectedTenantId, tenants],
  );
  const isGlobal = !selectedTenantId;
  const tenantLabel = selectedTenant?.name || selectedTenantId || "Selected tenant";

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

      if (!selectedTenantId) {
        const merged = mergeSettings(response?.effective || response?.settings || {});
        setPlatformDraft(merged);
        setPlatformBaseline(merged);
      } else {
        const platformDefaults = mergeSettings(
          response?.platformDefaults || response?.effective || response?.settings || {},
        );
        const override = normalizeOverride(response?.override || {});
        setTenantPlatformDefaults(platformDefaults);
        setTenantOverrideDraft(override);
        setTenantOverrideBaseline(override);
      }
    } catch (error) {
      toast.error(error?.message || "Failed to load AI controls");
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const resolvedTenantSettings = useMemo(
    () => mergeSettings({
      ...tenantPlatformDefaults,
      ...tenantOverrideDraft,
      features: {
        ...tenantPlatformDefaults.features,
        ...(tenantOverrideDraft.features || {}),
      },
    }),
    [tenantOverrideDraft, tenantPlatformDefaults],
  );

  const platformDirty = useMemo(
    () => stableStringify(platformDraft) !== stableStringify(platformBaseline),
    [platformDraft, platformBaseline],
  );
  const tenantDirty = useMemo(
    () =>
      stableStringify(normalizeOverride(tenantOverrideDraft)) !==
      stableStringify(normalizeOverride(tenantOverrideBaseline)),
    [tenantOverrideDraft, tenantOverrideBaseline],
  );
  const currentValidation = useMemo(
    () => validateSettings(isGlobal ? platformDraft : resolvedTenantSettings),
    [isGlobal, platformDraft, resolvedTenantSettings],
  );

  const setPlatformField = (key, value) =>
    setPlatformDraft((prev) => ({ ...prev, [key]: value }));
  const setPlatformFeature = (key, value) =>
    setPlatformDraft((prev) => ({
      ...prev,
      features: { ...prev.features, [key]: value },
    }));

  const toggleTenantOverrideMode = (key, shouldOverride) => {
    setTenantOverrideDraft((prev) => {
      if (!shouldOverride) {
        return unsetOverrideValue(prev, key);
      }

      const currentValue = getEffectiveFieldValue(tenantPlatformDefaults, prev, key);
      return setOverrideValue(prev, key, currentValue);
    });
  };

  const setTenantOverrideField = (key, value) => {
    setTenantOverrideDraft((prev) => setOverrideValue(prev, key, value));
  };

  const save = async () => {
    if (saving) return;
    if (currentValidation) {
      toast.error(currentValidation);
      return;
    }

    setSaving(true);
    try {
      const config = selectedTenantId
        ? { headers: { "x-tenant-id": selectedTenantId } }
        : undefined;
      const payload = isGlobal
        ? {
            ...platformDraft,
            minTokens: Number(platformDraft.minTokens || 0),
            maxTokens: Number(platformDraft.maxTokens || 0),
            softCapDaily: Number(platformDraft.softCapDaily || 0),
            softCapWeekly: Number(platformDraft.softCapWeekly || 0),
          }
        : { override: normalizeOverride(tenantOverrideDraft) };

      const response = await api.admin.updateAiSettings(payload, config);

      if (isGlobal) {
        const merged = mergeSettings(response?.effective || response?.settings || payload);
        setPlatformDraft(merged);
        setPlatformBaseline(merged);
        toast.success("Platform AI defaults saved");
      } else {
        const platformDefaults = mergeSettings(
          response?.platformDefaults || tenantPlatformDefaults,
        );
        const override = normalizeOverride(response?.override || {});
        setTenantPlatformDefaults(platformDefaults);
        setTenantOverrideDraft(override);
        setTenantOverrideBaseline(override);
        toast.success(`Tenant AI override saved for ${tenantLabel}`);
      }
    } catch (error) {
      toast.error(error?.message || "Failed to save AI controls");
    } finally {
      setSaving(false);
    }
  };

  const resetUnsavedChanges = () => {
    if (isGlobal) {
      setPlatformDraft(platformBaseline);
      toast.info("Unsaved platform edits were reset");
      return;
    }

    setTenantOverrideDraft(tenantOverrideBaseline);
    toast.info("Unsaved tenant override edits were reset");
  };

  const resetTenantInheritance = async () => {
    if (!selectedTenantId) return;
    if (
      !window.confirm(
        `Reset "${tenantLabel}" back to inherited platform AI defaults?`,
      )
    ) {
      return;
    }

    setSaving(true);
    try {
      const response = await api.admin.resetAiSettings({
        headers: { "x-tenant-id": selectedTenantId },
      });
      const platformDefaults = mergeSettings(
        response?.platformDefaults || tenantPlatformDefaults,
      );
      const override = normalizeOverride(response?.override || {});
      setTenantPlatformDefaults(platformDefaults);
      setTenantOverrideDraft(override);
      setTenantOverrideBaseline(override);
      toast.success("Tenant AI override reset to platform inheritance");
    } catch (error) {
      toast.error(error?.message || "Failed to reset tenant override");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading AI controls..." />;
  }

  return (
    <div className="quizzes-page">
      <div className="dash-page-header">
        <div>
          <div className="dash-page-kicker">Platform Scope</div>
          <h2 className="dash-page-title">Platform AI Controls</h2>
          <p className="dash-page-subtitle">
            Edit platform defaults directly, or switch to a tenant and store only
            the override fields that should differ from the platform baseline.
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
            <label className="form-label fw-semibold mb-1" htmlFor="ai-controls-scope">
              Editing scope
            </label>
            <select
              id="ai-controls-scope"
              className="form-select"
              style={{ minWidth: 280 }}
              value={selectedTenantId}
              onChange={(event) => setSelectedTenantId(event.target.value)}
            >
              <option value="">Platform defaults - all tenants</option>
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
                onClick={resetTenantInheritance}
                disabled={saving}
              >
                Reset to Inheritance
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
              <strong>Platform defaults</strong> apply globally. Tenant-specific
              overrides do not mutate this baseline.
            </span>
          ) : (
            <span>
              <strong>Tenant override: {tenantLabel}</strong>. Fields marked as
              inherited still follow the platform default. Fields marked as overridden
              are stored only for this tenant.
            </span>
          )}
        </div>
      </div>

      {currentValidation ? (
        <div className="alert alert-danger mb-4">{currentValidation}</div>
      ) : null}

      {isGlobal ? (
        <>
          <div className="dash-card mb-4">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
              <div>
                <h3 className="dash-card-title mb-1">Platform Defaults</h3>
                <div className="dash-supporting-text">
                  These values are the global baseline for every tenant unless a tenant
                  explicitly overrides them.
                </div>
              </div>
              <span className={`badge ${platformDirty ? "bg-warning text-dark" : "bg-success"}`}>
                {platformDirty ? "Unsaved changes" : "Saved"}
              </span>
            </div>

            <div className="row g-3">
              {SCALAR_FIELDS.map((field) => (
                <div key={field.key} className="col-xl-6">
                  <div className="dash-surface-panel h-100">
                    <div className="fw-semibold">{field.label}</div>
                    <div className="dash-supporting-text mt-1">{field.description}</div>

                    {field.type === "boolean" ? (
                      <div className="form-check form-switch mt-3 mb-0">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`platform-${field.key}`}
                          checked={!!platformDraft[field.key]}
                          onChange={(event) =>
                            setPlatformField(field.key, event.target.checked)
                          }
                        />
                        <label
                          className="form-check-label fw-semibold"
                          htmlFor={`platform-${field.key}`}
                        >
                          {platformDraft[field.key] ? "Enabled" : "Disabled"}
                        </label>
                      </div>
                    ) : field.type === "select" ? (
                      <select
                        className="form-select mt-3"
                        value={platformDraft[field.key]}
                        onChange={(event) =>
                          setPlatformField(field.key, event.target.value)
                        }
                      >
                        {field.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        className="form-control mt-3"
                        min={field.min}
                        step={field.step}
                        value={platformDraft[field.key]}
                        onChange={(event) =>
                          setPlatformField(field.key, Number(event.target.value || 0))
                        }
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="dash-card mb-4">
            <h3 className="dash-card-title mb-3">Platform Feature Access</h3>
            <div className="row g-3">
              {FEATURES.map(({ key, label, desc }) => (
                <div key={key} className="col-md-6">
                  <div className="dash-surface-panel h-100">
                    <div className="form-check form-switch mb-0">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id={`platform-feature-${key}`}
                        checked={!!platformDraft.features?.[key]}
                        onChange={(event) => setPlatformFeature(key, event.target.checked)}
                      />
                      <label
                        className="form-check-label fw-semibold"
                        htmlFor={`platform-feature-${key}`}
                      >
                        {label}
                      </label>
                    </div>
                    <p className="dash-supporting-text mt-2 mb-0">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="dash-card mb-4">
            <div className="row g-3">
              <div className="col-xl-6">
                <div className="dash-surface-panel h-100">
                  <div className="fw-semibold">Platform default</div>
                  <div className="dash-supporting-text mt-2">
                    This is the global baseline currently loaded for every tenant.
                  </div>
                  <div className="dash-inline-note mt-3">
                    Save in tenant mode only stores the fields you marked as overridden.
                  </div>
                </div>
              </div>
              <div className="col-xl-6">
                <div className="dash-surface-panel h-100">
                  <div className="fw-semibold">Tenant override</div>
                  <div className="dash-supporting-text mt-2">
                    {tenantDirty
                      ? "You have unsaved tenant override changes."
                      : "Tenant override draft matches the saved server state."}
                  </div>
                  <div className="dash-inline-note mt-3">
                    Reset to Inheritance clears the saved override and returns this tenant to
                    platform behavior.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="dash-card mb-4">
            <h3 className="dash-card-title mb-3">Tenant Policy</h3>
            <div className="row g-3">
              {SCALAR_FIELDS.map((field) => {
                const overrideKey = field.key;
                const overridden = isOverridden(tenantOverrideDraft, overrideKey);
                const currentValue = getEffectiveFieldValue(
                  tenantPlatformDefaults,
                  tenantOverrideDraft,
                  overrideKey,
                );
                const platformValue = getFieldValue(tenantPlatformDefaults, field.key);

                return (
                  <div key={field.key} className="col-xl-6">
                    <TenantOverrideField
                      fieldKey={field.key}
                      label={field.label}
                      description={field.description}
                      type={field.type}
                      value={currentValue}
                      platformValue={platformValue}
                      overridden={overridden}
                      min={field.min}
                      step={field.step}
                      options={field.options}
                      formatValue={field.format}
                      onModeChange={(shouldOverride) =>
                        toggleTenantOverrideMode(overrideKey, shouldOverride)
                      }
                      onValueChange={(nextValue) =>
                        setTenantOverrideField(overrideKey, nextValue)
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dash-card mb-4">
            <h3 className="dash-card-title mb-3">Tenant Feature Access</h3>
            <div className="row g-3">
              {FEATURES.map(({ key, label, desc }) => {
                const overrideKey = `features.${key}`;
                const overridden = isOverridden(tenantOverrideDraft, overrideKey);
                const currentValue = getEffectiveFieldValue(
                  tenantPlatformDefaults,
                  tenantOverrideDraft,
                  overrideKey,
                );
                const platformValue = tenantPlatformDefaults.features?.[key];

                return (
                  <div key={key} className="col-md-6">
                    <TenantOverrideField
                      fieldKey={overrideKey}
                      label={label}
                      description={desc}
                      type="boolean"
                      value={currentValue}
                      platformValue={platformValue}
                      overridden={overridden}
                      formatValue={(value) => (value ? "Enabled" : "Disabled")}
                      onModeChange={(shouldOverride) =>
                        toggleTenantOverrideMode(overrideKey, shouldOverride)
                      }
                      onValueChange={(nextValue) =>
                        setTenantOverrideField(overrideKey, nextValue)
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dash-card mb-4">
            <h3 className="dash-card-title mb-3">Effective Tenant Configuration</h3>
            <div className="dash-supporting-text">
              Current effective values for <strong>{tenantLabel}</strong>: AI is{" "}
              <strong>{resolvedTenantSettings.enabled ? "enabled" : "disabled"}</strong>,
              token floor is <strong>{resolvedTenantSettings.minTokens}</strong>, token
              ceiling is <strong>{resolvedTenantSettings.maxTokens}</strong>, and soft caps
              remain <strong>{resolvedTenantSettings.softCapDaily}</strong> daily /{" "}
              <strong>{resolvedTenantSettings.softCapWeekly}</strong> weekly.
            </div>
          </div>
        </>
      )}

      <div className="dash-card">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div>
            <h3 className="dash-card-title mb-1">Save, Reset, and Reload</h3>
            <div className="dash-supporting-text">
              Reload fetches the latest saved state. Reset Changes discards local edits.
              {isGlobal
                ? " Platform defaults save globally."
                : " Reset to Inheritance clears only the selected tenant override."}
            </div>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={resetUnsavedChanges}
              disabled={saving || (isGlobal ? !platformDirty : !tenantDirty)}
            >
              <FaUndoAlt className="me-2" />
              Reset Changes
            </button>
            {!isGlobal ? (
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={resetTenantInheritance}
                disabled={saving}
              >
                Reset to Inheritance
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              onClick={save}
              disabled={
                saving ||
                !!currentValidation ||
                (isGlobal ? !platformDirty : !tenantDirty)
              }
            >
              {saving
                ? "Saving..."
                : isGlobal
                  ? "Save Platform Defaults"
                  : `Save Tenant Override for ${tenantLabel}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
