// src/pages/tools/UserManagementPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import api from "../../services/api/api.js";

import "../../components/styles/admin-tools.css";

const ROLES = ["ADMIN", "TEACHER", "STUDENT", "PARENT"];

// light email check for MVP
const isEmail = (v) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(v || "")
      .trim()
      .toLowerCase(),
  );

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getEnabled = (u) => {
  // support both shapes: enabled OR disabled
  if (typeof u?.enabled === "boolean") return u.enabled;
  if (typeof u?.disabled === "boolean") return !u.disabled;
  return true;
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text));
    toast.success("Copied");
  } catch {
    toast.error("Copy failed");
  }
}

export default function UserManagementPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

  // filters in UI
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");

  // applied filters (so typing does not spam backend)
  const [applied, setApplied] = useState({ q: "", role: "", status: "" });

  // invite form
  const [invite, setInvite] = useState({
    name: "",
    email: "",
    role: "STUDENT",
  });

  const [inviting, setInviting] = useState(false);

  // per-user mutation loading map
  const [busy, setBusy] = useState({}); // { [userId]: true }
  const setBusyFor = (userId, val) => setBusy((p) => ({ ...p, [userId]: val }));

  // debounce apply on typing (MVP quality)
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

  // apply role/status immediately when changed
  useEffect(() => {
    setApplied((p) => ({ ...p, role, status }));
  }, [role, status]);

  async function load(filters = applied) {
    setLoading(true);
    setError("");
    try {
      const data = await api.admin.listUsers({
        q: filters.q || "",
        role: filters.role || "",
        status: filters.status || "",
      });

      // accept { items } or array
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
  }, [applied.q, applied.role, applied.status]);

  const stats = useMemo(() => {
    let enabledCount = 0;
    let disabledCount = 0;
    const roleCounts = {};
    for (const r of ROLES) roleCounts[r] = 0;

    for (const u of rows) {
      const en = getEnabled(u);
      if (en) enabledCount += 1;
      else disabledCount += 1;

      const rr = String(u?.role || "").toUpperCase();
      if (roleCounts[rr] !== undefined) roleCounts[rr] += 1;
    }

    return {
      total: rows.length,
      enabledCount,
      disabledCount,
      roleCounts,
    };
  }, [rows]);

  // Optional client-side filter backup (in case backend ignores filters)
  const filtered = useMemo(() => {
    const needle = String(applied.q || "")
      .trim()
      .toLowerCase();
    const rr = String(applied.role || "")
      .trim()
      .toUpperCase();
    const st = String(applied.status || "")
      .trim()
      .toLowerCase();

    return rows.filter((u) => {
      const name = String(u?.name || "").toLowerCase();
      const email = String(u?.email || "").toLowerCase();
      const id = String(u?._id || "").toLowerCase();

      const okQ =
        !needle ||
        name.includes(needle) ||
        email.includes(needle) ||
        id.includes(needle);
      const okRole = !rr || String(u?.role || "").toUpperCase() === rr;

      const enabled = getEnabled(u);
      const okStatus =
        !st ||
        (st === "enabled" ? enabled : st === "disabled" ? !enabled : true);

      return okQ && okRole && okStatus;
    });
  }, [rows, applied.q, applied.role, applied.status]);

  async function onInvite() {
    if (inviting) return;

    const email = invite.email.trim().toLowerCase();
    const name = invite.name.trim();
    const roleUpper = String(invite.role || "STUDENT").toUpperCase();

    if (!email) return toast.error("Email is required");
    if (!isEmail(email)) return toast.error("Enter a valid email");
    if (!ROLES.includes(roleUpper)) return toast.error("Invalid role");

    try {
      setInviting(true);

      await api.admin.inviteUser({
        name: name || undefined,
        email,
        role: roleUpper,
      });

      toast.success("Invite created");
      setInvite({ name: "", email: "", role: "STUDENT" });

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

    const ok = window.confirm(
      next ? "Enable this user?" : "Disable this user?",
    );
    if (!ok) return;

    try {
      setBusyFor(id, true);

      // optimistic UI
      setRows((prev) =>
        prev.map((x) => {
          if (x._id !== id) return x;
          return { ...x, enabled: next, disabled: !next };
        }),
      );

      await api.admin.setUserStatus(id, next);

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

    const next = String(nextRole || "").toUpperCase();
    if (!ROLES.includes(next)) return toast.error("Invalid role");

    const ok = window.confirm(`Change role to ${next}?`);
    if (!ok) return;

    try {
      setBusyFor(id, true);

      // optimistic UI
      setRows((prev) =>
        prev.map((x) => (x._id === id ? { ...x, role: next } : x)),
      );

      await api.admin.setUserRole(id, next);

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
      await api.admin.resetUserPassword(id);
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

        {/* Filters + stats */}
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
                value={role}
                onChange={(e) => setRole(e.target.value)}
                title="Role filter"
              >
                <option value="">All roles</option>
                {ROLES.map((r) => (
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
                <span className="badge off">
                  {stats.disabledCount} disabled
                </span>
                <span className="badge">{stats.total} total</span>
              </div>
            </div>

            {error ? (
              <div className="mt-3 p-3 rounded-lg border border-red-300 bg-red-50 text-red-700">
                {error}
                <div className="text-xs opacity-80 mt-2">
                  Expected endpoint: <code>/api/admin/users</code>
                </div>
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
              {ROLES.map((r) => (
                <span key={r} className="badge">
                  {r}: {stats.roleCounts[r] || 0}
                </span>
              ))}
            </div>

            {/* Invite */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 200px 160px",
                gap: 10,
                marginTop: 12,
              }}
            >
              <input
                className="input"
                placeholder="Name (optional)"
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
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                className="btn-gold"
                onClick={onInvite}
                disabled={inviting || !isEmail(invite.email)}
              >
                {inviting ? "Inviting..." : "Invite"}
              </button>
            </div>

            <div className="text-xs opacity-70" style={{ marginTop: 10 }}>
              Note: Invites should be rate limited and audited. Roles control
              access to admin tools.
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        {/* Table */}
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
                            {u.name || "—"}
                            {u.tenantId ? (
                              <span
                                style={{ marginLeft: 10 }}
                                className="badge"
                              >
                                {u.tenantId}
                              </span>
                            ) : null}
                          </div>

                          <div
                            style={{
                              color: "#000000",
                              display: "flex",
                              gap: 10,
                              flexWrap: "wrap",
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
                            value={String(u.role || "").toUpperCase()}
                            onChange={(e) => changeRole(u, e.target.value)}
                            disabled={isRowBusy}
                            title="Change role"
                          >
                            {ROLES.map((r) => (
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
                              {isRowBusy
                                ? "..."
                                : enabled
                                  ? "Disable"
                                  : "Enable"}
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

        <div className="text-xs opacity-70" style={{ marginTop: 12 }}>
          Backend mounts reminder: admin module routes are under{" "}
          <code>/api/admin</code> and system routes are under{" "}
          <code>/api/admin/system</code>.
        </div>
      </div>
    </div>
  );
}
