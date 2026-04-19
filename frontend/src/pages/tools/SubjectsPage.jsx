import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import api from "../../services/api/api";
import { useAuthContext } from "../../context/AuthContext";
import "../../components/styles/admin-tools.css";

const emptyForm = {
  name: "",
  code: "",
  description: "",
  teacherIds: [],
  classroomIds: [],
  courseIds: [],
  status: "active",
};

const asItems = (value, keys = ["items", "courses"]) => {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
};

const normalizeIdArray = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

const normalizeRole = (value) => String(value || "").trim().toUpperCase();

const teacherLabel = (teacher) =>
  teacher.firstName || teacher.lastName
    ? `${teacher.firstName || ""} ${teacher.lastName || ""}`.trim()
    : teacher.email || teacher.username || teacher._id;

const classroomLabel = (item) =>
  [
    item?.name || "Class",
    item?.grade ? `Grade ${item.grade}` : "",
    item?.section || "",
  ]
    .filter(Boolean)
    .join(" | ");

const courseLabel = (course) =>
  course.title || course.shortName || course.code || course._id;

const sortByLabel = (items, getLabel) =>
  [...items].sort((a, b) => getLabel(a).localeCompare(getLabel(b)));

const mergeOptionsById = (items, fallbackItems = []) => {
  const merged = new Map();

  [...items, ...fallbackItems].forEach((item) => {
    if (!item?._id) return;
    merged.set(String(item._id), item);
  });

  return Array.from(merged.values());
};

