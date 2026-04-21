import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";

import { useAuthContext } from "../../../context/AuthContext.js";
import api from "../../../services/api/api.js";
import useActiveTenantScope from "../hooks/useActiveTenantScope.js";
import EmptyState from "../components/ui/EmptyState.jsx";
import LoadingSpinner from "../components/ui/LoadingSpinner.jsx";

const EMPTY_FORM = { name: "", subjectId: "", teacherId: "" };

function nameOf(user) {
  return (
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.name ||
    user?.email ||
    "—"
  );
}

function subjectSummary(cls) {
  if (cls?.subjects?.length) {
    return cls.subjects.map((subject) => subject.name).join(", ");
  }
  return cls?.subject?.name || "—";
}

function studentCount(cls) {
  return (cls.students || []).length || (cls.studentIds || []).length || 0;
}

export default function AdminClassesPage() {
  const { user } = useAuthContext() || {};
  const navigate = useNavigate();
  const isSuperAdmin = String(user?.role || "").toUpperCase() === "SUPERADMIN";
  const institutionName =
    user?.tenantName || user?.institutionName || user?.tenantId || "";
  const { tenantId: activeTenantId, tenantName: activeTenantName } =
    useActiveTenantScope();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [detailClass, setDetailClass] = useState(null);
  const [assignTeacherId, setAssignTeacherId] = useState("");
  const [assignSubjectId, setAssignSubjectId] = useState("");
  const [enrollIds, setEnrollIds] = useState([]);

  const schoolLabel =
    activeTenantName || activeTenantId || institutionName || "your school";
  const schoolContextReady = !isSuperAdmin || !!activeTenantId;

  const load = useCallback(async () => {
    if (!schoolContextReady) {
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
        api.admin.listClasses({ limit: 200 }),
        api.admin.listSubjects({ limit: 200 }),
        api.admin.listUsers({ role: "TEACHER", limit: 200 }),
        api.admin.listUsers({ role: "STUDENT", limit: 200 }),
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
      toast.error(e?.message || "Failed to load academic structure");
    } finally {
      setLoading(false);
    }
  }, [schoolContextReady]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!detailClass) return;
    const updated = classes.find((cls) => cls._id === detailClass._id);
    if (updated) setDetailClass(updated);
  }, [classes, detailClass]);

  const visibleClasses = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return classes.filter((cls) => {
      if (!needle) return true;
      return String(cls.name || "").toLowerCase().includes(needle);
    });
  }, [classes, search]);

  const enrolledStudents = detailClass?.students || [];
  const enrolledIds = new Set(enrolledStudents.map((student) => String(student?._id || student)));
  const notEnrolledStudents = students.filter(
    (student) => !enrolledIds.has(String(student._id)),
  );

  const resetCreateForm = () => {
    setShowCreate(false);
    setForm(EMPTY_FORM);
  };

  const createClass = async () => {
    if (!form.name.trim()) {
      toast.error("Class name is required");
      return;
    }
    if (!schoolContextReady) {
      toast.error("Select a school before creating a class");
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
      resetCreateForm();
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to create class");
    } finally {
      setSaving(false);
    }
  };

  const assignTeacher = async () => {
    if (!detailClass || !assignTeacherId) {
      toast.error("Choose a teacher before saving");
      return;
    }

    setSaving(true);
    try {
      await api.admin.assignTeacher(detailClass._id, assignTeacherId);
      toast.success("Teacher assigned");
      setAssignTeacherId("");
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to assign teacher");
    } finally {
      setSaving(false);
    }
  };

  const assignSubject = async () => {
    if (!detailClass || !assignSubjectId) {
      toast.error("Choose a subject before saving");
      return;
    }

    setSaving(true);
    try {
      await api.admin.assignSubject(detailClass._id, assignSubjectId);
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
    if (!detailClass || !enrollIds.length) {
      toast.error("Select at least one student to enroll");
      return;
    }

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

  const removeStudent = async (studentId) => {
    if (!detailClass) return;
    if (!window.confirm("Remove this student from the class?")) return;

    setSaving(true);
    try {
      await api.admin.unenrollStudents(detailClass._id, [studentId]);
      toast.success("Student removed from class");
      await load();
    } catch (e) {
      toast.error(e?.message || "Failed to remove student");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="quizzes-page">
      <div className="dash-page-header">
        <div>
          <div className="dash-page-kicker">School Scope</div>
          <h2 className="dash-page-title">Academic Structure</h2>
          <p className="dash-page-subtitle">
            Create classes, assign teachers and subjects, and manage enrollment
            for <strong>{schoolLabel}</strong>.
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
            onClick={() => setShowCreate((current) => !current)}
            disabled={!schoolContextReady}
          >
            {showCreate ? "Cancel" : "Create Class"}
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
                You are managing academic structure for{" "}
                <strong>{schoolLabel}</strong>.
              </>
            ) : (
              <>
                Choose a school before editing school-scoped classes and
                enrollments.
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

      {!schoolContextReady ? (
        <div className="dash-card dash-empty-shell">
          <h3 className="dash-card-title mb-2">No school selected</h3>
          <p className="dash-supporting-text mb-0">
            Academic structure is school-specific. Select a school from the
            Schools page, then return here to manage classes, teachers,
            subjects, and enrollment.
          </p>
        </div>
      ) : (
        <>
          {showCreate ? (
            <div className="dash-card mb-4">
              <h3 className="dash-card-title mb-3">Create Class</h3>
              <div className="row g-3">
                <div className="col-lg-4">
                  <label className="form-label fw-semibold">Class name</label>
                  <input
                    className="form-control"
                    placeholder="e.g. Grade 8 - Section A"
                    value={form.name}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                  />
                </div>
                <div className="col-lg-3">
                  <label className="form-label fw-semibold">Subject</label>
                  <select
                    className="form-select"
                    value={form.subjectId}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        subjectId: e.target.value,
                      }))
                    }
                  >
                    <option value="">Optional</option>
                    {subjects.map((subject) => (
                      <option key={subject._id} value={subject._id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-lg-3">
                  <label className="form-label fw-semibold">Teacher</label>
                  <select
                    className="form-select"
                    value={form.teacherId}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        teacherId: e.target.value,
                      }))
                    }
                  >
                    <option value="">Optional</option>
                    {teachers.map((teacher) => (
                      <option key={teacher._id} value={teacher._id}>
                        {nameOf(teacher)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-lg-2 d-flex align-items-end">
                  <button
                    type="button"
                    className="btn btn-primary w-100"
                    onClick={createClass}
                    disabled={saving}
                  >
                    {saving ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="row g-4">
            <div className={detailClass ? "col-lg-5" : "col-12"}>
              <div className="dash-card h-100">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
                  <div>
                    <h3 className="dash-card-title mb-1">Classes</h3>
                    <div className="dash-supporting-text">
                      Review class ownership, linked subjects, and student
                      counts before opening management details.
                    </div>
                  </div>
                  <input
                    className="form-control"
                    style={{ maxWidth: 280 }}
                    placeholder="Search classes"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                {loading ? (
                  <LoadingSpinner message="Loading classes..." />
                ) : visibleClasses.length === 0 ? (
                  <EmptyState
                    title="No classes found"
                    message="Create a class to start assigning teachers, subjects, and students."
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
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleClasses.map((cls) => (
                          <tr
                            key={cls._id}
                            className={
                              detailClass?._id === cls._id ? "table-active" : ""
                            }
                          >
                            <td className="fw-semibold">{cls.name}</td>
                            <td>
                              {cls.teacher ? (
                                nameOf(cls.teacher)
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td>{subjectSummary(cls)}</td>
                            <td>{studentCount(cls)}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => {
                                  const next =
                                    detailClass?._id === cls._id ? null : cls;
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

            {detailClass ? (
              <div className="col-lg-7">
                <div className="dash-card h-100">
                  <h3 className="dash-card-title mb-1">{detailClass.name}</h3>
                  <p className="dash-supporting-text mb-4">
                    Subject coverage: {subjectSummary(detailClass)}
                  </p>

                  <div className="mb-4">
                    <h4 className="dash-section-heading">Assigned Teacher</h4>
                    <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                      {detailClass.teacher ? (
                        <span className="badge bg-secondary">
                          {nameOf(detailClass.teacher)}
                        </span>
                      ) : (
                        <span className="dash-inline-note">
                          No teacher assigned yet.
                        </span>
                      )}
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                      <select
                        className="form-select"
                        style={{ maxWidth: 280 }}
                        value={assignTeacherId}
                        onChange={(e) => setAssignTeacherId(e.target.value)}
                      >
                        <option value="">
                          {detailClass.teacher ? "Change teacher" : "Select teacher"}
                        </option>
                        {teachers.map((teacher) => (
                          <option key={teacher._id} value={teacher._id}>
                            {nameOf(teacher)} ({teacher.email})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={assignTeacher}
                        disabled={saving || !assignTeacherId}
                      >
                        {saving ? "Saving..." : "Assign Teacher"}
                      </button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <h4 className="dash-section-heading">Assigned Subjects</h4>
                    <div className="d-flex flex-wrap gap-2 mb-2">
                      {detailClass.subjects?.length || detailClass.subject ? (
                        (detailClass.subjects?.length
                          ? detailClass.subjects
                          : [detailClass.subject]
                        ).map((subject) => (
                          <span
                            key={subject._id || subject.name}
                            className="badge bg-secondary"
                          >
                            {subject.name}
                            {subject.code ? ` (${subject.code})` : ""}
                          </span>
                        ))
                      ) : (
                        <span className="dash-inline-note">
                          No subjects assigned yet.
                        </span>
                      )}
                    </div>
                    <div className="d-flex flex-wrap gap-2">
                      <select
                        className="form-select"
                        style={{ maxWidth: 280 }}
                        value={assignSubjectId}
                        onChange={(e) => setAssignSubjectId(e.target.value)}
                      >
                        <option value="">Add a subject</option>
                        {subjects.map((subject) => (
                          <option key={subject._id} value={subject._id}>
                            {subject.name}
                            {subject.code ? ` (${subject.code})` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={assignSubject}
                        disabled={saving || !assignSubjectId}
                      >
                        {saving ? "Saving..." : "Assign Subject"}
                      </button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <h4 className="dash-section-heading">
                      Enrolled Students ({enrolledStudents.length})
                    </h4>
                    {enrolledStudents.length === 0 ? (
                      <p className="dash-supporting-text mb-0">
                        No students are enrolled in this class yet.
                      </p>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-sm align-middle mb-0">
                          <tbody>
                            {enrolledStudents.map((studentLike) => {
                              const student =
                                typeof studentLike === "object"
                                  ? studentLike
                                  : students.find(
                                      (candidate) =>
                                        candidate._id === String(studentLike),
                                    );

                              return (
                                <tr key={student?._id || String(studentLike)}>
                                  <td>{nameOf(student) || String(studentLike)}</td>
                                  <td>{student?.email || "—"}</td>
                                  <td className="text-end">
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-danger"
                                      onClick={() =>
                                        removeStudent(student?._id || studentLike)
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
                  </div>

                  {notEnrolledStudents.length ? (
                    <div>
                      <h4 className="dash-section-heading">Enroll Students</h4>
                      <div className="mb-3">
                        <select
                          className="form-select"
                          multiple
                          style={{ minHeight: 150 }}
                          value={enrollIds}
                          onChange={(e) =>
                            setEnrollIds(
                              Array.from(
                                e.target.selectedOptions,
                                (option) => option.value,
                              ),
                            )
                          }
                        >
                          {notEnrolledStudents.map((student) => (
                            <option key={student._id} value={student._id}>
                              {nameOf(student)} ({student.email})
                            </option>
                          ))}
                        </select>
                        <div className="form-text">
                          Use Ctrl or Cmd to select multiple students.
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={enrollSelected}
                        disabled={saving || !enrollIds.length}
                      >
                        {saving
                          ? "Enrolling..."
                          : `Enroll ${enrollIds.length || ""} student(s)`}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
