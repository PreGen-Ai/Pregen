// Admin Subjects — CRUD via /api/admin/subjects
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import api from "../../../services/api/api.js";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";

const emptyForm = { name: "", code: "", description: "" };

export default function AdminSubjectsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.admin.listSubjects({ limit: 200 });
      setSubjects(
        Array.isArray(res?.items)
          ? res.items
          : Array.isArray(res)
          ? res
          : [],
      );
    } catch (e) {
      toast.error(e?.message || "Failed to load subjects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Subject name is required");
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
      setForm(emptyForm);
      setEditingId(null);
      setShowCreate(false);
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
    if (!window.confirm(`Delete subject "${subject.name}"? This cannot be undone.`)) return;
    try {
      await api.admin.deleteSubject(subject._id);
      toast.success("Subject deleted");
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to delete subject");
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowCreate(false);
  };

  const visible = subjects.filter(
    (s) =>
      !search.trim() ||
      String(s.name || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h2>Subjects</h2>
          <p className="text-muted mb-0">
            Manage the subjects available in your institution.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (showCreate && !editingId) {
              setShowCreate(false);
            } else {
              cancelEdit();
              setShowCreate(true);
            }
          }}
        >
          {showCreate && !editingId ? "Cancel" : "+ Add subject"}
        </button>
      </div>

      {showCreate && (
        <div className="dash-card mb-4">
          <h3 className="dash-card-title mb-3">
            {editingId ? "Edit subject" : "Add subject"}
          </h3>
          <div className="row g-3">
            <div className="col-md-5">
              <input
                className="form-control"
                placeholder="Subject name *"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="col-md-2">
              <input
                className="form-control"
                placeholder="Code (optional)"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              />
            </div>
            <div className="col-md-5">
              <input
                className="form-control"
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
              />
            </div>
            <div className="col-auto d-flex gap-2">
              <button
                className="btn btn-primary"
                onClick={save}
                disabled={saving}
              >
                {saving ? "Saving…" : editingId ? "Update" : "Create"}
              </button>
              <button className="btn btn-outline-secondary" onClick={cancelEdit}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="dash-card">
        <div className="mb-3">
          <input
            className="form-control"
            style={{ maxWidth: 320 }}
            placeholder="Search subjects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <LoadingSpinner message="Loading subjects…" />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No subjects found"
            message="Add your first subject to get started."
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
                {visible.map((s) => (
                  <tr key={s._id}>
                    <td className="fw-semibold">{s.name}</td>
                    <td>
                      <code>{s.code || "—"}</code>
                    </td>
                    <td className="text-muted">{s.description || "—"}</td>
                    <td>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-sm btn-outline-light"
                          onClick={() => startEdit(s)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => deleteSubject(s)}
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
    </div>
  );
}
