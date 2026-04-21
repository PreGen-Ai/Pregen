import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import { useAuthContext } from "../../../context/AuthContext.js";
import api from "../../../services/api/api.js";
import useActiveTenantScope from "../hooks/useActiveTenantScope.js";
import EmptyState from "../components/ui/EmptyState.jsx";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";

const EMPTY_FORM = { name: "", code: "", description: "" };

export default function AdminSubjectsPage() {
  const { user } = useAuthContext() || {};
  const navigate = useNavigate();
  const isSuperAdmin = String(user?.role || "").toUpperCase() === "SUPERADMIN";
  const institutionName =
    user?.tenantName || user?.institutionName || user?.tenantId || "";
  const { tenantId: activeTenantId, tenantName: activeTenantName } =
    useActiveTenantScope();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const schoolLabel =
    activeTenantName || activeTenantId || institutionName || "your school";

  const load = useCallback(async () => {
    if (isSuperAdmin && !activeTenantId) {
      setSubjects([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await api.admin.listSubjects({ limit: 200 });
      setSubjects(
        Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [],
      );
    } catch (e) {
      toast.error(e?.message || "Failed to load subjects");
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, isSuperAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowCreate(false);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Subject name is required");
      return;
    }
    if (isSuperAdmin && !activeTenantId) {
      toast.error("Select a school before saving a subject");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await api.admin.updateSubject(editingId, form);
        toast.success("Subject updated");
      } else {
        await api.admin.createSubject(form);
        toast.success("Subject created");
      }
      resetForm();
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to save subject");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (subject) => {
    setEditingId(subject._id);
    setForm({
      name: subject.name || "",
      code: subject.code || "",
      description: subject.description || "",
    });
    setShowCreate(true);
  };

  const deleteSubject = async (subject) => {
    if (!window.confirm(`Delete subject "${subject.name}"?`)) return;

    try {
      await api.admin.deleteSubject(subject._id);
      toast.success("Subject deleted");
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to delete subject");
    }
  };

  const visible = subjects.filter(
    (subject) =>
      !search.trim() ||
      String(subject.name || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="quizzes-page">
      <div className="dash-page-header">
        <div>
          <div className="dash-page-kicker">School Scope</div>
          <h2 className="dash-page-title">Subjects</h2>
          <p className="dash-page-subtitle">
            Maintain the subject catalog used by <strong>{schoolLabel}</strong>.
          </p>
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
              if (showCreate && !editingId) {
                setShowCreate(false);
              } else {
                setEditingId(null);
                setForm(EMPTY_FORM);
                setShowCreate(true);
              }
            }}
          >
            {showCreate && !editingId ? "Cancel" : "Add Subject"}
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
                Subject changes apply only to <strong>{schoolLabel}</strong>.
              </>
            ) : (
              <>Choose a school before managing school-scoped subjects.</>
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
            Subjects are school-scoped. Select a school from the Schools page,
            then return here to manage its catalog.
          </p>
        </div>
      ) : (
        <>
          {showCreate ? (
            <div className="dash-card mb-4">
              <h3 className="dash-card-title mb-3">
                {editingId ? "Edit Subject" : "Add Subject"}
              </h3>
              <div className="row g-3">
                <div className="col-lg-4">
                  <label className="form-label fw-semibold">
                    Subject name
                  </label>
                  <input
                    className="form-control"
                    placeholder="e.g. Mathematics"
                    value={form.name}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>
                <div className="col-lg-2">
                  <label className="form-label fw-semibold">Code</label>
                  <input
                    className="form-control"
                    placeholder="Optional"
                    value={form.code}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, code: e.target.value }))
                    }
                  />
                </div>
                <div className="col-lg-4">
                  <label className="form-label fw-semibold">Description</label>
                  <input
                    className="form-control"
                    placeholder="Optional context for admins and teachers"
                    value={form.description}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="col-lg-2 d-flex align-items-end gap-2">
                  <button
                    type="button"
                    className="btn btn-primary flex-fill"
                    onClick={save}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : editingId ? "Update" : "Create"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={resetForm}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="dash-card">
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
              <div>
                <h3 className="dash-card-title mb-1">Subject Catalog</h3>
                <div className="dash-supporting-text">
                  Keep codes and descriptions clear so teachers can assign the
                  right materials and classes.
                </div>
              </div>
              <input
                className="form-control"
                style={{ maxWidth: 320 }}
                placeholder="Search subjects"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading ? (
              <LoadingSpinner message="Loading subjects..." />
            ) : visible.length === 0 ? (
              <EmptyState
                title="No subjects found"
                message="Add your first subject to give teachers a consistent catalog."
              />
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Code</th>
                      <th>Description</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((subject) => (
                      <tr key={subject._id}>
                        <td className="fw-semibold">{subject.name}</td>
                        <td>
                          <code>{subject.code || "—"}</code>
                        </td>
                        <td className="text-muted">
                          {subject.description || "—"}
                        </td>
                        <td>
                          <div className="d-flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => startEdit(subject)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => deleteSubject(subject)}
                            >
                              Delete
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
        </>
      )}
    </div>
  );
}
