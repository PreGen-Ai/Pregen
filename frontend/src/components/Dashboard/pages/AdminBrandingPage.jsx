// Admin Branding — update institution name, color, logo via /api/admin/branding
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import api from "../../../services/api/api.js";
import { API_BASE_URL } from "../../../services/api/http.js";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";

export default function AdminBrandingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    institutionName: "",
    primaryColor: "#D4AF37",
    logoUrl: "",
  });
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.admin.getBranding();
      const b = res?.branding || res || {};
      setForm({
        institutionName: b.institutionName || "",
        primaryColor: b.primaryColor || "#D4AF37",
        logoUrl: b.logoUrl || "",
      });
    } catch (e) {
      toast.error(e?.message || "Failed to load branding");
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
      await api.admin.updateBranding({
        institutionName: form.institutionName,
        primaryColor: form.primaryColor,
      });
      toast.success("Branding saved");
    } catch (e) {
      toast.error(e?.message || "Failed to save branding");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file) => {
    setUploading(true);
    try {
      const res = await api.admin.uploadLogo(file);
      const url = res?.logoUrl || res?.url || "";
      if (url) {
        setForm((p) => ({ ...p, logoUrl: url }));
        toast.success("Logo uploaded");
      } else {
        toast.error("Upload succeeded but no URL returned");
      }
    } catch (e) {
      toast.error(e?.message || "Failed to upload logo");
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading branding settings…" />;

  return (
    <div className="quizzes-page">
      <div className="mb-4">
        <h2>Branding</h2>
        <p className="text-muted mb-0">
          Customize your institution name, colors, and logo.
        </p>
      </div>

      <div className="dash-card mb-4" style={{ maxWidth: 560 }}>
        <h3 className="dash-card-title mb-4">Identity</h3>

        <div className="mb-3">
          <label className="form-label">Institution name</label>
          <input
            className="form-control"
            value={form.institutionName}
            placeholder="e.g. Springfield Academy"
            onChange={(e) =>
              setForm((p) => ({ ...p, institutionName: e.target.value }))
            }
          />
        </div>

        <div className="mb-4">
          <label className="form-label">Primary color</label>
          <div className="d-flex gap-3 align-items-center">
            <input
              type="color"
              className="form-control form-control-color"
              value={form.primaryColor}
              onChange={(e) =>
                setForm((p) => ({ ...p, primaryColor: e.target.value }))
              }
              style={{ width: 60, height: 40 }}
            />
            <input
              className="form-control"
              value={form.primaryColor}
              placeholder="#D4AF37"
              onChange={(e) =>
                setForm((p) => ({ ...p, primaryColor: e.target.value }))
              }
              style={{ maxWidth: 130 }}
            />
          </div>
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save branding"}
        </button>
      </div>

      <div className="dash-card" style={{ maxWidth: 560 }}>
        <h3 className="dash-card-title mb-4">Logo</h3>

        {form.logoUrl && (
          <div className="mb-3">
            <img
              src={
                form.logoUrl.startsWith("/")
                  ? `${API_BASE_URL}${form.logoUrl}`
                  : form.logoUrl
              }
              alt="Institution logo"
              style={{
                maxHeight: 80,
                maxWidth: 240,
                borderRadius: 8,
                objectFit: "contain",
                background: "var(--card-bg)",
                border: "1px solid var(--border-color)",
                padding: 8,
              }}
            />
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadLogo(file);
            e.target.value = "";
          }}
        />

        <button
          className="btn btn-outline-light"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : form.logoUrl ? "Replace logo" : "Upload logo"}
        </button>
        <div className="form-text mt-2">
          Accepted formats: PNG, JPG, SVG. Recommended: 240×80 px.
        </div>
      </div>
    </div>
  );
}