export default function SubjectsPage() {
  const { user } = useAuthContext();
  const isSuperAdmin = String(user?.role || "").toUpperCase() === "SUPERADMIN";

  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  // Load tenant list for superadmin
  useEffect(() => {
    if (!isSuperAdmin) return;
    api.admin
      .listTenants()
      .then((res) => {
        setTenants(
          Array.isArray(res?.items)
            ? res.items
            : Array.isArray(res)
              ? res
              : [],
        );
      })
      .catch(() => {});
  }, [isSuperAdmin]);

  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject._id === editingId) || null,
    [subjects, editingId],
  );

  const teacherOptions = useMemo(
    () =>
      sortByLabel(
        mergeOptionsById(teachers, selectedSubject?.teachers || []),
        teacherLabel,
      ),
    [teachers, selectedSubject],
  );

  const classroomOptions = useMemo(
    () =>
      sortByLabel(
        mergeOptionsById(classes, selectedSubject?.classrooms || []),
        classroomLabel,
      ),
    [classes, selectedSubject],
  );

  const courseOptions = useMemo(
    () =>
      sortByLabel(
        mergeOptionsById(courses, selectedSubject?.courses || []),
        courseLabel,
      ),
    [courses, selectedSubject],
  );

  const load = async (tenantId = "") => {
    const cfg =
      isSuperAdmin && tenantId
        ? { headers: { "x-tenant-id": tenantId } }
        : {};

    setLoading(true);
    try {
      const [subjectsRes, usersRes, classesRes, coursesRes] = await Promise.all([
        api.admin.listSubjects({}, cfg),
        api.admin.listUsers({ role: "TEACHER", limit: 200 }, cfg),
        api.admin.listClasses({}, cfg),
        api.courses.getAllCourses({ limit: 200 }, cfg),
      ]);

      setSubjects(asItems(subjectsRes));
      setTeachers(
        sortByLabel(
          asItems(usersRes)
            .filter((u) => normalizeRole(u.role) === "TEACHER")
            .map((u) => ({ ...u, _id: String(u._id || "").trim() })),
          teacherLabel,
        ),
      );
      setClasses(
        sortByLabel(
          asItems(classesRes).map((item) => ({
            ...item,
            _id: String(item._id || "").trim(),
          })),
          classroomLabel,
        ),
      );
      setCourses(
        sortByLabel(
          asItems(coursesRes, ["courses", "items"]).map((course) => ({
            ...course,
            _id: String(course._id || "").trim(),
          })),
          courseLabel,
        ),
      );
    } catch (error) {
      toast.error(error?.message || "Failed to load subjects");
    } finally {
      setLoading(false);
    }
  };

  // Re-run when tenant selection changes
  useEffect(() => {
    if (isSuperAdmin && !selectedTenantId) {
      setSubjects([]);
      setTeachers([]);
      setClasses([]);
      setCourses([]);
      setLoading(false);
      return;
    }
    load(selectedTenantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, selectedTenantId]);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      teacherIds: [],
      classroomIds: [],
      courseIds: [],
    });
  };

  const onEdit = (subject) => {
    setEditingId(subject._id);
    setForm({
      name: subject.name || "",
      code: subject.code || "",
      description: subject.description || "",
      teacherIds: normalizeIdArray(subject.teacherIds),
      classroomIds: normalizeIdArray(subject.classroomIds),
      courseIds: normalizeIdArray(subject.courseIds),
      status: subject.status || "active",
    });
  };

  const onSubmit = async () => {
    if (!form.name.trim()) {
      toast.error("Subject name is required");
      return;
    }

    const cfg =
      isSuperAdmin && selectedTenantId
        ? { headers: { "x-tenant-id": selectedTenantId } }
        : {};

    try {
      setSaving(true);
      if (editingId) {
        await api.admin.updateSubject(editingId, form, cfg);
        toast.success("Subject updated");
      } else {
        await api.admin.createSubject(form, cfg);
        toast.success("Subject created");
      }
      resetForm();
      await load(selectedTenantId);
    } catch (error) {
      toast.error(error?.message || "Failed to save subject");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (subjectId) => {
    if (!window.confirm("Delete this subject?")) return;

    const cfg =
      isSuperAdmin && selectedTenantId
        ? { headers: { "x-tenant-id": selectedTenantId } }
        : {};

    try {
      setSaving(true);
      await api.admin.deleteSubject(subjectId, cfg);
      toast.success("Subject deleted");
      if (editingId === subjectId) resetForm();
      await load(selectedTenantId);
    } catch (error) {
      toast.error(error?.message || "Failed to delete subject");
    } finally {
      setSaving(false);
    }
  };

  const renderMultiSelect = (
    label,
    options,
    selectedValues,
    onChange,
    getLabel,
  ) => (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <select
        className="input"
        multiple
        value={selectedValues}
        onChange={(event) =>
          onChange(
            Array.from(event.target.selectedOptions).map(
              (option) => option.value,
            ),
          )
        }
        style={{ minHeight: 140 }}
      >
        {options.map((option) => (
          <option key={option._id} value={option._id}>
            {getLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="admin-shell">
      <div className="admin-content">
        <div className="admin-title">Subjects</div>

        {/* Tenant selector — superadmin only */}
        {isSuperAdmin && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-inner">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: 700, minWidth: 60 }}>Tenant</span>
                <select
                  className="select"
                  style={{ minWidth: 260 }}
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                >
                  <option value="">— Select tenant —</option>
                  {tenants.map((t) => (
                    <option key={t._id} value={t.tenantId}>
                      {t.name || t.tenantId}
                    </option>
                  ))}
                </select>
                {!selectedTenantId && (
                  <span
                    className="badge"
                    style={{
                      color: "#fbbf24",
                      borderColor: "rgba(234,179,8,0.4)",
                    }}
                  >
                    Select a tenant to continue
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Main content — gated for superadmin until tenant selected */}
        {!isSuperAdmin || selectedTenantId ? (
          <>
            <div className="card" style={{ marginBottom: 18 }}>
              <div className="card-inner" style={{ display: "grid", gap: 14 }}>
                <div style={{ fontWeight: 900 }}>
                  {editingId ? "Edit subject" : "Create subject"}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 0.8fr 0.8fr",
                    gap: 12,
                  }}
                >
                  <input
                    className="input"
                    placeholder="Subject name"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                  <input
                    className="input"
                    placeholder="Code"
                    value={form.code}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        code: event.target.value,
                      }))
                    }
                  />
                  <select
                    className="input"
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value,
                      }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <textarea
                  className="input"
                  rows={4}
                  placeholder="Description"
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: 12,
                  }}
                >
                  {renderMultiSelect(
                    "Teachers",
                    teacherOptions,
                    form.teacherIds,
                    (teacherIds) =>
                      setForm((current) => ({
                        ...current,
                        teacherIds: normalizeIdArray(teacherIds),
                      })),
                    teacherLabel,
                  )}
                  {renderMultiSelect(
                    "Classes",
                    classroomOptions,
                    form.classroomIds,
                    (classroomIds) =>
                      setForm((current) => ({
                        ...current,
                        classroomIds: normalizeIdArray(classroomIds),
                      })),
                    classroomLabel,
                  )}
                  {renderMultiSelect(
                    "Courses",
                    courseOptions,
                    form.courseIds,
                    (courseIds) =>
                      setForm((current) => ({
                        ...current,
                        courseIds: normalizeIdArray(courseIds),
                      })),
                    courseLabel,
                  )}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="btn-gold"
                    onClick={onSubmit}
                    disabled={saving}
                  >
                    {saving
                      ? "Saving..."
                      : editingId
                        ? "Update subject"
                        : "Create subject"}
                  </button>
                  {editingId ? (
                    <button
                      className="btn-ghost"
                      onClick={resetForm}
                      disabled={saving}
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>

                {selectedSubject ? (
                  <div style={{ color: "#D1D5DB", fontSize: 13 }}>
                    Editing <strong>{selectedSubject.name}</strong>. Saving will
                    also sync the selected courses to this subject.
                  </div>
                ) : null}

                <div style={{ color: "#9CA3AF", fontSize: 13 }}>
                  Assigning a subject to one or more classes now provisions the
                  matching class workspace automatically so teachers and
                  students immediately get the right course context.
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-inner">
                <div style={{ fontWeight: 900, marginBottom: 12 }}>
                  Subject directory
                </div>

                {loading ? (
                  <div style={{ color: "#D1D5DB" }}>Loading subjects...</div>
                ) : subjects.length === 0 ? (
                  <div style={{ color: "#D1D5DB" }}>
                    No subjects created yet.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {subjects.map((subject) => (
                      <div
                        key={subject._id}
                        className="card"
                        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                      >
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
                              <div style={{ fontWeight: 800 }}>
                                {subject.name}
                              </div>
                              <div style={{ color: "#D1D5DB", fontSize: 13 }}>
                                {subject.code || "No code"} | {subject.status}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                className="btn-ghost"
                                onClick={() => onEdit(subject)}
                                disabled={saving}
                              >
                                Edit
                              </button>
                              <button
                                className="btn-ghost"
                                onClick={() => onDelete(subject._id)}
                                disabled={saving}
                              >
                                Delete
                              </button>
                            </div>
                          </div>

                          {subject.description ? (
                            <p style={{ margin: "12px 0 0", color: "#E5E7EB" }}>
                              {subject.description}
                            </p>
                          ) : null}

                          <div
                            style={{
                              display: "flex",
                              gap: 16,
                              flexWrap: "wrap",
                              marginTop: 12,
                              color: "#D1D5DB",
                              fontSize: 13,
                            }}
                          >
                            <span>
                              Teachers: {subject.counts?.teachers || 0}
                            </span>
                            <span>
                              Classes: {subject.counts?.classrooms || 0}
                            </span>
                            <span>Courses: {subject.counts?.courses || 0}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="card">
            <div
              className="card-inner"
              style={{ color: "#9CA3AF", padding: "20px 0" }}
            >
              Select a tenant above to view and manage subjects.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
