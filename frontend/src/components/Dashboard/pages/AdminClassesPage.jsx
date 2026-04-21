// Admin Classes — CRUD and enroll/unenroll via /api/admin/classes
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "react-toastify";
import api from "../../../services/api/api.js";
import { useAuthContext } from "../../../context/AuthContext.js";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";

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
  const isSuperAdmin = String(user?.role || "").toUpperCase() === "SUPERADMIN";
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

  // Teacher assignment in detail panel
  const [assignTeacherId, setAssignTeacherId] = useState("");

  // Subject assignment in detail panel
  const [assignSubjectId, setAssignSubjectId] = useState("");

  // Superadmin: tenant selector
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.admin.listTenants().then((res) => {
      setTenants(Array.isArray(res?.items) ? res.items : []);
    }).catch(() => {});
  }, [isSuperAdmin]);

  // Resolved tenant for display
  const activeTenantId = isSuperAdmin ? selectedTenantId : (user?.tenantId || "");

  const cfg = isSuperAdmin && selectedTenantId
    ? { headers: { "x-tenant-id": selectedTenantId } }
    : {};

  const load = useCallback(async () => {
    if (isSuperAdmin && !selectedTenantId) {
      setClasses([]);
      setSubjects([]);
      setTeachers([]);
      setStudents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [classRes, subjectRes, teacherRes, studentRes] = await Promise.all([
        api.admin.listClasses({ limit: 200 }, cfg),
        api.admin.listSubjects({ limit: 200 }, cfg),
        api.admin.listUsers({ role: "TEACHER", limit: 200 }, cfg),
        api.admin.listUsers({ role: "STUDENT", limit: 200 }, cfg),
      ]);
      setClasses(
        Array.isArray(classRes?.items) ? classRes.items : Array.isArray(classRes) ? classRes : [],
      );
      setSubjects(
        Array.isArray(subjectRes?.items) ? subjectRes.items : Array.isArray(subjectRes) ? subjectRes : [],
      );
      setTeachers(
        Array.isArray(teacherRes?.items) ? teacherRes.items : Array.isArray(teacherRes) ? teacherRes : [],
      );
      setStudents(
        Array.isArray(studentRes?.items) ? studentRes.items : Array.isArray(studentRes) ? studentRes : [],
      );
    } catch (e) {
      toast.error(e?.message || "Failed to load classes");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, selectedTenantId]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep detailClass in sync with freshly loaded classes
  useEffect(() => {
    if (!detailClass) return;
    const updated = classes.find((c) => c._id === detailClass._id);
    if (updated) setDetailClass(updated);
  }, [classes]); // eslint-disable-line react-hooks/exhaustive-deps

  const createClass = async () => {
    if (!form.name.trim()) {
      toast.error("Class name is required");
      return;
    }
    if (isSuperAdmin && !selectedTenantId) {
      toast.error("Select a tenant before creating a class");
      return;
    }
    setSaving(true);
    try {
      await api.admin.createClass({
        name: form.name.trim(),
        subjectId: form.subjectId || undefined,
        teacherId: form.teacherId || undefined,
      }, cfg);
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

  const doAssignTeacher = async () => {
    if (!detailClass) return;
    if (!assignTeacherId) {
      toast.error("Select a teacher to assign");
      return;
    }
    setSaving(true);
    try {
      await api.admin.assignTeacher(detailClass._id, assignTeacherId, cfg);
      toast.success("Teacher assigned");
      setAssignTeacherId("");
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to assign teacher");
    } finally {
      setSaving(false);
    }
  };

  const doAssignSubject = async () => {
    if (!detailClass) return;
    if (!assignSubjectId) {
      toast.error("Select a subject to assign");
      return;
    }
    setSaving(true);
    try {
      await api.admin.assignSubject(detailClass._id, assignSubjectId, cfg);
      toast.success("Subject assigned");
      setAssignSubjectId("");
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to assign subject");
    } finally {
      setSaving(false);
    }
  };

  const enrollSelected = async () => {
    if (!detailClass) return;
    if (!enrollIds.length) {
      toast.error("Please select at least one student to enroll");
      return;
    }
    setSaving(true);
    try {
      await api.admin.enrollStudents(detailClass._id, enrollIds, cfg);
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
      await api.admin.unenrollStudents(detailClass._id, [studentId], cfg);
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

  // Use populated `students[]` from backend; fall back to raw studentIds count
  const enrolledStudents = detailClass?.students || [];
  const enrolledIds = new Set(enrolledStudents.map((s) => String(s._id || s)));
  const notEnrolled = students.filter((s) => !enrolledIds.has(String(s._id)));

  // Helper: count students for a class row (populated or raw IDs)
  const studentCount = (cls) =>
    (cls.students || []).length || (cls.studentIds || []).length || 0;

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3">
        <div>
          <h2>Classes</h2>
          <p className="text-muted mb-0">
            Create classes, assign teachers, and manage student enrollment.
          </p>
          {!isSuperAdmin && (tenantName || activeTenantId) && (
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
                {activeTenantId}
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

      {/* Superadmin: tenant selector */}
      {isSuperAdmin && (
        <div className="dash-card mb-4">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <label className="fw-semibold mb-0" style={{ minWidth: 90 }}>Tenant</label>
            <select
              className={`form-select ${!selectedTenantId ? "border-warning" : ""}`}
              style={{ maxWidth: 300 }}
              value={selectedTenantId}
              onChange={(e) => { setSelectedTenantId(e.target.value); setDetailClass(null); setAssignSubjectId(""); setEnrollIds([]); }}
            >
              <option value="">— Select tenant —</option>
              {tenants.map((t) => (
                <option key={t._id} value={t.tenantId}>
                  {t.name || t.tenantId}
                </option>
              ))}
            </select>
            {!selectedTenantId && (
              <small className="text-warning">Select a tenant to manage classes</small>
            )}
          </div>
        </div>
      )}

      {showCreate && (!isSuperAdmin || selectedTenantId) && (
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

      {(!isSuperAdmin || selectedTenantId) ? (
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
                        <th>Teacher</th>
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
                          <td>
                            {cls.teacher
                              ? nameOf(cls.teacher)
                              : <span className="text-muted">—</span>}
                          </td>
                          <td>
                            {cls.subject?.name ||
                              (cls.subjects?.length > 0
                                ? cls.subjects.map((s) => s.name).join(", ")
                                : <span className="text-muted">—</span>)}
                          </td>
                          <td>{studentCount(cls)}</td>
                          <td>
                            <button
                              className="btn btn-sm btn-outline-light"
                              onClick={() => {
                                const next = detailClass?._id === cls._id ? null : cls;
                                setDetailClass(next);
                                setAssignTeacherId(next?.teacher?._id || "");
                                setAssignSubjectId("");
                                setEnrollIds([]);
                              }}
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
                  {detailClass.subject?.name ||
                    (detailClass.subjects?.length > 0
                      ? detailClass.subjects.map((s) => s.name).join(", ")
                      : "—")}
                </p>

                {/* ── Assign teacher ─────────────────────────── */}
                <h5 className="mb-2">Assigned teacher</h5>
                <div className="d-flex gap-2 align-items-center mb-4 flex-wrap">
                  {detailClass.teacher && (
                    <span className="badge bg-secondary px-3 py-2" style={{ fontSize: "0.85rem" }}>
                      {nameOf(detailClass.teacher)}
                      <span className="ms-2 text-white-50" style={{ fontSize: "0.75rem" }}>
                        {detailClass.teacher.email}
                      </span>
                    </span>
                  )}
                  <select
                    className="form-select"
                    style={{ maxWidth: 260 }}
                    value={assignTeacherId}
                    onChange={(e) => setAssignTeacherId(e.target.value)}
                  >
                    <option value="">
                      {detailClass.teacher ? "Change teacher…" : "Select teacher…"}
                    </option>
                    {teachers.map((t) => (
                      <option key={t._id} value={t._id}>
                        {nameOf(t)} ({t.email})
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary"
                    onClick={doAssignTeacher}
                    disabled={saving || !assignTeacherId}
                  >
                    {saving ? "Saving…" : "Assign"}
                  </button>
                </div>

                {/* ── Assign subject ─────────────────────────── */}
                <h5 className="mb-2">Assigned subjects</h5>
                <div className="mb-2">
                  {(detailClass.subjects?.length > 0
                    ? detailClass.subjects
                    : detailClass.subject ? [detailClass.subject] : []
                  ).map((s) => (
                    <span
                      key={s._id || s.name}
                      className="badge bg-secondary me-1 mb-1"
                      style={{ fontSize: "0.82rem", padding: "4px 10px" }}
                    >
                      {s.name}{s.code ? ` (${s.code})` : ""}
                    </span>
                  ))}
                  {!detailClass.subjects?.length && !detailClass.subject && (
                    <span className="text-muted" style={{ fontSize: "0.9rem" }}>None yet</span>
                  )}
                </div>
                <div className="d-flex gap-2 align-items-center mb-4 flex-wrap">
                  <select
                    className="form-select"
                    style={{ maxWidth: 260 }}
                    value={assignSubjectId}
                    onChange={(e) => setAssignSubjectId(e.target.value)}
                  >
                    <option value="">Add a subject…</option>
                    {subjects.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}{s.code ? ` (${s.code})` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary"
                    onClick={doAssignSubject}
                    disabled={saving || !assignSubjectId}
                  >
                    {saving ? "Saving…" : "Assign"}
                  </button>
                </div>

                {/* ── Enrolled students ──────────────────────── */}
                <h5 className="mb-3">
                  Enrolled students ({enrolledStudents.length})
                </h5>
                {enrolledStudents.length === 0 ? (
                  <p className="text-muted mb-4">No students enrolled yet.</p>
                ) : (
                  <div className="table-responsive mb-4">
                    <table className="table table-sm align-middle mb-0">
                      <tbody>
                        {enrolledStudents.map((s) => {
                          const student =
                            typeof s === "object"
                              ? s
                              : students.find((u) => u._id === String(s));
                          return (
                            <tr key={student?._id || String(s)}>
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
      ) : (
        <div
          className="dash-card text-muted text-center py-4"
          style={{ fontSize: "0.9em" }}
        >
          Select a tenant above to view and manage classes.
        </div>
      )}
    </div>
  );
}
