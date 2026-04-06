// src/pages/tools/BrandingPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import api from "../../services/api/api.js";
import { API_BASE_URL } from "../../services/api/http.js";
import "../../components/styles/admin-tools.css";

const DEFAULT_BRANDING = {
  institutionName: "PreGen",
  primaryColor: "#D4AF37",
  logoUrl: "",
};

function isHexColor(v) {
  return /^#[0-9a-fA-F]{6}$/.test(String(v || ""));
}

function mergeBranding(serverBranding) {
  const b =
    serverBranding && typeof serverBranding === "object" ? serverBranding : {};
  const merged = {
    ...DEFAULT_BRANDING,
    ...b,
  };

  merged.institutionName = String(
    merged.institutionName || DEFAULT_BRANDING.institutionName,
  );
  merged.primaryColor = isHexColor(merged.primaryColor)
    ? merged.primaryColor
    : DEFAULT_BRANDING.primaryColor;
  merged.logoUrl = String(merged.logoUrl || "");

  return merged;
}

function stableStringify(obj) {
  const keys = Object.keys(obj || {}).sort();
  const sorted = keys.reduce((acc, k) => {
    acc[k] = obj[k];
    return acc;
  }, {});
  return JSON.stringify(sorted);
}

export default function BrandingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState(DEFAULT_BRANDING);
  const [baseline, setBaseline] = useState(DEFAULT_BRANDING);

  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [localLogoPreview, setLocalLogoPreview] = useState("");

  const baselineSigRef = useRef(stableStringify(DEFAULT_BRANDING));
  useEffect(() => {
    baselineSigRef.current = stableStringify(baseline);
  }, [baseline]);

  const isDirty = useMemo(
    () => stableStringify(form) !== baselineSigRef.current,
    [form],
  );

  useEffect(() => {
    return () => {
      if (localLogoPreview) URL.revokeObjectURL(localLogoPreview);
    };
  }, [localLogoPreview]);

  async function load() {
    setLoading(true);
    try {
      const data = await api.admin.getBranding();

      // Accept multiple response shapes:
      // { branding: {...} } OR { settings: {...} } OR {...}
      const serverBranding = data?.branding || data?.settings || data;
      const merged = mergeBranding(serverBranding);

      setForm(merged);
      setBaseline(merged);
      setLastSavedAt(null);
    } catch (e) {
      toast.error(e?.message || "Failed to load branding");
      setForm(DEFAULT_BRANDING);
      setBaseline(DEFAULT_BRANDING);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await load();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onReset() {
    setForm(baseline);
    toast.info("Changes reset");
  }

  async function onSave() {
    if (saving) return;

    const next = mergeBranding(form);

    if (!next.institutionName.trim()) {
      toast.error("Institution name is required");
      return;
    }

    if (!isHexColor(next.primaryColor)) {
      toast.error("Primary color must be a valid hex color");
      return;
    }

    try {
      setSaving(true);

      // backend expects a flat payload (institutionName, primaryColor, logoUrl)
      const res = await api.admin.updateBranding(next);

      const savedBranding = res?.branding || res?.settings || res || next;
      const merged = mergeBranding(savedBranding);

      setForm(merged);
      setBaseline(merged);
      setLastSavedAt(new Date());

      toast.success("Branding saved");
    } catch (e) {
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const maxMb = 5;
    const isImage = file.type?.startsWith("image/");
    const tooBig = file.size > maxMb * 1024 * 1024;

    if (!isImage) {
      toast.error("Please upload an image file");
      return;
    }
    if (tooBig) {
      toast.error(`Logo file is too large. Max ${maxMb}MB`);
      return;
    }

    if (localLogoPreview) URL.revokeObjectURL(localLogoPreview);
    const previewUrl = URL.createObjectURL(file);
    setLocalLogoPreview(previewUrl);

    try {
      setUploading(true);

      const data = await api.admin.uploadLogo(file);

      // Accept multiple shapes: { logoUrl } OR { url } OR { branding: { logoUrl } }
      const url =
        data?.logoUrl ||
        data?.url ||
        data?.branding?.logoUrl ||
        data?.settings?.logoUrl ||
        "";

      if (!url) {
        toast.error("Upload succeeded but no logo URL was returned");
        return;
      }

      setForm((p) => ({ ...p, logoUrl: String(url) }));
      toast.success("Logo uploaded");
    } catch (err) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const displayedLogo = form.logoUrl || localLogoPreview;

  // Prefix relative server paths (e.g. /uploads/logo.png) with the API origin
  // so the img resolves to the backend, not the frontend dev server.
  const resolvedDisplayedLogo = displayedLogo?.startsWith("/")
    ? `${API_BASE_URL}${displayedLogo}`
    : displayedLogo;

  return (
    <div className="admin-shell">
      <div className="admin-content">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div className="admin-title">Branding</div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {isDirty ? (
              <span className="badge">Unsaved</span>
            ) : (
              <span className="badge">Saved</span>
            )}
            {lastSavedAt ? (
              <span className="badge">{lastSavedAt.toLocaleString()}</span>
            ) : null}

            <button
              className="btn-ghost"
              onClick={load}
              disabled={loading || saving || uploading}
            >
              Refresh
            </button>
            <button
              className="btn-ghost"
              onClick={onReset}
              disabled={!isDirty || saving || uploading}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-inner">
            {loading ? (
              <div>Loading...</div>
            ) : (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 220px 160px",
                    gap: 10,
                  }}
                >
                  <input
                    className="input"
                    value={form.institutionName}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        institutionName: e.target.value,
                      }))
                    }
                    placeholder="Institution name"
                    disabled={saving || uploading}
                  />

                  <input
                    className="input"
                    type="color"
                    value={
                      isHexColor(form.primaryColor)
                        ? form.primaryColor
                        : DEFAULT_BRANDING.primaryColor
                    }
                    onChange={(e) =>
                      setForm((p) => ({ ...p, primaryColor: e.target.value }))
                    }
                    title="Primary color"
                    disabled={saving || uploading}
                  />

                  <button
                    className="btn-gold"
                    onClick={onSave}
                    disabled={saving || uploading || !isDirty}
                    style={{
                      opacity: saving || uploading || !isDirty ? 0.7 : 1,
                    }}
                    title={!isDirty ? "No changes to save" : "Save branding"}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>

                <div style={{ height: 14 }} />

                <div
                  style={{
                    display: "flex",
                    gap: 18,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    className="kpi-icon"
                    style={{ width: 90, height: 90, borderRadius: 18 }}
                  >
                    {displayedLogo ? (
                      <img
                        src={resolvedDisplayedLogo}
                        alt="logo"
                        style={{ width: 64, height: 64, objectFit: "contain" }}
                        onError={() => {
                          if (form.logoUrl)
                            toast.error("Logo URL could not be loaded");
                        }}
                      />
                    ) : (
                      <div style={{ fontWeight: 900, color: "#D1D5DB" }}>
                        Logo
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ fontWeight: 1000, fontSize: 18 }}>
                      {form.institutionName}
                    </div>
                    <div style={{ color: "#D1D5DB" }}>
                      Primary: {form.primaryColor}
                    </div>

                    <div
                      style={{ marginTop: 8, color: "#D1D5DB", fontSize: 12 }}
                    >
                      {form.logoUrl ? (
                        <span style={{ fontFamily: "monospace" }}>
                          {form.logoUrl}
                        </span>
                      ) : (
                        "No logo uploaded yet"
                      )}
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        display: "flex",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <label
                        className="btn-ghost"
                        style={{
                          cursor:
                            saving || uploading ? "not-allowed" : "pointer",
                        }}
                      >
                        {uploading ? "Uploading..." : "Upload Logo"}
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={onUpload}
                          disabled={saving || uploading}
                        />
                      </label>

                      {form.logoUrl ? (
                        <button
                          className="btn-ghost"
                          onClick={() => {
                            setForm((p) => ({ ...p, logoUrl: "" }));
                            toast.info(
                              "Logo cleared locally. Click Save to apply",
                            );
                          }}
                          disabled={saving || uploading}
                          title="Clear logo URL"
                        >
                          Clear Logo
                        </button>
                      ) : null}
                    </div>

                    <div
                      style={{
                        marginTop: 12,
                        color: "#D1D5DB",
                        fontSize: 12,
                        lineHeight: 1.4,
                      }}
                    >
                      Tips:
                      <div>• Use a square PNG for best results</div>
                      <div>• Keep the logo under 5MB</div>
                      <div>• Save after changing name or primary color</div>
                    </div>
                  </div>

                  <div style={{ minWidth: 220 }}>
                    <div
                      style={{
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 14,
                        padding: 12,
                        background: "rgba(17,24,39,0.35)",
                      }}
                    >
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>
                        Preview
                      </div>
                      <div
                        style={{
                          borderRadius: 12,
                          padding: 12,
                          border: `1px solid ${form.primaryColor}`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 10,
                              display: "grid",
                              placeItems: "center",
                              border: `1px solid ${form.primaryColor}`,
                            }}
                          >
                            {displayedLogo ? (
                              <img
                                src={resolvedDisplayedLogo}
                                alt="logo"
                                style={{
                                  width: 22,
                                  height: 22,
                                  objectFit: "contain",
                                }}
                              />
                            ) : (
                              <span
                                style={{ fontWeight: 900, color: "#D1D5DB" }}
                              >
                                P
                              </span>
                            )}
                          </div>

                          <div>
                            <div style={{ fontWeight: 900 }}>
                              {form.institutionName}
                            </div>
                            <div style={{ fontSize: 12, color: "#D1D5DB" }}>
                              Dashboard header sample
                            </div>
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              padding: "6px 10px",
                              borderRadius: 999,
                              border: `1px solid ${form.primaryColor}`,
                            }}
                          >
                            Badge
                          </span>
                          <button
                            type="button"
                            style={{
                              fontSize: 12,
                              padding: "6px 10px",
                              borderRadius: 10,
                              background: form.primaryColor,
                              color: "#111827",
                              fontWeight: 900,
                            }}
                          >
                            Primary
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
