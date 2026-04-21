import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import { useAuthContext } from "../../../context/AuthContext.js";
import api from "../../../services/api/api.js";
import { setActiveTenantContext } from "../../../services/api/http.js";
import useActiveTenantScope from "../hooks/useActiveTenantScope.js";
import EmptyState from "../components/ui/EmptyState.jsx";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";

const FILTER_ROLES = ["ADMIN", "TEACHER", "STUDENT", "PARENT"];
const CREATE_ROLES = ["ADMIN", "TEACHER", "STUDENT"];
const EMPTY_CREATE_FORM = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  role: "STUDENT",
};
const EMPTY_INVITE_FORM = {
  name: "",
  email: "",
  role: "STUDENT",
  password: "",
};

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || "")
      .trim()
      .toLowerCase(),
  );
}

function nameOf(user) {
  return (
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.name ||
    user?.username ||
    user?.email ||
    "—"
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text || ""));
    toast.success("Copied");
  } catch {
    toast.error("Copy failed");
  }
}

export default function AdminUsersPage() {
  const { user } = useAuthContext() || {};
  const navigate = useNavigate();
  const isSuperAdmin = String(user?.role || "").toUpperCase() === "SUPERADMIN";
  const institutionName =
    user?.tenantName || user?.institutionName || user?.tenantId || "";
  const { tenantId: activeTenantId, tenantName: activeTenantName } =
    useActiveTenantScope();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [tenants, setTenants] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE_FORM);
  const [lastInviteResult, setLastInviteResult] = useState(null);
  const [lastCreateResult, setLastCreateResult] = useState(null);
  const [busyUserId, setBusyUserId] = useState("");

  const schoolLabel =
    activeTenantName || activeTenantId || institutionName || "your school";
  const mutationReady = !isSuperAdmin || !!activeTenantId;
  const mutationConfig =
    isSuperAdmin && activeTenantId
      ? { headers: { "x-tenant-id": activeTenantId } }
      : {};

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.admin
      .listTenants()
      .then((response) => {
        setTenants(Array.isArray(response?.items) ? response.items : []);
      })
      .catch(() => {});
  }, [isSuperAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isSuperAdmin) {
        const response = await api.admin.listSystemUsers({
          q: search || undefined,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
          tenantId: tenantFilter || undefined,
          limit: 200,
        });

        setUsers(Array.isArray(response?.items) ? response.items : []);
        setTotal(Number(response?.total || 0));
      } else {
        const response = await api.admin.listUsers({
          q: search || undefined,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
          limit: 200,
        });

        const rows = Array.isArray(response?.items)
          ? response.items
          : Array.isArray(response)
            ? response
            : [];

        setUsers(rows);
        setTotal(Number(response?.count || rows.length));
      }
    } catch (e) {
      toast.error(e?.message || "Failed to load users");
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, roleFilter, search, statusFilter, tenantFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    return users.reduce(
      (acc, row) => {
        const enabled = row?.enabled !== false;
        if (enabled) acc.enabled += 1;
        else acc.disabled += 1;

        const role = String(row?.role || "").toUpperCase();
        if (acc.roles[role] !== undefined) acc.roles[role] += 1;
        return acc;
      },
      {
        enabled: 0,
        disabled: 0,
        roles: { ADMIN: 0, TEACHER: 0, STUDENT: 0, PARENT: 0 },
      },
    );
  }, [users]);

  const resetForms = () => {
    setCreateForm(EMPTY_CREATE_FORM);
    setInviteForm(EMPTY_INVITE_FORM);
    setShowCreate(false);
    setShowInvite(false);
  };

  const createUser = async () => {
    const email = createForm.email.trim().toLowerCase();

    if (!mutationReady) {
      toast.error("Select a school before creating users");
      return;
    }
    if (!email || !isEmail(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    if (createForm.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setSaving(true);
    try {
      const result = await api.admin.createUser(
        {
          ...createForm,
          email,
          tenantId: activeTenantId || undefined,
          username: email.split("@")[0],
        },
        mutationConfig,
      );

      setLastCreateResult(result);
      setLastInviteResult(null);
      toast.success("User created");
      setCreateForm(EMPTY_CREATE_FORM);
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  const inviteUser = async () => {
    const email = inviteForm.email.trim().toLowerCase();
    const password = inviteForm.password.trim();

    if (!mutationReady) {
      toast.error("Select a school before creating users");
      return;
    }
    if (!email || !isEmail(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    if (password && password.length < 6) {
      toast.error("Temporary password must be at least 6 characters");
      return;
    }

    setSaving(true);
    try {
      const result = await api.admin.inviteUser(
        {
          ...inviteForm,
          email,
          tenantId: activeTenantId || undefined,
          ...(password ? { password } : {}),
        },
        mutationConfig,
      );

      setLastInviteResult(result);
      setLastCreateResult(null);
      toast.success("User created");
      setInviteForm(EMPTY_INVITE_FORM);
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to create temporary-password user");
    } finally {
      setSaving(false);
    }
  };

  const canMutateRow = (row) => {
    if (!isSuperAdmin) return true;
    if (!activeTenantId) return false;
    return String(row?.tenantId || "") === String(activeTenantId);
  };

  const selectSchoolForRow = (row) => {
    if (!row?.tenantId) return;
    setActiveTenantContext(row.tenantId, row.tenantName || "");
    toast.success(`Selected school: ${row.tenantName || row.tenantId}`);
  };

  const toggleStatus = async (row) => {
    if (!canMutateRow(row)) return;

    setBusyUserId(row._id);
    try {
      await api.admin.setUserStatus(
        row._id,
        row.enabled === false,
        mutationConfig,
      );
      toast.success(
        row.enabled === false ? "User enabled" : "User disabled",
      );
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to update status");
    } finally {
      setBusyUserId("");
    }
  };

  const updateRole = async (row, nextRole) => {
    if (!canMutateRow(row)) return;

    setBusyUserId(row._id);
    try {
      await api.admin.setUserRole(row._id, nextRole, mutationConfig);
      toast.success("Role updated");
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to update role");
    } finally {
      setBusyUserId("");
    }
  };

  const resetPassword = async (row) => {
    if (!canMutateRow(row)) return;

    if (
      !window.confirm(
        `Issue a password reset for ${row.email}? This action is scoped to ${schoolLabel}.`,
      )
    ) {
      return;
    }

    setBusyUserId(row._id);
    try {
      const result = await api.admin.resetUserPassword(row._id, mutationConfig);
      setLastInviteResult(result);
      toast.success("Password reset issued");
    } catch (e) {
      toast.error(e?.message || "Failed to reset password");
    } finally {
      setBusyUserId("");
    }
  };

  const title = isSuperAdmin ? "Platform User Management" : "User Management";
  const subtitle = isSuperAdmin
    ? "View users across the platform, then use the selected school context for school-scoped changes."
    : "Manage user accounts, roles, and access for your school.";

  return (
    <div className="quizzes-page">
      <div className="dash-page-header">
        <div>
          <div className="dash-page-kicker">
            {isSuperAdmin ? "Platform Scope" : "School Scope"}
          </div>
          <h2 className="dash-page-title">{title}</h2>
          <p className="dash-page-subtitle">{subtitle}</p>
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
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setShowCreate((current) => !current);
              setShowInvite(false);
            }}
            disabled={isSuperAdmin && !activeTenantId}
          >
            {showCreate ? "Close Create Form" : "Create User"}
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => {
              setShowInvite((current) => !current);
              setShowCreate(false);
            }}
            disabled={isSuperAdmin && !activeTenantId}
          >
            {showInvite ? "Close Temp Password Form" : "Create Temp Password User"}
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
                High-risk changes are scoped to <strong>{schoolLabel}</strong>.
                Platform listing remains available across all schools.
              </>
            ) : (
              <>
                Platform listing is available now. Select a school before
                creating users, sending password resets, or editing
                school-scoped access.
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

      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="dash-card py-3 h-100">
            <div className="dash-muted-label">
              {isSuperAdmin ? "Matching Users" : "Visible Users"}
            </div>
            <div className="dash-metric-value" style={{ marginTop: 6 }}>
              {total}
            </div>
            <div className="dash-supporting-text mt-2">
              {isSuperAdmin
                ? "Across current platform filters"
                : "Scoped to your school"}
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="dash-card py-3 h-100">
            <div className="dash-muted-label">Enabled Users</div>
            <div className="dash-metric-value" style={{ marginTop: 6 }}>
              {stats.enabled}
            </div>
            <div className="dash-supporting-text mt-2">
              {stats.disabled} disabled in the current result set
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="dash-card py-3 h-100">
            <div className="dash-muted-label">Teachers / Students</div>
            <div className="dash-metric-value" style={{ marginTop: 6 }}>
              {stats.roles.TEACHER} / {stats.roles.STUDENT}
            </div>
            <div className="dash-supporting-text mt-2">
              Admins: {stats.roles.ADMIN}
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="dash-card py-3 h-100">
            <div className="dash-muted-label">
              {isSuperAdmin ? "Selected School" : "School Scope"}
            </div>
            <div
              className={`dash-metric-value ${isSuperAdmin && !activeTenantId ? "is-empty" : ""}`}
              style={{ marginTop: 6, fontSize: "1.08rem" }}
            >
              {isSuperAdmin && !activeTenantId ? "No school selected" : schoolLabel}
            </div>
            <div className="dash-supporting-text mt-2">
              {isSuperAdmin
                ? "Used for create, reset, and school-scoped mutations."
                : "All mutations already apply to your school."}
            </div>
          </div>
        </div>
      </div>

      {showCreate && mutationReady ? (
        <div className="dash-card mb-4">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
            <div>
              <h3 className="dash-card-title mb-1">Create User</h3>
              <div className="dash-supporting-text">
                Creates an account in <strong>{schoolLabel}</strong> with a
                password chosen by the admin.
              </div>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-lg-3">
              <label className="form-label fw-semibold">
                Email <span className="text-danger">*</span>
              </label>
              <input
                className="form-control"
                type="email"
                placeholder="user@example.com"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </div>
            <div className="col-lg-3">
              <label className="form-label fw-semibold">
                Temporary password <span className="text-danger">*</span>
              </label>
              <input
                className="form-control"
                type="password"
                placeholder="At least 6 characters"
                value={createForm.password}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
              />
            </div>
            <div className="col-lg-2">
              <label className="form-label fw-semibold">First name</label>
              <input
                className="form-control"
                value={createForm.firstName}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    firstName: e.target.value,
                  }))
                }
              />
            </div>
            <div className="col-lg-2">
              <label className="form-label fw-semibold">Last name</label>
              <input
                className="form-control"
                value={createForm.lastName}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    lastName: e.target.value,
                  }))
                }
              />
            </div>
            <div className="col-lg-2">
              <label className="form-label fw-semibold">Role</label>
              <select
                className="form-select"
                value={createForm.role}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, role: e.target.value }))
                }
              >
                {CREATE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3">
            <div className="dash-supporting-text">
              The password entered here should be shared securely and changed by
              the user after first sign-in.
            </div>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={resetForms}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={createUser}
                disabled={saving}
              >
                {saving ? "Creating..." : "Create User"}
              </button>
            </div>
          </div>

          {lastCreateResult?.user ? (
            <div className="alert alert-success mt-3 mb-0">
              Created <strong>{lastCreateResult.user.email}</strong> in{" "}
              <strong>{lastCreateResult.user.tenantId || schoolLabel}</strong>.
            </div>
          ) : null}
        </div>
      ) : null}

      {showInvite && mutationReady ? (
        <div className="dash-card mb-4">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
            <div>
              <h3 className="dash-card-title mb-1">Create Temporary Password User</h3>
              <div className="dash-supporting-text">
                If you leave the password blank, the backend generates a
                temporary password and shows it once after creation.
              </div>
            </div>
          </div>

          <div className="row g-3">
            <div className="col-lg-3">
              <label className="form-label fw-semibold">
                Display name
              </label>
              <input
                className="form-control"
                placeholder="Optional"
                value={inviteForm.name}
                onChange={(e) =>
                  setInviteForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="col-lg-3">
              <label className="form-label fw-semibold">
                Email <span className="text-danger">*</span>
              </label>
              <input
                className="form-control"
                type="email"
                placeholder="user@example.com"
                value={inviteForm.email}
                onChange={(e) =>
                  setInviteForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </div>
            <div className="col-lg-2">
              <label className="form-label fw-semibold">Role</label>
              <select
                className="form-select"
                value={inviteForm.role}
                onChange={(e) =>
                  setInviteForm((prev) => ({ ...prev, role: e.target.value }))
                }
              >
                {CREATE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-lg-4">
              <label className="form-label fw-semibold">
                Optional temporary password
              </label>
              <input
                className="form-control"
                type="password"
                placeholder="Leave blank to auto-generate"
                value={inviteForm.password}
                onChange={(e) =>
                  setInviteForm((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mt-3">
            <div className="dash-supporting-text">
              Use this flow when an admin needs to hand off credentials quickly
              and the user will reset them after their first sign-in.
            </div>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={resetForms}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={inviteUser}
                disabled={saving}
              >
                {saving ? "Creating..." : "Create Temporary Password User"}
              </button>
            </div>
          </div>

          {lastInviteResult ? (
            <div className="alert alert-secondary mt-3 mb-0">
              <div>
                Created{" "}
                <strong>
                  {lastInviteResult?.user?.email || lastInviteResult?.message}
                </strong>
                .
              </div>
              {lastInviteResult?.tempPassword ? (
                <div className="mt-2">
                  Temporary password shown once:{" "}
                  <code>{lastInviteResult.tempPassword}</code>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="dash-card">
        <div className="row g-3 align-items-end mb-3">
          <div className="col-lg-4">
            <label className="form-label fw-semibold">Search</label>
            <input
              className="form-control"
              placeholder={
                isSuperAdmin
                  ? "Search by name, email, username, or school"
                  : "Search by name, email, or username"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="col-sm-6 col-lg-2">
            <label className="form-label fw-semibold">Role</label>
            <select
              className="form-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All roles</option>
              {FILTER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <div className="col-sm-6 col-lg-2">
            <label className="form-label fw-semibold">Status</label>
            <select
              className="form-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          {isSuperAdmin ? (
            <div className="col-lg-4">
              <label className="form-label fw-semibold">School filter</label>
              <select
                className="form-select"
                value={tenantFilter}
                onChange={(e) => setTenantFilter(e.target.value)}
              >
                <option value="">All schools</option>
                {tenants.map((tenant) => (
                  <option key={tenant.tenantId || tenant._id} value={tenant.tenantId}>
                    {tenant.name || tenant.tenantId}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {loading ? (
          <LoadingSpinner message="Loading users..." />
        ) : users.length === 0 ? (
          <EmptyState
            title="No users found"
            message={
              isSuperAdmin
                ? "Try adjusting the platform filters or select a school to create new users."
                : "Try adjusting the filters or create a new user."
            }
          />
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>User</th>
                  {isSuperAdmin ? <th>School</th> : null}
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => {
                  const rowBusy = busyUserId === row._id;
                  const rowMutable = canMutateRow(row);

                  return (
                    <tr key={row._id}>
                      <td>
                        <div className="fw-semibold">{nameOf(row)}</div>
                        <div className="dash-supporting-text mt-1 d-flex flex-wrap gap-2">
                          <span>{row.email}</span>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => copyText(row.email)}
                          >
                            Copy Email
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => copyText(row._id)}
                          >
                            Copy ID
                          </button>
                        </div>
                      </td>
                      {isSuperAdmin ? (
                        <td>
                          {row.tenantId ? (
                            <div>
                              <div className="fw-semibold">
                                {row.tenantName || row.tenantId}
                              </div>
                              <div className="dash-supporting-text mt-1 d-flex flex-wrap gap-2">
                                {row.tenantName ? <span>{row.tenantId}</span> : null}
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary"
                                  onClick={() => selectSchoolForRow(row)}
                                >
                                  Use School
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted">Unscoped</span>
                          )}
                        </td>
                      ) : null}
                      <td style={{ minWidth: 170 }}>
                        {rowMutable ? (
                          <select
                            className="form-select form-select-sm"
                            value={String(row.role || "").toUpperCase()}
                            onChange={(e) => updateRole(row, e.target.value)}
                            disabled={rowBusy}
                          >
                            {FILTER_ROLES.map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <StatusBadge status={row.role} />
                        )}
                      </td>
                      <td>
                        <StatusBadge
                          status={row.enabled === false ? "disabled" : "active"}
                        />
                      </td>
                      <td>
                        <div className="d-flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={`btn btn-sm ${
                              row.enabled === false
                                ? "btn-outline-success"
                                : "btn-outline-secondary"
                            }`}
                            onClick={() => toggleStatus(row)}
                            disabled={rowBusy || !rowMutable}
                            title={
                              rowMutable
                                ? undefined
                                : "Select this user's school before editing access."
                            }
                          >
                            {rowBusy
                              ? "Working..."
                              : row.enabled === false
                                ? "Enable"
                                : "Disable"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-warning"
                            onClick={() => resetPassword(row)}
                            disabled={rowBusy || !rowMutable}
                            title={
                              rowMutable
                                ? "Issue a password reset"
                                : "Select this user's school before issuing a password reset."
                            }
                          >
                            Reset Password
                          </button>
                        </div>
                        {isSuperAdmin && !rowMutable ? (
                          <div className="dash-supporting-text mt-2">
                            Select <strong>{row.tenantId || "this school"}</strong>{" "}
                            in the sidebar context before editing this user.
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
