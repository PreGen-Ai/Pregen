// src/pages/tools/AIControlsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import api from "../../services/api/api.js";
import "../../components/styles/admin-tools.css";

const DEFAULT_SETTINGS = {
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

const FEATURE_LABELS = {
  aiGrading: "AI Grading",
  aiQuizGen: "AI Quiz Generator",
  aiTutor: "AI Tutor",
  aiSummaries: "AI Summaries",
};

function deepSortObject(obj) {
  if (Array.isArray(obj)) return obj.map(deepSortObject);
  if (obj && typeof obj === "object") {
    return Object.keys(obj)
      .sort()
      .reduce((acc, k) => {
        acc[k] = deepSortObject(obj[k]);
        return acc;
      }, {});
  }
  return obj;
}

function stableStringify(obj) {
  return JSON.stringify(deepSortObject(obj));
}

function coerceInt(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function mergeSettings(serverSettings) {
  const s =
    serverSettings && typeof serverSettings === "object" ? serverSettings : {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    features: {
      ...DEFAULT_SETTINGS.features,
      ...(s.features && typeof s.features === "object" ? s.features : {}),
    },
    softCapDaily: coerceInt(
      s.softCapDaily ?? DEFAULT_SETTINGS.softCapDaily,
      DEFAULT_SETTINGS.softCapDaily,
    ),
    softCapWeekly: coerceInt(
      s.softCapWeekly ?? DEFAULT_SETTINGS.softCapWeekly,
      DEFAULT_SETTINGS.softCapWeekly,
    ),
    enabled:
      typeof s.enabled === "boolean" ? s.enabled : DEFAULT_SETTINGS.enabled,
    feedbackTone: String(s.feedbackTone || DEFAULT_SETTINGS.feedbackTone),
  };
}

export default function AIControlsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(DEFAULT_SETTINGS);
  const [baseline, setBaseline] = useState(DEFAULT_SETTINGS);

  const [lastSavedAt, setLastSavedAt] = useState(null);

  const baselineSigRef = useRef(stableStringify(DEFAULT_SETTINGS));
  useEffect(() => {
    baselineSigRef.current = stableStringify(baseline);
  }, [baseline]);

  const isDirty = useMemo(() => {
    return stableStringify(form) !== baselineSigRef.current;
  }, [form]);

  const weeklyIsSmallerThanDaily = useMemo(() => {
    return coerceInt(form.softCapWeekly) > 0 && coerceInt(form.softCapDaily) > 0
      ? coerceInt(form.softCapWeekly) < coerceInt(form.softCapDaily)
      : false;
  }, [form.softCapDaily, form.softCapWeekly]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        const data = await api.admin.getAiSettings();

        // Accept shapes: { settings } OR { ai } OR flat object
        const serverSettings = data?.settings || data?.ai || data;
        const merged = mergeSettings(serverSettings);

        if (!alive) return;
        setForm(merged);
        setBaseline(merged);
        setLastSavedAt(null);
      } catch (e) {
        if (!alive) return;
        toast.error(e?.message || "Failed to load AI settings");
        setForm(DEFAULT_SETTINGS);
        setBaseline(DEFAULT_SETTINGS);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const setFeature = (key, value) => {
    setForm((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        [key]: value,
      },
    }));
  };

  const onSave = async () => {
    if (saving) return;

    const next = {
      ...form,
      softCapDaily: coerceInt(form.softCapDaily, 0),
      softCapWeekly: coerceInt(form.softCapWeekly, 0),
    };

    if (weeklyIsSmallerThanDaily) {
      toast.error(
        "Weekly soft cap should be greater than or equal to daily soft cap",
      );
      return;
    }

    try {
      setSaving(true);

      const res = await api.admin.updateAiSettings(next);

      const returned = res?.settings || res?.ai || res || next;
      const merged = mergeSettings(returned);

      setForm(merged);
      setBaseline(merged);
      setLastSavedAt(new Date());

      toast.success("AI settings saved");
    } catch (e) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    setForm(baseline);
    toast.info("Changes reset");
  };

  if (loading) {
    return (
      <div className="admin-shell">
        <div className="admin-content">Loading...</div>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <div className="admin-content">
        <div className="admin-title">AI Controls</div>

        <div className="card">
          <div className="card-inner">
            <div className="toolbar" style={{ gap: 10, flexWrap: "wrap" }}>
              <label
                className="badge"
                style={{ display: "flex", gap: 10, alignItems: "center" }}
                title="Master switch for AI features"
              >
                <input
                  type="checkbox"
                  checked={!!form.enabled}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                />
                AI Enabled
              </label>

              <select
                className="select"
                value={form.feedbackTone}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, feedbackTone: e.target.value }))
                }
                title="Default feedback tone"
              >
                <option value="strict">Strict</option>
                <option value="neutral">Neutral</option>
                <option value="encouraging">Encouraging</option>
              </select>

              <input
                className="input"
                type="number"
                min="0"
                value={form.softCapDaily}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    softCapDaily: coerceInt(e.target.value, 0),
                  }))
                }
                placeholder="Daily soft cap"
                title="Soft cap tokens per day"
              />

              <input
                className="input"
                type="number"
                min="0"
                value={form.softCapWeekly}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    softCapWeekly: coerceInt(e.target.value, 0),
                  }))
                }
                placeholder="Weekly soft cap"
                title="Soft cap tokens per week"
              />

              <button
                className="btn-gold"
                onClick={onSave}
                disabled={!isDirty || saving}
                title={!isDirty ? "No changes to save" : "Save settings"}
                style={{ opacity: !isDirty || saving ? 0.7 : 1 }}
              >
                {saving ? "Saving..." : "Save"}
              </button>

              <button
                className="btn-ghost"
                onClick={onReset}
                disabled={!isDirty || saving}
                title="Reset changes"
                style={{ opacity: !isDirty || saving ? 0.7 : 1 }}
              >
                Reset
              </button>

              <button
                className="btn-ghost"
                onClick={() => window.location.reload()}
                disabled={saving}
                title="Reload from server"
                style={{ opacity: saving ? 0.7 : 1 }}
              >
                Reload
              </button>

              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {isDirty ? (
                  <span className="badge" title="Unsaved changes">
                    Unsaved
                  </span>
                ) : (
                  <span className="badge" title="All changes saved">
                    Saved
                  </span>
                )}

                {lastSavedAt ? (
                  <span className="badge" title="Last saved time">
                    {lastSavedAt.toLocaleString()}
                  </span>
                ) : null}
              </div>
            </div>

            {weeklyIsSmallerThanDaily ? (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  background: "rgba(239, 68, 68, 0.08)",
                  color: "#ef4444",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Weekly soft cap is smaller than daily soft cap. This will be
                blocked on save.
              </div>
            ) : null}

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(260px, 1fr))",
                gap: 12,
              }}
            >
              {Object.entries(form.features || {}).map(([k, v]) => (
                <label
                  key={k}
                  className="btn-ghost"
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                  title={`Toggle ${FEATURE_LABELS[k] || k}`}
                >
                  <input
                    type="checkbox"
                    checked={!!v}
                    onChange={(e) => setFeature(k, e.target.checked)}
                    disabled={!form.enabled}
                  />
                  <span style={{ fontWeight: 900 }}>
                    {FEATURE_LABELS[k] || k}
                  </span>
                  {!form.enabled ? (
                    <span
                      className="badge"
                      style={{ marginLeft: "auto", opacity: 0.8 }}
                    >
                      Disabled by master switch
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div className="card">
          <div
            className="card-inner"
            style={{ color: "#D1D5DB", lineHeight: 1.4 }}
          >
            Soft caps are not hard blocking by default. When exceeded, you can:
            <div>• degrade to shorter outputs</div>
            <div>• require admin approval</div>
            <div>• limit AI grading to premium classes only</div>
          </div>
        </div>
      </div>
    </div>
  );
}
