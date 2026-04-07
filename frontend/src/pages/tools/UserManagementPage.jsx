import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../services/api/api.js";
import { useAuthContext } from "../../context/AuthContext";
import "../../components/styles/admin-tools.css";

const FILTER_ROLES = ["ADMIN", "TEACHER", "STUDENT", "PARENT"];
const CREATE_ROLES = ["ADMIN", "TEACHER", "STUDENT"];

const isEmail = (v) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(v || "")
      .trim()
      .toLowerCase(),
  );

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getEnabled = (u) => {
  if (typeof u?.enabled === "boolean") return u.enabled;
  if (typeof u?.disabled === "boolean") return !u.disabled;
  return true;
};

function normalizeRole(role) {
  return String(role || "").trim().toUpperCase();
}

function nameForUser(user) {
  return (
    user?.name ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    "—"
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text));
    toast.success("Copied");
  } catch {
    toast.error("Copy failed");
  }
}

export default function UserManagementPage() {
  const { user } = useAuthContext();
  const role = normalizeRole(user?.role);
  const isSuperAdmin = role === "SUPERADMIN";

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [status, setStatus] = useState("");
  const [applied, setApplied] = useState({
    q: "",
    role: "",
    status: "",
    tenantId: "",
  });

  const [createForm, setCreateForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    role: "STUDENT",
  });
  const [creating, setCreating] = useState(false);
  const [lastCreateResult, setLastCreateResult] = useState(null);

  const [invite, setInvite] = useState({
    name: "",
    email: "",
    role: "STUDENT",
    password: "",
  });
  const [inviting, setInviting] = useState(false);
  const [lastInviteResult, setLastInviteResult] = useState(null);

  const [busy, setBusy] = useState({});
  const setBusyFor = (userId, val) => setBusy((p) => ({ ...p, [userId]: val }));

  // Load tenant list for superadmin
  useEffect(() => {
    if (!isSuperAdmin) return;
    api.admin
      .listTenants()
      .then((res) => {
        setTenants(
          Array.isArray(res?.items)
            ? res.items
            : Array.isArray(res)
              ? res
              : [],
        );
      })
      .catch(() => {});
  }, [isSuperAdmin]);

  const debounceRef = useRef(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setApplied((p) => ({ ...p, q }));
    }, 450);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  useEffect(() => {
    setApplied((p) => ({
      ...p,
      role: roleFilter,
      status,
      tenantId: isSuperAdmin ? selectedTenantId : "",
    }));
  }, [roleFilter, status, selectedTenantId, isSuperAdmin]);

  const buildTenantConfig = (tenantId) =>
    isSuperAdmin && tenantId
      ? { headers: { "x-tenant-id": tenantId } }
      : {};

  const buildTenantBody = (body, tenantId) =>
    isSuperAdmin && tenantId ? { ...body, tenantId } : body;

  async function load(filters = applied) {
    setLoading(true);
    setError("");
    try {
      const cfg =
        isSuperAdmin && filters.tenantId
          ? { headers: { "x-tenant-id": filters.tenantId } }
          : {};
      const data = await api.admin.listUsers(
        {
          q: filters.q || "",
          role: filters.role || "",
          status: filters.status || "",
        },
        cfg,
      );

      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : [];

      setRows(items);
    } catch (e) {
      const msg = e?.message || "Failed to load users";
      setError(msg);
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      await load(applied);
      if (!alive) return;
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied.q, applied.role, applied.status, applied.tenantId, isSuperAdmin]);

  const stats = useMemo(() => {
    let enabledCount = 0;
    let disabledCount = 0;
    const roleCounts = {};
    for (const r of FILTER_ROLES) roleCounts[r] = 0;

    for (const u of rows) {
      if (getEnabled(u)) enabledCount += 1;
      else disabledCount += 1;

      const rr = normalizeRole(u?.role);
      if (roleCounts[rr] !== undefined) roleCounts[rr] += 1;
    }

    return {
      total: rows.length,
      enabledCount,
      disabledCount,
      roleCounts,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = String(applied.q || "")
      .trim()
      .toLowerCase();
    const rr = normalizeRole(applied.role);
    const st = String(applied.status || "")
      .trim()
      .toLowerCase();
    const tenantId = String(applied.tenantId || "").trim();

    return rows.filter((u) => {
      const name = nameForUser(u).toLowerCase();
      const email = String(u?.email || "").toLowerCase();
      const id = String(u?._id || "").toLowerCase();

      const okQ =
        !needle ||
        name.includes(needle) ||
        email.includes(needle) ||
        id.includes(needle);
      const okRole = !rr || normalizeRole(u?.role) === rr;
      const enabled = getEnabled(u);
      const okStatus =
        !st ||
        (st === "enabled" ? enabled : st === "disabled" ? !enabled : true);
      const okTenant =
        !tenantId || String(u?.tenantId || "").trim() === tenantId;

      return okQ && okRole && okStatus && okTenant;
    });
  }, [rows, applied.q, applied.role, applied.status, applied.tenantId]);

  async function onCreateUser() {
    if (creating) return;

    const email = createForm.email.trim().toLowerCase();
    const password = createForm.password;
    const firstName = createForm.firstName.trim();
    const lastName = createForm.lastName.trim();
    const selectedRole = normalizeRole(createForm.role || "STUDENT");

    if (isSuperAdmin && !selectedTenantId) {
      return toast.error("Tenant ID is required for superadmin user creation");
    }
    if (!email) return toast.error("Email is required");
    if (!isEmail(email)) return toast.error("Enter a valid email");
    if (password.length < 6) {
      return toast.error("Password must be at least 6 characters");
    }
    if (!CREATE_ROLES.includes(selectedRole)) {
      return toast.error("Invalid role for create-user flow");
    }

    try {
      setCreating(true);
      const result = await api.admin.createUser(
        buildTenantBody(
          {
            email,
            password,
            role: selectedRole,
            firstName,
            lastName,
            username: email.split("@")[0],
          },
          selectedTenantId,
        ),
        buildTenantConfig(selectedTenantId),
      );

      setLastCreateResult(result);
      toast.success("User created");
      setCreateForm({
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        role: "STUDENT",
      });
      await sleep(150);
      await load(applied);
    } catch (e) {
      toast.error(e?.message || "User creation failed");
    } finally {
      setCreating(false);
    }
  }

  async function onInvite() {
    if (inviting) return;

    const email = invite.email.trim().toLowerCase();
    const name = invite.name.trim();
    const roleUpper = normalizeRole(invite.role || "STUDENT");
    const password = invite.password.trim();

    if (isSuperAdmin && !selectedTenantId) {
      return toast.error("Tenant ID is required for superadmin invite flow");
    }
    if (!email) return toast.error("Email is required");
    if (!isEmail(email)) return toast.error("Enter a valid email");
    if (!CREATE_ROLES.includes(roleUpper)) return toast.error("Invalid role");
    if (password && password.length < 6) {
      return toast.error("Password must be at least 6 characters");
    }

    try {
      setInviting(true);

      const result = await api.admin.inviteUser(
        buildTenantBody(
          {
            name: name || undefined,
            email,
            role: roleUpper,
            ...(password ? { password } : {}),
          },
          selectedTenantId,
        ),
        buildTenantConfig(selectedTenantId),
      );

      setLastInviteResult(result);
      toast.success("User created");
      setInvite({ name: "", email: "", role: "STUDENT", password: "" });

      await sleep(150);
      await load(applied);
    } catch (e) {
      toast.error(e?.message || "Invite failed");
    } finally {
      setInviting(false);
    }
  }

  async function toggleEnabled(u) {
    const id = u?._id;
    if (!id) return;

    const current = getEnabled(u);
    const next = !current;

    const ok = window.confirm(next ? "Enable this user?" : "Disable this user?");
    if (!ok) return;

    try {
      setBusyFor(id, true);
      setRows((prev) =>
        prev.map((x) => (x._id === id ? { ...x, enabled: next, disabled: !next } : x)),
      );

      await api.admin.setUserStatus(
        id,
        next,
        buildTenantConfig(String(u?.tenantId || selectedTenantId || "").trim()),
      );

      toast.success("User updated");
      await load(applied);
    } catch (e) {
      toast.error(e?.message || "Update failed");
      await load(applied);
    } finally {
      setBusyFor(id, false);
    }
  }

  async function changeRole(u, nextRole) {
    const id = u?._id;
    if (!id) return;

    const next = normalizeRole(nextRole || "");
    if (!FILTER_ROLES.includes(next)) return toast.error("Invalid role");

    const ok = window.confirm(`Change role to ${next}?`);
    if (!ok) return;

    try {
      setBusyFor(id, true);
      setRows((prev) => prev.map((x) => (x._id === id ? { ...x, role: next } : x)));

      await api.admin.setUserRole(
        id,
        next,
        buildTenantConfig(String(u?.tenantId || selectedTenantId || "").trim()),
      );

      toast.success("Role updated");
      await load(applied);
    } catch (e) {
      toast.error(e?.message || "Role update failed");
      await load(applied);
    } finally {
      setBusyFor(id, false);
    }
  }

  async function doReset(u) {
    const id = u?._id;
    if (!id) return;

    const ok = window.confirm("Send a password reset for this user?");
    if (!ok) return;

    try {
      setBusyFor(id, true);
      const result = await api.admin.resetUserPassword(
        id,
        buildTenantConfig(String(u?.tenantId || selectedTenantId || "").trim()),
      );
      if (result?.tempPassword) {
        setLastInviteResult(result);
      }
      toast.success("Reset password issued");
    } catch (e) {
      toast.error(e?.message || "Reset failed");
    } finally {
      setBusyFor(id, false);
    }
  }

  return (
    <div className="admin-shell">
      <div className="admin-content">
        <div className="admin-title">User Management</div>

        {/* Tenant selector — superadmin only */}
        {isSuperAdmin && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-inner">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: 700, minWidth: 60 }}>Tenant</span>
                <select
                  className="select"
                  style={{ minWidth: 260 }}
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                >
                  <option value="">— Select tenant —</option>
                  {tenants.map((t) => (
                    <option key={t._id} value={t.tenantId}>
                      {t.name || t.tenantId}
                    </option>
                  ))}
                </select>
                {!selectedTenantId && (
                  <span
                    className="badge"
                    style={{
                      color: "#fbbf24",
                      borderColor: "rgba(234,179,8,0.4)",
                    }}
                  >
                    Select a tenant to continue
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main content — gated for superadmin until tenant selected */}
        {!isSuperAdmin || selectedTenantId ? (
          <>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <div className="card">
            <div className="card-inner">
              <div className="text-xs opacity-70">Visible Users</div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>{stats.total}</div>
              <div className="text-xs opacity-70">
                {isSuperAdmin && applied.tenantId
                  ? `Tenant: ${applied.tenantId}`
                  : isSuperAdmin
                    ? "Across current superadmin filters"
                    : "Scoped to your tenant"}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-inner">
              <div className="text-xs opacity-70">Enabled / Disabled</div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>
                {stats.enabledCount} / {stats.disabledCount}
              </div>
              <div className="text-xs opacity-70">
                Live status from canonical admin routes
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-inner">
              <div className="text-xs opacity-70">Teachers / Students</div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>
                {stats.roleCounts.TEACHER} / {stats.roleCounts.STUDENT}
              </div>
              <div className="text-xs opacity-70">
                Admins: {stats.roleCounts.ADMIN}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-inner">
              <div className="text-xs opacity-70">Quick Links</div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 10,
                }}
              >
                <Link className="btn-ghost" to="/dashboard/admin/workspace">
                  Classes
                </Link>
                <Link className="btn-ghost" to="/dashboard/admin/subjects">
                  Subjects
                </Link>
                <Link className="btn-ghost" to="/dashboard/admin/ai-controls">
                  AI Controls
                </Link>
                <Link className="btn-ghost" to="/dashboard/admin/branding">
                  Branding
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-inner">
            <div className="toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
              <input
                className="input"
                placeholder="Search name, email, id"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />

              <select
                className="select"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                title="Role filter"
              >
                <option value="">All roles</option>
                {FILTER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <select
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                title="Status filter"
              >
                <option value="">All status</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>

              <button
                className="btn-gold"
                onClick={() => load(applied)}
                disabled={loading}
              >
                {loading ? "Loading..." : "Refresh"}
              </button>

              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <span className="badge ok">{stats.enabledCount} enabled</span>
                <span className="badge off">{stats.disabledCount} disabled</span>
                <span className="badge">{stats.total} total</span>
              </div>
            </div>

            {error ? (
              <div className="admin-alert admin-alert-error">
                {error}
              </div>
            ) : null}

            <div
              style={{
                marginTop: 10,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              {FILTER_ROLES.map((r) => (
                <span key={r} className="badge">
                  {r}: {stats.roleCounts[r] || 0}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 14,
          }}
        >
          <div className="card">
            <div className="card-inner">
              <div style={{ fontWeight: 900, marginBottom: 10 }}>
                Create user with password
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 10,
                }}
              >
                <input
                  className="input"
                  placeholder="First name"
                  value={createForm.firstName}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, firstName: e.target.value }))
                  }
                  disabled={creating}
                />
                <input
                  className="input"
                  placeholder="Last name"
                  value={createForm.lastName}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, lastName: e.target.value }))
                  }
                  disabled={creating}
                />
                <input
                  className="input"
                  placeholder="Email"
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, email: e.target.value }))
                  }
                  disabled={creating}
                />
                <input
                  className="input"
                  type="password"
                  placeholder="Password"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, password: e.target.value }))
                  }
                  disabled={creating}
                />
                <select
                  className="select"
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, role: e.target.value }))
                  }
                  disabled={creating}
                >
                  {CREATE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-gold"
                  onClick={onCreateUser}
                  disabled={creating}
                >
                  {creating ? "Creating..." : "Create user"}
                </button>
              </div>

              <div className="text-xs opacity-70" style={{ marginTop: 10 }}>
                Accounts are admin-created only. {isSuperAdmin ? "Select a tenant above before creating users." : "Tenant scope is enforced from your current admin session."}
              </div>

              {lastCreateResult?.user ? (
                <div className="admin-alert admin-alert-success">
                  Created: <b>{lastCreateResult.user.email}</b>{" "}
                  <span className="badge ok">{lastCreateResult.user.role}</span>
                  {lastCreateResult.user.tenantId ? (
                    <span className="badge" style={{ marginLeft: 8 }}>
                      {lastCreateResult.user.tenantId}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="card">
            <div className="card-inner">
              <div style={{ fontWeight: 900, marginBottom: 10 }}>
                Quick create / invite
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <input
                  className="input"
                  placeholder="Name"
                  value={invite.name}
                  onChange={(e) =>
                    setInvite((p) => ({ ...p, name: e.target.value }))
                  }
                  disabled={inviting}
                />
                <input
                  className="input"
                  placeholder="Email"
                  value={invite.email}
                  onChange={(e) =>
                    setInvite((p) => ({ ...p, email: e.target.value }))
                  }
                  disabled={inviting}
                />
                <select
                  className="select"
                  value={invite.role}
                  onChange={(e) =>
                    setInvite((p) => ({ ...p, role: e.target.value }))
                  }
                  disabled={inviting}
                >
                  {CREATE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  type="password"
                  placeholder="Optional password"
                  value={invite.password}
                  onChange={(e) =>
                    setInvite((p) => ({ ...p, password: e.target.value }))
                  }
                  disabled={inviting}
                />
                <button
                  className="btn-gold"
                  onClick={onInvite}
                  disabled={inviting || !isEmail(invite.email)}
                  style={{ gridColumn: "span 2" }}
                >
                  {inviting ? "Creating..." : "Create with temp password"}
                </button>
              </div>

              <div className="text-xs opacity-70" style={{ marginTop: 10 }}>
                If you leave password empty, the backend generates a temporary password and returns it once.
              </div>

              {lastInviteResult ? (
                <div className="admin-alert admin-alert-neutral">
                  <div>
                    Created: <b>{lastInviteResult?.user?.email || lastInviteResult?.message}</b>
                  </div>
                  {lastInviteResult?.tempPassword ? (
                    <div style={{ marginTop: 8 }}>
                      Temporary password: <code>{lastInviteResult.tempPassword}</code>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div className="card">
          <div className="card-inner">
            {loading ? (
              <div>Loading...</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th style={{ width: 220 }}>Role</th>
                    <th style={{ width: 140 }}>Status</th>
                    <th style={{ width: 360 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const enabled = getEnabled(u);
                    const isRowBusy = !!busy[u._id];

                    return (
                      <tr key={u._id}>
                        <td>
                          <div style={{ fontWeight: 900 }}>
                            {nameForUser(u)}
                            {u.tenantId ? (
                              <span style={{ marginLeft: 10 }} className="badge">
                                {u.tenantId}
                              </span>
                            ) : null}
                          </div>

                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              flexWrap: "wrap",
                              opacity: 0.75,
                            }}
                          >
                            <span>{u.email}</span>
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{ padding: "4px 10px" }}
                              onClick={() => copyText(u.email)}
                              disabled={isRowBusy}
                              title="Copy email"
                            >
                              Copy email
                            </button>
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{ padding: "4px 10px" }}
                              onClick={() => copyText(u._id)}
                              disabled={isRowBusy}
                              title="Copy user id"
                            >
                              Copy id
                            </button>
                          </div>
                        </td>

                        <td>
                          <select
                            className="select"
                            value={normalizeRole(u.role)}
                            onChange={(e) => changeRole(u, e.target.value)}
                            disabled={isRowBusy}
                            title="Change role"
                          >
                            {FILTER_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td>
                          <span className={`badge ${enabled ? "ok" : "off"}`}>
                            {enabled ? "Enabled" : "Disabled"}
                          </span>
                        </td>

                        <td>
                          <div className="actions" style={{ gap: 10 }}>
                            <button
                              className="btn-ghost"
                              onClick={() => toggleEnabled(u)}
                              disabled={isRowBusy}
                              title={enabled ? "Disable user" : "Enable user"}
                            >
                              {isRowBusy ? "..." : enabled ? "Disable" : "Enable"}
                            </button>

                            <button
                              className="btn-ghost"
                              onClick={() => doReset(u)}
                              disabled={isRowBusy}
                              title="Send password reset"
                            >
                              Reset Password
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: 18, color: "#D1D5DB" }}>
                        No users found.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>
        </div>

          </>
        ) : (
          <div className="card">
            <div
              className="card-inner"
              style={{ color: "#9CA3AF", padding: "20px 0" }}
            >
              Select a tenant above to view and manage users.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
