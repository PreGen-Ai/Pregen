// Admin Classes — CRUD and enroll/unenroll via /api/admin/classes
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import api from "../../../services/api/api.js";
import { useAuthContext } from "../../../context/AuthContext.js";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import StatusBadge from "../components/ui/StatusBadge.jsx";

const emptyForm = { name: "", subjectId: "", teacherId: "" };

function nameOf(u) {
  return (
    [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
    u?.name ||
    u?.email ||
    "—"
  );
}

export default function AdminClassesPage() {
  const { user } = useAuthContext();
  const tenantId = user?.tenantId;
  const tenantName = user?.tenantName || user?.institutionName || null;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [detailClass, setDetailClass] = useState(null);
  const [enrollIds, setEnrollIds] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [classRes, subjectRes, teacherRes, studentRes] = await Promise.all([
        api.admin.listClasses({ limit: 200 }),
        api.admin.listSubjects({ limit: 200 }),
        api.admin.listUsers({ role: "TEACHER", limit: 200 }),
        api.admin.listUsers({ role: "STUDENT", limit: 200 }),
      ]);
      setClasses(
        Array.isArray(classRes?.items)
          ? classRes.items
          : Array.isArray(classRes)
          ? classRes
          : [],
      );
      setSubjects(
        Array.isArray(subjectRes?.items)
          ? subjectRes.items
          : Array.isArray(subjectRes)
          ? subjectRes
          : [],
      );
      setTeachers(
        Array.isArray(teacherRes?.items)
          ? teacherRes.items
          : Array.isArray(teacherRes)
          ? teacherRes
          : [],
      );
      setStudents(
        Array.isArray(studentRes?.items)
          ? studentRes.items
          : Array.isArray(studentRes)
          ? studentRes
          : [],
      );
    } catch (e) {
      toast.error(e?.message || "Failed to load classes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createClass = async () => {
    if (!form.name.trim()) {
      toast.error("Class name is required");
      return;
    }
    setSaving(true);
    try {
      await api.admin.createClass({
        name: form.name.trim(),
        subjectId: form.subjectId || undefined,
        teacherId: form.teacherId || undefined,
      });
      toast.success("Class created");
      setShowCreate(false);
      setForm(emptyForm);
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to create class");
    } finally {
      setSaving(false);
    }
  };

  const enrollSelected = async () => {
    if (!detailClass || !enrollIds.length) return;
    setSaving(true);
    try {
      await api.admin.enrollStudents(detailClass._id, enrollIds);
      toast.success(`${enrollIds.length} student(s) enrolled`);
      setEnrollIds([]);
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to enroll students");
    } finally {
      setSaving(false);
    }
  };

  const unenrollStudent = async (studentId) => {
    if (!detailClass) return;
    if (!window.confirm("Remove this student from the class?")) return;
    setSaving(true);
    try {
      await api.admin.unenrollStudents(detailClass._id, [studentId]);
      toast.success("Student removed from class");
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to unenroll student");
    } finally {
      setSaving(false);
    }
  };

  const visible = classes.filter((c) =>
    !search.trim() ||
    String(c.name || "").toLowerCase().includes(search.toLowerCase()),
  );

  const enrolledIds = new Set(
    (detailClass?.students || []).map((s) => String(s._id || s)),
  );
  const notEnrolled = students.filter((s) => !enrolledIds.has(String(s._id)));

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h2>Classes</h2>
          <p className="text-muted mb-0">
            Create classes, assign teachers, and manage student enrollment.
          </p>
          {(tenantName || tenantId) && (
            <div className="mt-2">
              <span
                className="badge"
                style={{
                  background: "rgba(59,130,246,0.15)",
                  border: "1px solid rgba(59,130,246,0.3)",
                  color: "#93c5fd",
                  fontWeight: 500,
                  fontSize: "0.78rem",
                  padding: "3px 10px",
                  borderRadius: 6,
                }}
              >
                {tenantName ? `${tenantName} · ` : ""}
                {tenantId}
              </span>
            </div>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowCreate((v) => !v)}
        >
          {showCreate ? "Cancel" : "+ Create class"}
        </button>
      </div>

      {showCreate && (
        <div className="dash-card mb-4">
          <h3 className="dash-card-title mb-3">Create class</h3>
          <div className="row g-3">
            <div className="col-md-4">
              <input
                className="form-control"
                placeholder="Class name *"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="col-md-3">
              <select
                className="form-select"
                value={form.subjectId}
                onChange={(e) => setForm((p) => ({ ...p, subjectId: e.target.value }))}
              >
                <option value="">Subject (optional)</option>
                {subjects.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <select
                className="form-select"
                value={form.teacherId}
                onChange={(e) => setForm((p) => ({ ...p, teacherId: e.target.value }))}
              >
                <option value="">Teacher (optional)</option>
                {teachers.map((t) => (
                  <option key={t._id} value={t._id}>
                    {nameOf(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <button
                className="btn btn-primary w-100"
                onClick={createClass}
                disabled={saving}
              >
                {saving ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="row g-4">
        <div className={detailClass ? "col-lg-5" : "col-12"}>
          <div className="dash-card">
            <div className="mb-3">
              <input
                className="form-control"
                placeholder="Search classes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading ? (
              <LoadingSpinner message="Loading classes…" />
            ) : visible.length === 0 ? (
              <EmptyState
                title="No classes found"
                message="Create your first class to get started."
              />
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Subject</th>
                      <th>Students</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((cls) => (
                      <tr
                        key={cls._id}
                        className={detailClass?._id === cls._id ? "table-active" : ""}
                      >
                        <td>{cls.name}</td>
                        <td>{cls.subject?.name || cls.subjectName || "—"}</td>
                        <td>{(cls.students || []).length}</td>
                        <td>
                          <button
                            className="btn btn-sm btn-outline-light"
                            onClick={() =>
                              setDetailClass(
                                detailClass?._id === cls._id ? null : cls,
                              )
                            }
                          >
                            {detailClass?._id === cls._id ? "Close" : "Manage"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {detailClass && (
          <div className="col-lg-7">
            <div className="dash-card">
              <h3 className="dash-card-title mb-1">{detailClass.name}</h3>
              <p className="text-muted mb-4">
                Subject:{" "}
                {detailClass.subject?.name || detailClass.subjectName || "—"}
              </p>

              <h5 className="mb-3">
                Enrolled students ({(detailClass.students || []).length})
              </h5>
              {(detailClass.students || []).length === 0 ? (
                <p className="text-muted mb-4">No students enrolled yet.</p>
              ) : (
                <div className="table-responsive mb-4">
                  <table className="table table-sm align-middle mb-0">
                    <tbody>
                      {(detailClass.students || []).map((s) => {
                        const student =
                          typeof s === "object"
                            ? s
                            : students.find((u) => u._id === s);
                        return (
                          <tr key={student?._id || s}>
                            <td>{nameOf(student) || String(s)}</td>
                            <td>{student?.email || ""}</td>
                            <td>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() =>
                                  unenrollStudent(student?._id || s)
                                }
                                disabled={saving}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {notEnrolled.length > 0 && (
                <>
                  <h5 className="mb-2">Enroll students</h5>
                  <div className="mb-3">
                    <select
                      className="form-select"
                      multiple
                      style={{ height: 140 }}
                      value={enrollIds}
                      onChange={(e) =>
                        setEnrollIds(
                          Array.from(e.target.selectedOptions, (o) => o.value),
                        )
                      }
                    >
                      {notEnrolled.map((s) => (
                        <option key={s._id} value={s._id}>
                          {nameOf(s)} ({s.email})
                        </option>
                      ))}
                    </select>
                    <div className="form-text">Hold Ctrl/Cmd to select multiple.</div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={enrollSelected}
                    disabled={saving || !enrollIds.length}
                  >
                    {saving ? "Enrolling…" : `Enroll ${enrollIds.length || ""} student(s)`}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
