// src/pages/superadmin/TenantsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaSyncAlt,
  FaExclamationTriangle,
  FaSearch,
  FaCopy,
  FaFileExport,
  FaSortAmountDown,
  FaSortAmountUp,
  FaTimes,
} from "react-icons/fa";
import { toast } from "react-toastify";

// ✅ adjust if your path differs
import api from "../../../../services/api/api.js";
// ✅ uses your existing dashboard tool styling
import "../../../styles/admin-tools.css";

const GOLD = "#D4AF37";
const EMPTY_TENANT_FORM = {
  tenantId: "",
  name: "",
  status: "trial",
  plan: "basic",
  subdomain: "",
  primaryColor: "",
};

const fmtInt = (v) => new Intl.NumberFormat().format(Number(v || 0));
const fmtMoney = (v) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v || 0));

function exportCsv(rows) {
  const headers = [
    "tenantId",
    "name",
    "status",
    "plan",
    "students",
    "teachers",
    "aiCalls7d",
    "cost7d",
    "createdAt",
  ];

  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r?.[h])).join(",")),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `tenants_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const count = (t, key, memberKey) => {
  const direct = t?.[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;

  const arr = t?.members?.[memberKey];
  return Array.isArray(arr) ? arr.length : 0;
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text));
  } catch {
    // ignore
  }
}

function statusStyle(status) {
  const s = String(status || "").toLowerCase();
  if (s === "active")
    return {
      bg: "rgba(34,197,94,0.10)",
      bd: "rgba(34,197,94,0.35)",
      tx: "#86efac",
    };
  if (s === "trial")
    return {
      bg: "rgba(245,158,11,0.12)",
      bd: "rgba(245,158,11,0.35)",
      tx: "#fbbf24",
    };
  if (s === "suspended")
    return {
      bg: "rgba(239,68,68,0.10)",
      bd: "rgba(239,68,68,0.35)",
      tx: "#fca5a5",
    };
  return {
    bg: "rgba(255,255,255,0.06)",
    bd: "rgba(255,255,255,0.12)",
    tx: "#D1D5DB",
  };
}

function planStyle(plan) {
  const p = String(plan || "").toLowerCase();
  if (p === "enterprise")
    return {
      bg: "rgba(34,197,94,0.10)",
      bd: "rgba(34,197,94,0.35)",
      tx: "#86efac",
    };
  if (p === "pro")
    return {
      bg: "rgba(245,158,11,0.12)",
      bd: "rgba(245,158,11,0.35)",
      tx: "#fbbf24",
    };
  return {
    bg: "rgba(255,255,255,0.06)",
    bd: "rgba(255,255,255,0.12)",
    tx: "#D1D5DB",
  };
}

const Pill = ({ children, style = {} }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 12px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.04)",
      color: "#E5E7EB",
      fontSize: 12,
      fontWeight: 800,
      ...style,
    }}
  >
    {children}
  </span>
);

const MiniCard = ({ title, value, sub }) => (
  <div
    style={{
      borderRadius: 18,
      border: "1px solid rgba(255,255,255,0.12)",
      background:
        "linear-gradient(180deg, rgba(17,24,39,0.65), rgba(17,24,39,0.35))",
      padding: 14,
      boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    }}
  >
    <div
      style={{
        fontSize: 11,
        letterSpacing: 1,
        textTransform: "uppercase",
        opacity: 0.75,
      }}
    >
      {title}
    </div>
    <div
      style={{ fontSize: 22, fontWeight: 1000, marginTop: 6, color: "#F9FAFB" }}
    >
      {value}
    </div>
    {sub ? (
      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{sub}</div>
    ) : null}
  </div>
);

function sortRows(rows, key, dir) {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a?.[key];
    const bv = b?.[key];

    if (key === "createdAt") {
      const ad = av ? new Date(av).getTime() : 0;
      const bd = bv ? new Date(bv).getTime() : 0;
      return (ad - bd) * mul;
    }

    if (typeof av === "number" && typeof bv === "number")
      return (av - bv) * mul;

    return String(av ?? "").localeCompare(String(bv ?? "")) * mul;
  });
}

function DetailModal({ open, onClose, tenant }) {
  if (!open || !tenant) return null;

  const st = statusStyle(tenant.status);
  const pl = planStyle(tenant.plan);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999 }}>
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.55)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          width: "min(940px, 94vw)",
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,0.14)",
          background:
            "linear-gradient(180deg, rgba(17,24,39,0.92), rgba(17,24,39,0.70))",
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid rgba(255,255,255,0.10)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 1000, color: "#F9FAFB" }}>
              {tenant.name}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              {tenant.tenantId}
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 10,
              }}
            >
              <Pill
                style={{ background: st.bg, borderColor: st.bd, color: st.tx }}
              >
                {tenant.status || "unknown"}
              </Pill>
              <Pill
                style={{ background: pl.bg, borderColor: pl.bd, color: pl.tx }}
              >
                {tenant.plan || "-"}
              </Pill>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            style={{
              borderRadius: 14,
              padding: "10px 12px",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <FaTimes />
            Close
          </button>
        </div>

        <div
          style={{
            padding: 16,
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gap: 12,
          }}
        >
          <div style={{ gridColumn: "span 3" }}>
            <MiniCard
              title="Students"
              value={fmtInt(tenant.students)}
              sub="Current"
            />
          </div>
          <div style={{ gridColumn: "span 3" }}>
            <MiniCard
              title="Teachers"
              value={fmtInt(tenant.teachers)}
              sub="Current"
            />
          </div>
          <div style={{ gridColumn: "span 3" }}>
            <MiniCard
              title="AI Calls (7d)"
              value={fmtInt(tenant.aiCalls7d)}
              sub="Usage"
            />
          </div>
          <div style={{ gridColumn: "span 3" }}>
            <MiniCard
              title="Cost (7d)"
              value={fmtMoney(tenant.cost7d)}
              sub="Estimated"
            />
          </div>

          <div style={{ gridColumn: "span 12" }}>
            <div
              style={{
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                padding: 14,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                Created:{" "}
                <span style={{ fontWeight: 900, color: "#F9FAFB" }}>
                  {tenant.createdAt
                    ? new Date(tenant.createdAt).toLocaleString()
                    : "-"}
                </span>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{
                    borderRadius: 14,
                    padding: "10px 12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                  onClick={() => copyText(tenant.tenantId)}
                >
                  <FaCopy />
                  Copy tenantId
                </button>

                <Link
                  className="btn-gold"
                  style={{
                    borderRadius: 14,
                    padding: "10px 12px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    textDecoration: "none",
                    background: GOLD,
                    color: "#111827",
                    fontWeight: 1000,
                  }}
                  to={`/dashboard/superadmin/tenants/${encodeURIComponent(tenant.tenantId)}`}
                >
                  View tenant
                </Link>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
              Suspend, plan changes, limits can be wired when backend PATCH
              endpoints exist.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TenantsPage() {
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState([]);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");

  const [sortKey, setSortKey] = useState("createdAt");
  const [sortDir, setSortDir] = useState("desc");

  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [tenantForm, setTenantForm] = useState(EMPTY_TENANT_FORM);
  const [tenantSaving, setTenantSaving] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState("");

  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError("");

      // ✅ Backend: GET /api/admin/system/super/tenants?limit=200
      const data = await api.admin.listTenants({ limit: 200 });

      if (!aliveRef.current) return;

      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : [];

      setTenants(items);
      setLastUpdatedAt(new Date());
    } catch (e) {
      if (!aliveRef.current) return;
      setError(e?.message || "Unable to load tenants.");
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetTenantForm = () => {
    setTenantForm(EMPTY_TENANT_FORM);
    setEditingTenantId("");
  };

  const startEditTenant = (tenant) => {
    setEditingTenantId(tenant.tenantId || "");
    setTenantForm({
      tenantId: tenant.tenantId || "",
      name: tenant.name || "",
      status: tenant.status || "trial",
      plan: tenant.plan || "basic",
      subdomain: tenant.branding?.subdomain || "",
      primaryColor: tenant.branding?.primaryColor || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveTenant = async () => {
    if (!String(tenantForm.tenantId || "").trim() || !String(tenantForm.name || "").trim()) {
      toast.error("Tenant ID and name are required");
      return;
    }

    const payload = {
      tenantId: tenantForm.tenantId.trim(),
      name: tenantForm.name.trim(),
      status: tenantForm.status,
      plan: tenantForm.plan,
      branding: {
        subdomain: tenantForm.subdomain.trim(),
        primaryColor: tenantForm.primaryColor.trim(),
      },
    };

    try {
      setTenantSaving(true);
      if (editingTenantId) {
        await api.admin.updateTenant(editingTenantId, payload);
        toast.success("Tenant updated");
      } else {
        await api.admin.createTenant(payload);
        toast.success("Tenant created");
      }
      resetTenantForm();
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to save tenant");
    } finally {
      setTenantSaving(false);
    }
  };

  const deleteTenant = async (tenant) => {
    const tenantId = tenant?.tenantId;
    if (!tenantId) return;
    const tenantName = tenant.name || tenantId;
    const confirmed = window.confirm(
      `⚠️ Delete tenant "${tenantName}"?\n\nThis will permanently remove all users, courses, classes, and data for this tenant. This cannot be undone.\n\nClick OK to confirm deletion.`,
    );
    if (!confirmed) return;

    try {
      setTenantSaving(true);
      await api.admin.deleteTenant(tenantId);
      toast.success("Tenant deleted");
      if (selectedTenant?.tenantId === tenantId) {
        setSelectedTenant(null);
      }
      if (editingTenantId === tenantId) {
        resetTenantForm();
      }
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to delete tenant");
    } finally {
      setTenantSaving(false);
    }
  };

  useEffect(() => setPage(1), [q, status, plan]);

  const totals = useMemo(() => {
    const out = { active: 0, trial: 0, suspended: 0, total: tenants.length };
    for (const t of tenants) {
      const s = String(t.status || "").toLowerCase();
      if (s === "active") out.active += 1;
      else if (s === "trial") out.trial += 1;
      else if (s === "suspended") out.suspended += 1;
    }
    return out;
  }, [tenants]);

  const plans = useMemo(() => {
    const set = new Set();
    for (const t of tenants) if (t.plan) set.add(String(t.plan).toLowerCase());
    return ["all", ...Array.from(set).sort()];
  }, [tenants]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const s = status.toLowerCase();
    const p = plan.toLowerCase();

    return tenants.filter((t) => {
      const okStatus =
        s === "all" ? true : String(t.status || "").toLowerCase() === s;
      const okPlan =
        p === "all" ? true : String(t.plan || "").toLowerCase() === p;

      const okQuery =
        !needle ||
        String(t.name || "")
          .toLowerCase()
          .includes(needle) ||
        String(t.tenantId || "")
          .toLowerCase()
          .includes(needle) ||
        String(t.plan || "")
          .toLowerCase()
          .includes(needle);

      return okStatus && okPlan && okQuery;
    });
  }, [tenants, q, status, plan]);

  const sorted = useMemo(
    () => sortRows(filtered, sortKey, sortDir),
    [filtered, sortKey, sortDir],
  );

  const pages = useMemo(
    () => Math.max(1, Math.ceil(sorted.length / pageSize)),
    [sorted.length],
  );
  const pageSafe = Math.min(Math.max(1, page), pages);

  const pageRows = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, pageSafe, pageSize]);

  const kpiCalls = useMemo(
    () => sorted.reduce((a, r) => a + Number(r.aiCalls7d || 0), 0),
    [sorted],
  );
  const kpiCost = useMemo(
    () => sorted.reduce((a, r) => a + Number(r.cost7d || 0), 0),
    [sorted],
  );

  const onSort = (key) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("desc");
      return;
    }
    setSortDir((d) => (d === "desc" ? "asc" : "desc"));
  };

  const SortIcon = ({ active }) => {
    if (!active) return <span style={{ opacity: 0.35, marginLeft: 8 }}>▾</span>;
    return sortDir === "desc" ? (
      <FaSortAmountDown style={{ marginLeft: 8, opacity: 0.9 }} />
    ) : (
      <FaSortAmountUp style={{ marginLeft: 8, opacity: 0.9 }} />
    );
  };

  return (
    <div className="admin-shell">
      <div className="admin-content">
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="admin-title">Schools and Universities</div>
            <div style={{ color: "#D1D5DB", marginTop: 6 }}>
              Multi-tenant control plane: status, plan, headcounts, AI cost
              signals.
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                marginTop: 12,
              }}
            >
              <button
                type="button"
                className="btn-ghost"
                style={{ borderRadius: 999 }}
                onClick={() => setStatus("active")}
              >
                <Pill
                  style={{
                    borderColor: "rgba(34,197,94,0.35)",
                    background: "rgba(34,197,94,0.10)",
                  }}
                >
                  {totals.active} active
                </Pill>
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ borderRadius: 999 }}
                onClick={() => setStatus("trial")}
              >
                <Pill
                  style={{
                    borderColor: "rgba(245,158,11,0.35)",
                    background: "rgba(245,158,11,0.12)",
                  }}
                >
                  {totals.trial} trial
                </Pill>
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ borderRadius: 999 }}
                onClick={() => setStatus("suspended")}
              >
                <Pill
                  style={{
                    borderColor: "rgba(239,68,68,0.35)",
                    background: "rgba(239,68,68,0.10)",
                  }}
                >
                  {totals.suspended} suspended
                </Pill>
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ borderRadius: 999 }}
                onClick={() => setStatus("all")}
              >
                <Pill>{totals.total} total</Pill>
              </button>

              {lastUpdatedAt ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    opacity: 0.65,
                  }}
                >
                  Updated {lastUpdatedAt.toLocaleTimeString()}
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-ghost"
              style={{
                borderRadius: 14,
                display: "inline-flex",
                gap: 10,
                alignItems: "center",
              }}
              onClick={resetTenantForm}
            >
              New Tenant
            </button>

            <button
              type="button"
              className="btn-ghost"
              style={{
                borderRadius: 14,
                display: "inline-flex",
                gap: 10,
                alignItems: "center",
              }}
              onClick={() => exportCsv(sorted)}
              disabled={loading || !sorted.length}
            >
              <FaFileExport />
              Export CSV
            </button>

            <button
              type="button"
              className="btn-gold"
              style={{
                borderRadius: 14,
                display: "inline-flex",
                gap: 10,
                alignItems: "center",
                background: GOLD,
                color: "#111827",
                fontWeight: 1000,
              }}
              onClick={load}
              disabled={loading}
            >
              <FaSyncAlt />
              Refresh
            </button>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div className="card" style={{ borderRadius: 22, overflow: "hidden" }}>
          <div className="card-inner">
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <div>
                <div style={{ fontSize: 18, fontWeight: 1000, color: "#F9FAFB" }}>
                  {editingTenantId ? "Edit tenant" : "Create tenant"}
                </div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  Use the canonical superadmin tenant CRUD route.
                </div>
              </div>
              {editingTenantId ? (
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ borderRadius: 14, padding: "10px 14px" }}
                  onClick={resetTenantForm}
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>

            <div className="row g-3">
              <div className="col-md-3">
                <label className="form-label">Tenant ID</label>
                <input
                  className="input"
                  value={tenantForm.tenantId}
                  disabled={!!editingTenantId}
                  onChange={(e) =>
                    setTenantForm((prev) => ({ ...prev, tenantId: e.target.value }))
                  }
                  placeholder="tenant-id"
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">Name</label>
                <input
                  className="input"
                  value={tenantForm.name}
                  onChange={(e) =>
                    setTenantForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Tenant name"
                />
              </div>
              <div className="col-md-2">
                <label className="form-label">Status</label>
                <select
                  className="select"
                  value={tenantForm.status}
                  onChange={(e) =>
                    setTenantForm((prev) => ({ ...prev, status: e.target.value }))
                  }
                >
                  <option value="trial">trial</option>
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label">Plan</label>
                <select
                  className="select"
                  value={tenantForm.plan}
                  onChange={(e) =>
                    setTenantForm((prev) => ({ ...prev, plan: e.target.value }))
                  }
                >
                  <option value="basic">basic</option>
                  <option value="pro">pro</option>
                  <option value="enterprise">enterprise</option>
                </select>
              </div>
              <div className="col-md-2">
                <label className="form-label">Subdomain</label>
                <input
                  className="input"
                  value={tenantForm.subdomain}
                  onChange={(e) =>
                    setTenantForm((prev) => ({ ...prev, subdomain: e.target.value }))
                  }
                  placeholder="subdomain"
                />
              </div>
              <div className="col-md-3">
                <label className="form-label">Primary Color</label>
                <input
                  className="input"
                  value={tenantForm.primaryColor}
                  onChange={(e) =>
                    setTenantForm((prev) => ({ ...prev, primaryColor: e.target.value }))
                  }
                  placeholder="#D4AF37"
                />
              </div>
            </div>

            <div className="d-flex gap-2 flex-wrap mt-3">
              <button
                type="button"
                className="btn-gold"
                style={{
                  borderRadius: 14,
                  padding: "10px 14px",
                  background: GOLD,
                  color: "#111827",
                  fontWeight: 1000,
                }}
                onClick={saveTenant}
                disabled={tenantSaving}
              >
                {tenantSaving
                  ? "Saving..."
                  : editingTenantId
                    ? "Update Tenant"
                    : "Create Tenant"}
              </button>
              <Link
                className="btn-ghost"
                style={{ borderRadius: 14, padding: "10px 14px", textDecoration: "none" }}
                to="/dashboard/admin/branding"
              >
                Manage Branding
              </Link>
              <Link
                className="btn-ghost"
                style={{ borderRadius: 14, padding: "10px 14px", textDecoration: "none" }}
                to="/dashboard/superadmin/ai-cost"
              >
                View AI Usage
              </Link>
              <Link
                className="btn-ghost"
                style={{ borderRadius: 14, padding: "10px 14px", textDecoration: "none" }}
                to={
                  selectedTenant?.tenantId
                    ? `/dashboard/superadmin/tenants/${encodeURIComponent(selectedTenant.tenantId)}`
                    : "/dashboard/admin/users"
                }
              >
                {selectedTenant?.tenantId ? "Manage Selected Tenant" : "Open User Tools"}
              </Link>
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        {/* KPI row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <MiniCard
            title="Shown"
            value={fmtInt(sorted.length)}
            sub="After filters"
          />
          <MiniCard
            title="Tenants"
            value={fmtInt(tenants.length)}
            sub="Loaded from API"
          />
          <MiniCard
            title="AI Calls (7d)"
            value={fmtInt(kpiCalls)}
            sub="Sum of filtered"
          />
          <MiniCard
            title="Cost (7d)"
            value={fmtMoney(kpiCost)}
            sub="Sum of filtered"
          />
        </div>

        <div style={{ height: 14 }} />

        {/* Controls + Table */}
        <div className="card" style={{ borderRadius: 22, overflow: "hidden" }}>
          <div className="card-inner">
            {/* Filters */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(17,24,39,0.35)",
                    padding: "10px 12px",
                    minWidth: 320,
                  }}
                >
                  <FaSearch style={{ opacity: 0.7 }} />
                  <input
                    className="input"
                    style={{
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      margin: 0,
                      outline: "none",
                    }}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by name, id, plan"
                  />
                </div>

                <select
                  className="select"
                  style={{ borderRadius: 14 }}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="trial">Trial</option>
                  <option value="suspended">Suspended</option>
                </select>

                <select
                  className="select"
                  style={{ borderRadius: 14 }}
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                >
                  {plans.map((p) => (
                    <option key={p} value={p}>
                      {p === "all" ? "All plans" : p}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <Pill
                  style={{
                    borderColor: "rgba(212,175,55,0.35)",
                    background: "rgba(212,175,55,0.10)",
                    color: "#fde68a",
                  }}
                >
                  {fmtInt(sorted.length)} shown
                </Pill>
                <Pill>{fmtInt(tenants.length)} total</Pill>
              </div>
            </div>

            {/* Error */}
            {error ? (
              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  borderRadius: 18,
                  border: "1px solid rgba(239,68,68,0.35)",
                  background: "rgba(239,68,68,0.08)",
                  color: "#fecaca",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontWeight: 900,
                  }}
                >
                  <FaExclamationTriangle />
                  {error}
                </div>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 8 }}>
                  Endpoint: <code>/api/admin/system/super/tenants</code>
                </div>
              </div>
            ) : null}

            <div style={{ height: 14 }} />

            {/* Table */}
            <div
              style={{
                borderRadius: 18,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Tenant</th>

                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => onSort("status")}
                    >
                      Status <SortIcon active={sortKey === "status"} />
                    </th>

                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => onSort("plan")}
                    >
                      Plan <SortIcon active={sortKey === "plan"} />
                    </th>

                    <th
                      style={{ cursor: "pointer", textAlign: "right" }}
                      onClick={() => onSort("students")}
                    >
                      Students <SortIcon active={sortKey === "students"} />
                    </th>

                    <th
                      style={{ cursor: "pointer", textAlign: "right" }}
                      onClick={() => onSort("teachers")}
                    >
                      Teachers <SortIcon active={sortKey === "teachers"} />
                    </th>

                    <th
                      style={{ cursor: "pointer", textAlign: "right" }}
                      onClick={() => onSort("aiCalls7d")}
                    >
                      AI Calls (7d){" "}
                      <SortIcon active={sortKey === "aiCalls7d"} />
                    </th>

                    <th
                      style={{ cursor: "pointer", textAlign: "right" }}
                      onClick={() => onSort("cost7d")}
                    >
                      Cost (7d) <SortIcon active={sortKey === "cost7d"} />
                    </th>

                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => onSort("createdAt")}
                    >
                      Created <SortIcon active={sortKey === "createdAt"} />
                    </th>

                    <th style={{ width: 180 }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 18, color: "#D1D5DB" }}>
                        Loading…
                      </td>
                    </tr>
                  ) : null}

                  {!loading &&
                    pageRows.map((t) => {
                      const st = statusStyle(t.status);
                      const pl = planStyle(t.plan);

                      return (
                        <tr
                          key={t.tenantId}
                          style={{ cursor: "pointer" }}
                          onClick={() => setSelectedTenant(t)}
                          title="Open details"
                        >
                          <td>
                            <div style={{ fontWeight: 1000 }}>
                              {t.name || "-"}
                            </div>
                            <div
                              style={{
                                color: "#000000",
                                display: "flex",
                                gap: 10,
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              <span>{t.tenantId}</span>
                              <button
                                type="button"
                                className="btn-ghost"
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 12,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyText(t.tenantId);
                                }}
                                title="Copy tenantId"
                              >
                                <FaCopy />
                              </button>
                            </div>
                          </td>

                          <td>
                            <Pill
                              style={{
                                background: st.bg,
                                borderColor: st.bd,
                                color: st.tx,
                              }}
                            >
                              {t.status || "unknown"}
                            </Pill>
                          </td>

                          <td>
                            <Pill
                              style={{
                                background: pl.bg,
                                borderColor: pl.bd,
                                color: pl.tx,
                              }}
                            >
                              {t.plan || "-"}
                            </Pill>
                          </td>

                          <td style={{ textAlign: "right" }}>
                            {fmtInt(count(t, "students", "students"))}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {fmtInt(count(t, "teachers", "teachers"))}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {fmtInt(t.aiCalls7d)}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {fmtMoney(t.cost7d)}
                          </td>

                          <td>
                            {t.createdAt
                              ? new Date(t.createdAt).toLocaleDateString()
                              : "-"}
                          </td>

                          <td>
                            <div className="actions">
                              <Link
                                className="btn-gold"
                                style={{
                                  borderRadius: 12,
                                  padding: "8px 12px",
                                  background: GOLD,
                                  color: "#111827",
                                  fontWeight: 1000,
                                  textDecoration: "none",
                                }}
                                to={`/dashboard/superadmin/tenants/${encodeURIComponent(t.tenantId)}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                View
                              </Link>
                              <Link
                                className="btn-ghost"
                                style={{
                                  borderRadius: 12,
                                  padding: "8px 12px",
                                  textDecoration: "none",
                                }}
                                to={`/dashboard/superadmin/tenants/${encodeURIComponent(t.tenantId)}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                Users
                              </Link>

                              <button
                                type="button"
                                className="btn-ghost"
                                style={{
                                  borderRadius: 12,
                                  padding: "8px 12px",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTenant(t);
                                }}
                              >
                                Details
                              </button>

                              <button
                                type="button"
                                className="btn-ghost"
                                style={{
                                  borderRadius: 12,
                                  padding: "8px 12px",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditTenant(t);
                                }}
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                className="btn-ghost"
                                style={{
                                  borderRadius: 12,
                                  padding: "8px 12px",
                                  color: "#fecaca",
                                  borderColor: "rgba(239,68,68,0.35)",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteTenant(t);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                  {!loading && pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 18, color: "#D1D5DB" }}>
                        No tenants match your filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div style={{ height: 12 }} />

            {/* Pagination */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Page {pageSafe} of {pages} · {pageSize} per page
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ borderRadius: 14, padding: "10px 14px" }}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pageSafe <= 1}
                >
                  Prev
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ borderRadius: 14, padding: "10px 14px" }}
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={pageSafe >= pages}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal */}
        <DetailModal
          open={!!selectedTenant}
          onClose={() => setSelectedTenant(null)}
          tenant={selectedTenant}
        />
      </div>
    </div>
  );
}
