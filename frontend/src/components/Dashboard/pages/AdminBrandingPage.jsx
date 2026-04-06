// Admin Branding — update institution name, color, logo via /api/admin/branding
import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import api from "../../../services/api/api.js";
import { API_BASE_URL } from "../../../services/api/http.js";
import { useAuthContext } from "../../../context/AuthContext.js";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";

export default function AdminBrandingPage() {
  const { user } = useAuthContext() || {};
  const isSuperAdmin = String(user?.role || "").toUpperCase() === "SUPERADMIN";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [form, setForm] = useState({
    institutionName: "",
    primaryColor: "#D4AF37",
    logoUrl: "",
  });
  const fileRef = useRef(null);

  // Superadmin: tenant selector
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.admin.listTenants().then((res) => {
      setTenants(Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : []);
    }).catch(() => {});
  }, [isSuperAdmin]);

  const cfg = isSuperAdmin && selectedTenantId
    ? { headers: { "x-tenant-id": selectedTenantId } }
    : {};

  const load = useCallback(async () => {
    if (isSuperAdmin && !selectedTenantId) {
      setForm({ institutionName: "", primaryColor: "#D4AF37", logoUrl: "" });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.admin.getBranding(cfg);
      const b = res?.branding || res || {};
      setLogoError(false);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, selectedTenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (isSuperAdmin && !selectedTenantId) {
      toast.error("Select a tenant before saving");
      return;
    }
    setSaving(true);
    try {
      await api.admin.updateBranding({
        institutionName: form.institutionName,
        primaryColor: form.primaryColor,
        ...(form.logoUrl ? { logoUrl: form.logoUrl } : {}),
      }, cfg);
      toast.success("Branding saved");
    } catch (e) {
      toast.error(e?.message || "Failed to save branding");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file) => {
    if (isSuperAdmin && !selectedTenantId) {
      toast.error("Select a tenant before uploading a logo");
      return;
    }
    setUploading(true);
    try {
      const res = await api.admin.uploadLogo(file, cfg);
      const url = res?.logoUrl || res?.url || "";
      if (url) {
        setLogoError(false);
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

  const logoSrc = form.logoUrl
    ? (form.logoUrl.startsWith("/") ? `${API_BASE_URL}${form.logoUrl}` : form.logoUrl)
    : null;

  return (
    <div className="quizzes-page">
      <div className="mb-4">
        <h2>Branding</h2>
        <p className="text-muted mb-0">
          Customize your institution name, colors, and logo.
        </p>
      </div>

      {/* Superadmin: tenant selector */}
      {isSuperAdmin && (
        <div className="dash-card mb-4">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <label className="fw-semibold mb-0" style={{ minWidth: 90 }}>Tenant</label>
            <select
              className={`form-select ${!selectedTenantId ? "border-warning" : ""}`}
              style={{ maxWidth: 300 }}
              value={selectedTenantId}
              onChange={(e) => { setSelectedTenantId(e.target.value); setLogoError(false); }}
            >
              <option value="">— Select tenant —</option>
              {tenants.map((t) => (
                <option key={t._id} value={t.tenantId}>
                  {t.name || t.tenantId}
                </option>
              ))}
            </select>
            {!selectedTenantId && (
              <small className="text-warning">Select a tenant to view or edit branding</small>
            )}
          </div>
        </div>
      )}

      {(!isSuperAdmin || selectedTenantId) && (
        <>
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

            {logoSrc && !logoError && (
              <div className="mb-3">
                <img
                  src={logoSrc}
                  alt="Institution logo"
                  onError={() => {
                    setLogoError(true);
                    toast.error("Logo could not be loaded — the file may be missing on the server");
                  }}
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

            {logoSrc && logoError && (
              <div
                className="mb-3 p-3 rounded text-muted"
                style={{ border: "1px dashed var(--border-color)", fontSize: "0.85em" }}
              >
                Logo file not found on server — upload a new logo to replace it.
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
        </>
      )}

      {isSuperAdmin && !selectedTenantId && (
        <div
          className="dash-card text-muted text-center py-4"
          style={{ fontSize: "0.9em" }}
        >
          Select a tenant above to view and edit branding settings.
        </div>
      )}
    </div>
  );
}
