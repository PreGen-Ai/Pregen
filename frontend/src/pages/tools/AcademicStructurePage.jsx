// src/pages/tools/AcademicStructurePage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import api from "../../services/api/api.js";
import "../../components/styles/admin-tools.css";

/**
 * MVP upgrades:
 * - Fixes listClasses shape (supports array OR { items })
 * - Adds refresh + optimistic UI selection
 * - Adds client-side search + sort
 * - Adds safe parsing for Student IDs
 * - Adds disabled states + inline hints
 * - No extra backend endpoints required
 */

const toArray = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

const normalizeIdList = (raw) =>
  String(raw || "")
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean);

function sortRows(rows, key, dir) {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === "name")
      return String(a.name || "").localeCompare(String(b.name || "")) * mul;

    if (key === "students")
      return ((a.studentIds?.length || 0) - (b.studentIds?.length || 0)) * mul;
    if (key === "grade")
      return (Number(a.grade || 0) - Number(b.grade || 0)) * mul;

    return String(a._id || "").localeCompare(String(b._id || "")) * mul;
  });
}

export default function AcademicStructurePage() {
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);

  const [classes, setClasses] = useState([]);
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
  const [studentIds, setStudentIds] = useState("");

  const selected = useMemo(
    () => classes.find((c) => c._id === selectedId),
    [classes, selectedId],
  );

  async function load() {
    setLoading(true);
    try {
      const data = await api.admin.listClasses();
      const items = toArray(data);
      setClasses(items);

      if (!selectedId && items.length) setSelectedId(items[0]._id);
      if (
        selectedId &&
        !items.some((c) => c._id === selectedId) &&
        items.length
      )
        setSelectedId(items[0]._id);
    } catch (e) {
      toast.error(e?.message || "Failed to load classes");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!alive) return;
      await load();
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = !needle
      ? classes
      : classes.filter((c) => {
          const hay =
            `${c.name || ""} ${c.grade || ""} ${c.section || ""} ${c.teacherId || ""}`.toLowerCase();
          return hay.includes(needle);
        });

    return sortRows(base, sortKey, sortDir);
  }, [classes, q, sortKey, sortDir]);

  const onToggleSort = (key) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
  };

  async function onCreateClass() {
    if (mutating) return;

    const name = newClass.name.trim();
    if (!name) return toast.error("Class name is required");

    try {
      setMutating(true);
      await api.admin.createClass({ ...newClass, name });

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

    const tid = teacherId.trim();
    if (!tid) return toast.error("Teacher ID is required");

    try {
      setMutating(true);
      await api.admin.assignTeacher(selected._id, tid);

      toast.success("Teacher assigned");
      setTeacherId("");
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

    const ids = normalizeIdList(studentIds);
    if (!ids.length) return toast.error("Provide at least one Student ID");

    try {
      setMutating(true);
      await api.admin.enrollStudents(selected._id, ids);

      toast.success("Students enrolled");
      setStudentIds("");
      await load();
    } catch (e) {
      toast.error(e?.message || "Enroll failed");
    } finally {
      setMutating(false);
    }
  }

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

        {/* Create class */}
        <div className="card">
          <div className="card-inner">
            <div style={{ fontWeight: 900, marginBottom: 10 }}>
              Create class
            </div>

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

            <div style={{ marginTop: 10, color: "#D1D5DB", fontSize: 13 }}>
              Tip: keep names consistent like <b>“Grade 2 • A”</b> to help
              teachers and students find classes fast.
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div
          style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 18 }}
        >
          {/* Left: class list */}
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
                  <button
                    className="btn-ghost"
                    onClick={() => onToggleSort("name")}
                    title="Sort by name"
                  >
                    Name{" "}
                    {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => onToggleSort("grade")}
                    title="Sort by grade"
                  >
                    Grade{" "}
                    {sortKey === "grade" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => onToggleSort("students")}
                    title="Sort by students"
                  >
                    Students{" "}
                    {sortKey === "students"
                      ? sortDir === "asc"
                        ? "↑"
                        : "↓"
                      : ""}
                  </button>
                </div>

                {loading ? (
                  <div style={{ color: "#D1D5DB" }}>Loading...</div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {filtered.map((c) => (
                      <button
                        key={c._id}
                        className="btn-ghost"
                        style={{
                          textAlign: "left",
                          borderColor:
                            c._id === selectedId
                              ? "rgba(212,175,55,0.45)"
                              : "rgba(255,255,255,0.12)",
                        }}
                        onClick={() => setSelectedId(c._id)}
                      >
                        <div style={{ fontWeight: 900 }}>{c.name}</div>
                        <div style={{ color: "#D1D5DB" }}>
                          {c.grade ? `Grade ${c.grade}` : "—"}{" "}
                          {c.section ? `• ${c.section}` : ""} •{" "}
                          {c.studentIds?.length || 0} students
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

          {/* Right: class details + actions */}
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
                    Teacher: {selected?.teacherId || "—"} • Students:{" "}
                    {selected?.studentIds?.length || 0}
                  </div>
                </div>

                {selected?._id ? (
                  <div style={{ color: "#D1D5DB", fontSize: 12 }}>
                    ID:{" "}
                    <span style={{ fontFamily: "monospace" }}>
                      {selected._id}
                    </span>
                  </div>
                ) : null}
              </div>

              <div style={{ height: 14 }} />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px",
                  gap: 10,
                }}
              >
                <input
                  className="input"
                  placeholder="Teacher ID"
                  value={teacherId}
                  onChange={(e) => setTeacherId(e.target.value)}
                  disabled={!selected?._id || mutating}
                />
                <button
                  className="btn-gold"
                  onClick={onAssignTeacher}
                  disabled={!selected?._id || mutating}
                >
                  Assign
                </button>
              </div>

              <div style={{ height: 10 }} />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 140px",
                  gap: 10,
                }}
              >
                <input
                  className="input"
                  placeholder="Student IDs comma or newline separated"
                  value={studentIds}
                  onChange={(e) => setStudentIds(e.target.value)}
                  disabled={!selected?._id || mutating}
                />
                <button
                  className="btn-gold"
                  onClick={onEnroll}
                  disabled={!selected?._id || mutating}
                >
                  Enroll
                </button>
              </div>

              <div style={{ height: 16 }} />
              <div style={{ color: "#D1D5DB", lineHeight: 1.35 }}>
                Flow:
                <div>1) Create class</div>
                <div>2) Assign teacher</div>
                <div>3) Enroll students</div>
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  Note: If your backend stores teacherId and studentIds
                  differently, update the labels mapping here.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 14 }} />
        <div className="card">
          <div
            className="card-inner"
            style={{ color: "#D1D5DB", lineHeight: 1.4 }}
          >
            note: add a teacher picker and student picker later, backed by{" "}
            <span style={{ fontFamily: "monospace" }}>/api/admin/users</span>{" "}
            filters.
          </div>
        </div>
      </div>
    </div>
  );
}
