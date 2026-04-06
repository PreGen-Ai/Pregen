// SuperAdmin AI Controls — manages global AI settings via GET/PUT /api/admin/ai/settings
import React, { useCallback, useEffect, useState } from "react";
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

function mergeSettings(raw) {
  return {
    ...DEFAULTS,
    ...raw,
    features: { ...DEFAULTS.features, ...(raw?.features || {}) },
  };
}

const FEATURES = [
  {
    key: "aiGrading",
    label: "AI Grading",
    desc: "Auto-grade quiz and assignment submissions using AI",
  },
  {
    key: "aiQuizGen",
    label: "AI Quiz Generation",
    desc: "Let teachers generate quiz questions with AI",
  },
  {
    key: "aiTutor",
    label: "AI Tutor",
    desc: "Enable the AI study helper for students and teachers",
  },
  {
    key: "aiSummaries",
    label: "AI Summaries",
    desc: "Allow AI to summarize lesson materials per request",
  },
];

export default function AIControlsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(DEFAULTS);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.admin.getAiSettings();
      if (res?.settings) setSettings(mergeSettings(res.settings));
    } catch (e) {
      toast.error(e?.message || "Failed to load AI settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.admin.updateAiSettings(settings);
      toast.success("AI settings saved");
    } catch (e) {
      toast.error(e?.message || "Failed to save AI settings");
    } finally {
      setSaving(false);
    }
  };

  const setField = (key, val) =>
    setSettings((prev) => ({ ...prev, [key]: val }));

  const setFeature = (key, val) =>
    setSettings((prev) => ({
      ...prev,
      features: { ...prev.features, [key]: val },
    }));

  if (loading) return <LoadingSpinner message="Loading AI settings…" />;

  return (
    <div className="quizzes-page">
      <div className="mb-4">
        <h2>AI Controls</h2>
        <p className="text-muted mb-0">
          Configure AI features and usage limits for the entire platform.
        </p>
      </div>

      <div className="dash-card mb-4">
        <h3 className="dash-card-title mb-4">Global Settings</h3>
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
                AI features enabled globally
              </label>
              <div className="form-text">
                Disabling this turns off all AI features across every tenant.
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
                AI usage warning threshold per day (tokens). Not a hard block.
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
                AI usage warning threshold per week (tokens). Not a hard block.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-card mb-4">
        <h3 className="dash-card-title mb-4">Feature Toggles</h3>
        <div className="row g-3">
          {FEATURES.map(({ key, label, desc }) => (
            <div key={key} className="col-md-6">
              <div
                className="border rounded p-3"
                style={{ background: "var(--card-bg)" }}
              >
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id={`feat-${key}`}
                    checked={!!settings.features?.[key]}
                    onChange={(e) => setFeature(key, e.target.checked)}
                  />
                  <label
                    className="form-check-label fw-semibold"
                    htmlFor={`feat-${key}`}
                  >
                    {label}
                  </label>
                </div>
                <p
                  className="text-muted mb-0 mt-1"
                  style={{ fontSize: "0.84em" }}
                >
                  {desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save AI settings"}
      </button>
    </div>
  );
}
