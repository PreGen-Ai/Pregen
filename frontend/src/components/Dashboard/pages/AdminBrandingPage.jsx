import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import { useAuthContext } from "../../../context/AuthContext.js";
import api from "../../../services/api/api.js";
import { API_BASE_URL } from "../../../services/api/http.js";
import useActiveTenantScope from "../hooks/useActiveTenantScope.js";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";

export default function AdminBrandingPage() {
  const { user } = useAuthContext() || {};
  const navigate = useNavigate();
  const isSuperAdmin = String(user?.role || "").toUpperCase() === "SUPERADMIN";
  const institutionName =
    user?.tenantName || user?.institutionName || user?.tenantId || "";
  const { tenantId: activeTenantId, tenantName: activeTenantName } =
    useActiveTenantScope();

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

  const schoolLabel =
    activeTenantName || activeTenantId || institutionName || "your school";

  const load = useCallback(async () => {
    if (isSuperAdmin && !activeTenantId) {
      setForm({
        institutionName: "",
        primaryColor: "#D4AF37",
        logoUrl: "",
      });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await api.admin.getBranding();
      const branding = res?.branding || res || {};
      setLogoError(false);
      setForm({
        institutionName: branding.institutionName || "",
        primaryColor: branding.primaryColor || "#D4AF37",
        logoUrl: branding.logoUrl || "",
      });
    } catch (e) {
      toast.error(e?.message || "Failed to load branding");
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, isSuperAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (isSuperAdmin && !activeTenantId) {
      toast.error("Select a school before saving branding");
      return;
    }

    setSaving(true);
    try {
      await api.admin.updateBranding({
        institutionName: form.institutionName,
        primaryColor: form.primaryColor,
        ...(form.logoUrl ? { logoUrl: form.logoUrl } : {}),
      });
      toast.success("Branding saved");
    } catch (e) {
      toast.error(e?.message || "Failed to save branding");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file) => {
    if (isSuperAdmin && !activeTenantId) {
      toast.error("Select a school before uploading a logo");
      return;
    }

    setUploading(true);
    try {
      const res = await api.admin.uploadLogo(file);
      const url = res?.logoUrl || res?.url || "";
      if (!url) {
        toast.error("Upload succeeded but no URL was returned");
        return;
      }
      setLogoError(false);
      setForm((prev) => ({ ...prev, logoUrl: url }));
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e?.message || "Failed to upload logo");
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <LoadingSpinner message="Loading branding settings..." />;

  const logoSrc = form.logoUrl
    ? form.logoUrl.startsWith("/")
      ? `${API_BASE_URL}${form.logoUrl}`
      : form.logoUrl
    : null;

  return (
    <div className="quizzes-page">
      <div className="dash-page-header">
        <div>
          <div className="dash-page-kicker">School Scope</div>
          <h2 className="dash-page-title">Branding</h2>
          <p className="dash-page-subtitle">
            Customize the name, primary color, and logo shown to users in{" "}
            <strong>{schoolLabel}</strong>.
          </p>
        </div>
        <div className="dash-page-actions">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={load}
            disabled={saving || uploading}
          >
            Reload
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={save}
            disabled={saving || uploading}
          >
            {saving ? "Saving..." : "Save Branding"}
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
                You are editing branding for <strong>{schoolLabel}</strong>.
              </>
            ) : (
              <>
                Choose a school before editing school-scoped branding.
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
            Branding is school-specific. Select a school from the Schools page,
            then return here to update how that school is presented to admins,
            teachers, students, and parents.
          </p>
        </div>
      ) : (
        <div className="row g-4">
          <div className="col-xl-6">
            <div className="dash-card h-100">
              <h3 className="dash-card-title mb-4">Identity</h3>

              <div className="mb-3">
                <label className="form-label fw-semibold">
                  School name
                </label>
                <input
                  className="form-control"
                  value={form.institutionName}
                  placeholder="e.g. Springfield Academy"
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      institutionName: e.target.value,
                    }))
                  }
                />
                <div className="form-text">
                  Used in dashboard headers, branded screens, and email copy
                  when that surface supports school branding.
                </div>
              </div>

              <div className="mb-0">
                <label className="form-label fw-semibold">
                  Primary color
                </label>
                <div className="d-flex gap-3 align-items-center">
                  <input
                    type="color"
                    className="form-control form-control-color"
                    value={form.primaryColor}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        primaryColor: e.target.value,
                      }))
                    }
                    style={{ width: 60, height: 40 }}
                  />
                  <input
                    className="form-control"
                    value={form.primaryColor}
                    placeholder="#D4AF37"
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        primaryColor: e.target.value,
                      }))
                    }
                    style={{ maxWidth: 140 }}
                  />
                </div>
                <div className="form-text">
                  Use a high-contrast color that remains readable on both light
                  and dark surfaces.
                </div>
              </div>
            </div>
          </div>

          <div className="col-xl-6">
            <div className="dash-card h-100">
              <h3 className="dash-card-title mb-4">Logo</h3>

              {logoSrc && !logoError ? (
                <div className="mb-3">
                  <img
                    src={logoSrc}
                    alt={`${schoolLabel} logo`}
                    onError={() => {
                      setLogoError(true);
                      toast.error(
                        "Logo could not be loaded. Upload a new logo to replace it.",
                      );
                    }}
                    style={{
                      maxHeight: 88,
                      maxWidth: 260,
                      borderRadius: 10,
                      objectFit: "contain",
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid var(--border-color)",
                      padding: 10,
                    }}
                  />
                </div>
              ) : null}

              {logoSrc && logoError ? (
                <div className="dash-inline-note mb-3">
                  The saved logo file could not be loaded from the server. Upload
                  a replacement to restore the school logo.
                </div>
              ) : null}

              {!logoSrc ? (
                <div className="dash-inline-note mb-3">
                  No logo has been uploaded for this school yet.
                </div>
              ) : null}

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

              <div className="d-flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading
                    ? "Uploading..."
                    : form.logoUrl
                      ? "Replace Logo"
                      : "Upload Logo"}
                </button>
              </div>
              <div className="form-text mt-3">
                Accepted formats: PNG, JPG, or SVG. Recommended size: around
                240 x 80 px.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
