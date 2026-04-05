import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../services/api/api.js";
import "../../components/styles/admin-tools.css";

const toArray = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

function sortRows(rows, key, dir) {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name") {
      return String(a.name || "").localeCompare(String(b.name || "")) * mul;
    }
    if (key === "students") {
      return ((a.studentIds?.length || 0) - (b.studentIds?.length || 0)) * mul;
    }
    if (key === "grade") {
      return String(a.grade || "").localeCompare(String(b.grade || "")) * mul;
    }
    return String(a._id || "").localeCompare(String(b._id || "")) * mul;
  });
}

function normalizeRole(role) {
  return String(role || "").trim().toUpperCase();
}

function displayName(user) {
  return (
    user?.name ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    user?.email ||
    "Unnamed user"
  );
}

export default function AcademicStructurePage() {
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);

  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const [newClass, setNewClass] = useState({
    name: "",
    grade: "",
    section: "",
  });

  const [teacherId, setTeacherId] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [selectedRemoveIds, setSelectedRemoveIds] = useState([]);

  const selected = useMemo(
    () => classes.find((c) => c._id === selectedId) || null,
    [classes, selectedId],
  );

  const teacherOptions = useMemo(
    () =>
      toArray(teachers)
        .filter((user) => normalizeRole(user?.role) === "TEACHER")
        .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [teachers],
  );

  const studentOptions = useMemo(
    () =>
      toArray(students)
        .filter((user) => normalizeRole(user?.role) === "STUDENT")
        .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [students],
  );

  const enrolledStudents = useMemo(() => {
    if (!selected?.studentIds?.length) return [];
    const selectedSet = new Set(selected.studentIds.map(String));
    return studentOptions.filter((student) => selectedSet.has(String(student._id)));
  }, [selected, studentOptions]);

  async function load() {
    setLoading(true);
    try {
      const [classesRes, teachersRes, studentsRes] = await Promise.all([
        api.admin.listClasses(),
        api.admin.listUsers({ role: "TEACHER", status: "enabled" }),
        api.admin.listUsers({ role: "STUDENT", status: "enabled" }),
      ]);

      const classItems = toArray(classesRes);
      setClasses(classItems);
      setTeachers(toArray(teachersRes));
      setStudents(toArray(studentsRes));

      if (!selectedId && classItems.length) {
        setSelectedId(classItems[0]._id);
      } else if (
        selectedId &&
        !classItems.some((item) => item._id === selectedId)
      ) {
        setSelectedId(classItems[0]?._id || null);
      }
    } catch (e) {
      toast.error(e?.message || "Failed to load academic structure");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let live = true;
    (async () => {
      if (!live) return;
      await load();
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTeacherId(selected?.teacherId || "");
    setSelectedStudentIds([]);
    setSelectedRemoveIds([]);
  }, [selectedId, selected?.teacherId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = !needle
      ? classes
      : classes.filter((item) => {
          const hay = `${item.name || ""} ${item.grade || ""} ${item.section || ""}`
            .toLowerCase()
            .trim();
          return hay.includes(needle);
        });

    return sortRows(base, sortKey, sortDir);
  }, [classes, q, sortKey, sortDir]);

  const summary = useMemo(
    () => ({
      classes: classes.length,
      teachers: teacherOptions.length,
      students: studentOptions.length,
      enrolled: classes.reduce(
        (sum, item) => sum + Number(item?.studentIds?.length || 0),
        0,
      ),
    }),
    [classes, studentOptions.length, teacherOptions.length],
  );

  const onToggleSort = (key) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
  };

  async function onCreateClass() {
    if (mutating) return;
    const name = newClass.name.trim();
    if (!name) return toast.error("Class name is required");

    try {
      setMutating(true);
      await api.admin.createClass({
        name,
        grade: newClass.grade.trim(),
        section: newClass.section.trim(),
      });
      toast.success("Class created");
      setNewClass({ name: "", grade: "", section: "" });
      await load();
    } catch (e) {
      toast.error(e?.message || "Create failed");
    } finally {
      setMutating(false);
    }
  }

  async function onAssignTeacher() {
    if (mutating) return;
    if (!selected?._id) return toast.error("Select a class first");
    if (!teacherId) return toast.error("Select a teacher");

    try {
      setMutating(true);
      await api.admin.assignTeacher(selected._id, teacherId);
      toast.success("Teacher assigned");
      await load();
    } catch (e) {
      toast.error(e?.message || "Assign failed");
    } finally {
      setMutating(false);
    }
  }

  async function onEnroll() {
    if (mutating) return;
    if (!selected?._id) return toast.error("Select a class first");
    if (!selectedStudentIds.length) {
      return toast.error("Select at least one student");
    }

    try {
      setMutating(true);
      await api.admin.enrollStudents(selected._id, selectedStudentIds);
      toast.success("Students enrolled");
      setSelectedStudentIds([]);
      await load();
    } catch (e) {
      toast.error(e?.message || "Enroll failed");
    } finally {
      setMutating(false);
    }
  }

  async function onUnenroll() {
    if (mutating) return;
    if (!selected?._id) return toast.error("Select a class first");
    if (!selectedRemoveIds.length) {
      return toast.error("Select at least one student to remove");
    }

    try {
      setMutating(true);
      await api.admin.unenrollStudents(selected._id, selectedRemoveIds);
      toast.success("Students removed");
      setSelectedRemoveIds([]);
      await load();
    } catch (e) {
      toast.error(e?.message || "Remove failed");
    } finally {
      setMutating(false);
    }
  }

  const availableStudents = studentOptions.filter(
    (student) => !selected?.studentIds?.map(String).includes(String(student._id)),
  );

  return (
    <div className="admin-shell">
      <div className="admin-content">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div className="admin-title">Academic Structure</div>

          <button
            className="btn-ghost"
            onClick={load}
            disabled={loading || mutating}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

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
              <div className="text-xs opacity-70">Classes</div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>
                {summary.classes}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-inner">
              <div className="text-xs opacity-70">Teachers</div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>
                {summary.teachers}
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-inner">
              <div className="text-xs opacity-70">Students / Enrollments</div>
              <div style={{ fontSize: 28, fontWeight: 900 }}>
                {summary.students} / {summary.enrolled}
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
                <Link className="btn-ghost" to="/dashboard/admin/users">
                  Users
                </Link>
                <Link className="btn-ghost" to="/dashboard/admin/subjects">
                  Subjects
                </Link>
                <Link className="btn-ghost" to="/dashboard/admin/ai-controls">
                  AI Controls
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-inner">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Create class</div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 160px 160px 140px",
                gap: 10,
              }}
            >
              <input
                className="input"
                placeholder="Class name"
                value={newClass.name}
                onChange={(e) =>
                  setNewClass((p) => ({ ...p, name: e.target.value }))
                }
                disabled={mutating}
              />
              <input
                className="input"
                placeholder="Grade"
                value={newClass.grade}
                onChange={(e) =>
                  setNewClass((p) => ({ ...p, grade: e.target.value }))
                }
                disabled={mutating}
              />
              <input
                className="input"
                placeholder="Section"
                value={newClass.section}
                onChange={(e) =>
                  setNewClass((p) => ({ ...p, section: e.target.value }))
                }
                disabled={mutating}
              />
              <button
                className="btn-gold"
                onClick={onCreateClass}
                disabled={mutating}
              >
                {mutating ? "..." : "Create"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div
          style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 18 }}
        >
          <div className="card">
            <div className="card-inner">
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Classes</div>

              <div style={{ display: "grid", gap: 10 }}>
                <input
                  className="input"
                  placeholder="Search classes"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="btn-ghost" onClick={() => onToggleSort("name")}>
                    Name {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                  <button className="btn-ghost" onClick={() => onToggleSort("grade")}>
                    Grade {sortKey === "grade" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                  <button className="btn-ghost" onClick={() => onToggleSort("students")}>
                    Students {sortKey === "students" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </div>

                {loading ? (
                  <div style={{ color: "#D1D5DB" }}>Loading...</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {filtered.map((item) => (
                      <button
                        key={item._id}
                        className="btn-ghost"
                        style={{
                          textAlign: "left",
                          borderColor:
                            item._id === selectedId
                              ? "rgba(212,175,55,0.45)"
                              : "rgba(255,255,255,0.12)",
                        }}
                        onClick={() => setSelectedId(item._id)}
                      >
                        <div style={{ fontWeight: 900 }}>{item.name}</div>
                        <div style={{ color: "#D1D5DB" }}>
                          {item.grade ? `Grade ${item.grade}` : "—"}{" "}
                          {item.section ? `• ${item.section}` : ""} •{" "}
                          {item.studentIds?.length || 0} students
                        </div>
                      </button>
                    ))}

                    {filtered.length === 0 ? (
                      <div style={{ color: "#D1D5DB" }}>
                        No classes match your search.
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-inner">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontWeight: 1000, fontSize: 18 }}>
                    {selected?.name || "Select a class"}
                  </div>
                  <div style={{ color: "#D1D5DB" }}>
                    Teacher:{" "}
                    {teacherOptions.find((teacher) => teacher._id === selected?.teacherId)
                      ? displayName(
                          teacherOptions.find((teacher) => teacher._id === selected?.teacherId),
                        )
                      : "—"}{" "}
                    • Students: {selected?.studentIds?.length || 0}
                  </div>
                </div>

                {selected?._id ? (
                  <div style={{ color: "#D1D5DB", fontSize: 12 }}>
                    ID:{" "}
                    <span style={{ fontFamily: "monospace" }}>{selected._id}</span>
                  </div>
                ) : null}
              </div>

              <div style={{ height: 14 }} />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 160px",
                  gap: 10,
                }}
              >
                <select
                  className="select"
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  disabled={!selected?._id || mutating}
                >
                  <option value="">Select teacher</option>
                  {teacherOptions.map((teacher) => (
                    <option key={teacher._id} value={teacher._id}>
                      {displayName(teacher)} • {teacher.email}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-gold"
                  onClick={onAssignTeacher}
                  disabled={!selected?._id || mutating || !teacherId}
                >
                  Assign
                </button>
              </div>

              <div style={{ height: 16 }} />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 160px",
                  gap: 10,
                  alignItems: "start",
                }}
              >
                <select
                  className="select"
                  multiple
                  size={6}
                  value={selectedStudentIds}
                  onChange={(e) =>
                    setSelectedStudentIds(
                      Array.from(e.target.selectedOptions, (option) => option.value),
                    )
                  }
                  disabled={!selected?._id || mutating}
                >
                  {availableStudents.map((student) => (
                    <option key={student._id} value={student._id}>
                      {displayName(student)} • {student.email}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-gold"
                  onClick={onEnroll}
                  disabled={!selected?._id || mutating || !selectedStudentIds.length}
                >
                  Enroll selected
                </button>
              </div>

              <div style={{ height: 16 }} />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 160px",
                  gap: 10,
                  alignItems: "start",
                }}
              >
                <select
                  className="select"
                  multiple
                  size={6}
                  value={selectedRemoveIds}
                  onChange={(e) =>
                    setSelectedRemoveIds(
                      Array.from(e.target.selectedOptions, (option) => option.value),
                    )
                  }
                  disabled={!selected?._id || mutating || !enrolledStudents.length}
                >
                  {enrolledStudents.map((student) => (
                    <option key={student._id} value={student._id}>
                      {displayName(student)} • {student.email}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-ghost"
                  onClick={onUnenroll}
                  disabled={!selected?._id || mutating || !selectedRemoveIds.length}
                >
                  Remove selected
                </button>
              </div>

              <div style={{ height: 16 }} />
              <div style={{ color: "#D1D5DB", lineHeight: 1.4 }}>
                Flow:
                <div>1) Create class</div>
                <div>2) Assign teacher from tenant users</div>
                <div>3) Enroll or remove students with validated pickers</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
