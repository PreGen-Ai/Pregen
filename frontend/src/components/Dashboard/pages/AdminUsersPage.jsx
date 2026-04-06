// Admin Users — CRUD for users via /api/admin/users
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import api from "../../../services/api/api.js";
import { useAuthContext } from "../../../context/AuthContext.js";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";

const ROLES = ["STUDENT", "TEACHER", "ADMIN"];

const emptyForm = { email: "", password: "", firstName: "", lastName: "", role: "STUDENT" };

function nameOf(u) {
  return (
    [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
    u?.name ||
    u?.username ||
    u?.email ||
    "—"
  );
}

export default function AdminUsersPage() {
  const { user } = useAuthContext() || {};
  const isSuperAdmin = String(user?.role || "").toUpperCase() === "SUPERADMIN";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);

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
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.admin.listUsers(
        { q: search || undefined, role: roleFilter || undefined, limit: 200 },
        cfg,
      );
      setUsers(Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : []);
    } catch (e) {
      toast.error(e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, selectedTenantId, search, roleFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const createUser = async () => {
    if (!form.email.trim() || !form.password.trim()) {
      toast.error("Email and password are required");
      return;
    }
    if (isSuperAdmin && !selectedTenantId) {
      toast.error("Select a tenant before creating a user");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (isSuperAdmin) {
        payload.tenantId = selectedTenantId;
      }
      await api.admin.createUser(payload);
      toast.success("User created");
      setShowCreate(false);
      setForm(emptyForm);
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (u) => {
    try {
      await api.admin.setUserStatus(u._id, !u.enabled, cfg);
      toast.success(`User ${u.enabled ? "disabled" : "enabled"}`);
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to update status");
    }
  };

  const resetPassword = async (u) => {
    if (!window.confirm(`Send a password reset email to ${u.email}?`)) return;
    try {
      await api.admin.resetUserPassword(u._id, cfg);
      toast.success("Password reset email sent");
    } catch (e) {
      toast.error(e?.message || "Failed to reset password");
    }
  };

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h2>Users</h2>
          <p className="text-muted mb-0">
            {isSuperAdmin
              ? "Create and manage user accounts across tenants."
              : "Manage user accounts, roles, and access."}
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? "Cancel" : "+ Create user"}
        </button>
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
              onChange={(e) => {
                setSelectedTenantId(e.target.value);
                setShowCreate(false);
                setForm(emptyForm);
              }}
            >
              <option value="">— Select tenant —</option>
              {tenants.map((t) => (
                <option key={t._id} value={t.tenantId}>
                  {t.name || t.tenantId}
                </option>
              ))}
            </select>
            {!selectedTenantId && (
              <small className="text-warning">Select a tenant to manage users</small>
            )}
          </div>
        </div>
      )}

      {showCreate && (!isSuperAdmin || selectedTenantId) && (
        <div className="dash-card mb-4">
          <h3 className="dash-card-title mb-1">Create user</h3>
          {isSuperAdmin && (
            <p className="text-muted mb-3" style={{ fontSize: "0.85em" }}>
              Creating under:{" "}
              <strong>
                {tenants.find((t) => t.tenantId === selectedTenantId)?.name ||
                  selectedTenantId}
              </strong>
            </p>
          )}
          <div className="row g-3">
            <div className="col-12 col-md-4">
              <label className="form-label">
                Email <span className="text-danger">*</span>
              </label>
              <input
                className="form-control"
                placeholder="user@example.com"
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label">
                Password <span className="text-danger">*</span>
              </label>
              <input
                className="form-control"
                placeholder="Temporary password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label">First name</label>
              <input
                className="form-control"
                placeholder="First name"
                value={form.firstName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, firstName: e.target.value }))
                }
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label">Last name</label>
              <input
                className="form-control"
                placeholder="Last name"
                value={form.lastName}
                onChange={(e) =>
                  setForm((p) => ({ ...p, lastName: e.target.value }))
                }
              />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label">Role</label>
              <select
                className="form-select"
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-2">
              <label className="form-label">&nbsp;</label>
              <button
                className="btn btn-primary d-block w-100"
                onClick={createUser}
                disabled={saving}
              >
                {saving ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(!isSuperAdmin || selectedTenantId) ? (
        <div className="dash-card">
          <div className="d-flex gap-3 mb-3 flex-wrap">
            <input
              className="form-control"
              style={{ maxWidth: 280 }}
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="form-select"
              style={{ maxWidth: 160 }}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <LoadingSpinner message="Loading users…" />
          ) : users.length === 0 ? (
            <EmptyState
              title="No users found"
              message="Try adjusting your search or create a new user."
            />
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id}>
                      <td>{nameOf(u)}</td>
                      <td>{u.email}</td>
                      <td>
                        <StatusBadge status={u.role} />
                      </td>
                      <td>
                        <StatusBadge
                          status={u.enabled === false ? "disabled" : "active"}
                        />
                      </td>
                      <td>
                        <div className="d-flex gap-2">
                          <button
                            className={`btn btn-sm ${
                              u.enabled === false
                                ? "btn-outline-success"
                                : "btn-outline-secondary"
                            }`}
                            onClick={() => toggleStatus(u)}
                          >
                            {u.enabled === false ? "Enable" : "Disable"}
                          </button>
                          <button
                            className="btn btn-sm btn-outline-warning"
                            onClick={() => resetPassword(u)}
                          >
                            Reset pwd
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div
          className="dash-card text-muted text-center py-4"
          style={{ fontSize: "0.9em" }}
        >
          Select a tenant above to view and manage users.
        </div>
      )}
    </div>
  );
}
