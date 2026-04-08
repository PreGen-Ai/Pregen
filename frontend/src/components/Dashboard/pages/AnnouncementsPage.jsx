import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import api from "../../../services/api/api";
import { useAuthContext } from "../../../context/AuthContext";

const asCourses = (value) => {
  if (Array.isArray(value?.courses)) return value.courses;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value)) return value;
  return [];
};

const asItems = (value) => {
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value)) return value;
  return [];
};

const emptyForm = {
  title: "",
  message: "",
  scope: "course",
  category: "general",
  courseId: "",
  classroomId: "",
  expiresAt: "",
  pinned: false,
};

const roleValue = (user) => String(user?.role || "").trim().toUpperCase();

const createEmptyForm = (canCreateTenantScope) => ({
  ...emptyForm,
  scope: canCreateTenantScope ? "tenant" : "course",
});

const formatDate = (value) => {
  if (!value) return "No expiry";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No expiry" : date.toLocaleString();
};

const formatClassroomLabel = (item) =>
  [
    item?.name || "Classroom",
    item?.grade ? `Grade ${item.grade}` : "",
    item?.section || "",
  ]
    .filter(Boolean)
    .join(" | ");

export default function AnnouncementsPage() {
  const { user } = useAuthContext();
  const role = roleValue(user);
  const isSuperAdmin = role === "SUPERADMIN";
  const canCreate = ["TEACHER", "ADMIN", "SUPERADMIN"].includes(role);
  const canCreateTenantScope = ["ADMIN", "SUPERADMIN"].includes(role);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [courses, setCourses] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [form, setForm] = useState(() => createEmptyForm(canCreateTenantScope));

  // AI Writing Assistant state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiAction, setAiAction] = useState("draft");
  const [aiContext, setAiContext] = useState("");
  const [aiLanguage, setAiLanguage] = useState("English");
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");

  // Superadmin: tenant selector
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");

  useEffect(() => {
    if (!isSuperAdmin) return;
    api.admin.listTenants().then((res) => {
      setTenants(Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : []);
    }).catch(() => {});
  }, [isSuperAdmin]);

  const classroomOptions = useMemo(() => {
    const merged = new Map();

    courses.forEach((course) => {
      if (!course?.classroomId) return;

      merged.set(String(course.classroomId), {
        _id: String(course.classroomId),
        label: `${course.title || "Course"} | Classroom`,
      });
    });

    classrooms.forEach((classroom) => {
      if (!classroom?._id) return;

      merged.set(String(classroom._id), {
        _id: String(classroom._id),
        label: formatClassroomLabel(classroom),
      });
    });

    return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [courses, classrooms]);

  const tenantHeader = isSuperAdmin && selectedTenantId
    ? { headers: { "x-tenant-id": selectedTenantId } }
    : undefined;

  const load = useCallback(async () => {
    // Superadmin must select a tenant before loading
    if (isSuperAdmin && !selectedTenantId) {
      setAnnouncements([]);
      setCourses([]);
      setClassrooms([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const cfg = isSuperAdmin && selectedTenantId
        ? { headers: { "x-tenant-id": selectedTenantId } }
        : undefined;
      const requests = [
        api.announcements.list(undefined, cfg),
        api.courses.getAllCourses({ limit: 200 }),
      ];

      if (canCreateTenantScope) {
        // Pass tenant cfg so superadmin listClasses uses the selected tenant header
        requests.push(api.admin.listClasses({ limit: 200 }, cfg || {}));
      }

      const [announcementsRes, coursesRes, classesRes] = await Promise.all(requests);

      setAnnouncements(announcementsRes?.items || []);
      setCourses(asCourses(coursesRes));
      setClassrooms(canCreateTenantScope ? asItems(classesRes) : []);
    } catch (error) {
      toast.error(error?.message || "Failed to load announcements");
    } finally {
      setLoading(false);
    }
  }, [canCreateTenantScope, isSuperAdmin, selectedTenantId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setForm((current) => {
      if (current.scope !== "classroom") return current;

      const classroomExists = classroomOptions.some(
        (option) => option._id === current.classroomId,
      );

      return classroomExists ? current : { ...current, classroomId: "" };
    });
  }, [classroomOptions]);

  const orderedAnnouncements = useMemo(
    () =>
      [...announcements].sort(
        (a, b) =>
          Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
          new Date(b.publishedAt || b.createdAt || 0) -
            new Date(a.publishedAt || a.createdAt || 0),
      ),
    [announcements],
  );

  const submitAnnouncement = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      toast.error("Title and message are required");
      return;
    }

    if (form.scope === "course" && !form.courseId) {
      toast.error("Select a course for a course announcement");
      return;
    }

    if (form.scope === "classroom" && !form.classroomId) {
      toast.error("Select a classroom for a classroom announcement");
      return;
    }

    if (isSuperAdmin && !selectedTenantId) {
      toast.error("Select a tenant before publishing");
      return;
    }

    try {
      setSaving(true);
      await api.announcements.create(
        {
          ...form,
          expiresAt: form.expiresAt || null,
          pinned: form.pinned,
          courseId: form.scope === "course" ? form.courseId : null,
          classroomId: form.scope === "classroom" ? form.classroomId : null,
        },
        tenantHeader,
      );
      toast.success("Announcement created");
      setForm(createEmptyForm(canCreateTenantScope));
      await load();
    } catch (error) {
      toast.error(error?.message || "Failed to create announcement");
    } finally {
      setSaving(false);
    }
  };

  const deleteAnnouncement = async (announcementId) => {
    if (!window.confirm("Delete this announcement?")) return;
    try {
      setSaving(true);
      await api.announcements.delete(announcementId);
      toast.success("Announcement deleted");
      await load();
    } catch (error) {
      toast.error(error?.message || "Failed to delete announcement");
    } finally {
      setSaving(false);
    }
  };

  const handleAiDraft = async () => {
    if (aiAction === "draft" && !aiContext.trim()) {
      toast.error("Enter a context describing what to announce");
      return;
    }
    if ((aiAction === "rewrite" || aiAction === "simplify" || aiAction === "translate") && !form.message.trim()) {
      toast.error("Write a message first before using rewrite/simplify/translate");
      return;
    }
    setAiDraftLoading(true);
    setAiSuggestion("");
    try {
      const result = await api.ai.draftAnnouncement({
        action: aiAction,
        context: aiContext || `Category: ${form.category}. Title: ${form.title}`,
        current_text: form.message,
        language: aiLanguage,
      });
      setAiSuggestion(result.draft || result.text || result.announcement || "");
    } catch (err) {
      toast.error("AI draft failed. Please try again.");
    } finally {
      setAiDraftLoading(false);
    }
  };

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-3">
        <div>
          <h2>Announcements</h2>
          <p className="text-muted mb-0">
            Publish updates, reminders, and deadline notices to the right audience.
          </p>
        </div>
      </div>

      {isSuperAdmin && (
        <div className="dash-card mb-4">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <label className="fw-semibold mb-0" style={{ minWidth: 90 }}>Tenant</label>
            <select
              className={`form-select ${!selectedTenantId ? "border-warning" : ""}`}
              style={{ maxWidth: 300 }}
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
              <small className="text-warning">Select a tenant to view or post announcements</small>
            )}
          </div>
        </div>
      )}

      {canCreate ? (
        <div className="dash-card mb-4">
          <h3 className="mb-3">Create announcement</h3>
          <div className="row g-3">
            <div className="col-md-4">
              <input
                className="form-control"
                placeholder="Title"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>
            <div className="col-md-3">
              <select
                className="form-select"
                value={form.scope}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    scope: event.target.value,
                    courseId: "",
                    classroomId: "",
                  }))
                }
              >
                {canCreateTenantScope ? <option value="tenant">Tenant-wide</option> : null}
                <option value="course">Course</option>
                <option value="classroom">Classroom</option>
              </select>
            </div>
            <div className="col-md-3">
              <select
                className="form-select"
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({ ...current, category: event.target.value }))
                }
              >
                <option value="general">General</option>
                <option value="deadline">Deadline</option>
                <option value="update">Update</option>
                <option value="reminder">Reminder</option>
              </select>
            </div>
            <div className="col-md-2 d-flex align-items-center">
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={form.pinned}
                  id="announcementPinned"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, pinned: event.target.checked }))
                  }
                />
                <label className="form-check-label" htmlFor="announcementPinned">
                  Pin
                </label>
              </div>
            </div>
            <div className="col-md-12">
              <textarea
                className="form-control"
                rows={4}
                placeholder="Message"
                value={form.message}
                onChange={(event) =>
                  setForm((current) => ({ ...current, message: event.target.value }))
                }
              />
            </div>
            {form.scope === "course" ? (
              <div className="col-md-6">
                <select
                  className="form-select"
                  value={form.courseId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, courseId: event.target.value }))
                  }
                >
                  <option value="">Select course</option>
                  {courses.map((course) => (
                    <option key={course._id} value={course._id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {form.scope === "classroom" ? (
              <div className="col-md-6">
                <select
                  className="form-select"
                  value={form.classroomId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      classroomId: event.target.value,
                    }))
                  }
                >
                  <option value="">Select classroom</option>
                  {classroomOptions.map((classroom) => (
                    <option key={classroom._id} value={classroom._id}>
                      {classroom.label}
                    </option>
                  ))}
                </select>
                {classroomOptions.length === 0 ? (
                  <div className="form-text text-warning mt-2">
                    No classrooms are available for your current access scope.
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="col-md-4">
              <input
                className="form-control"
                type="datetime-local"
                value={form.expiresAt}
                onChange={(event) =>
                  setForm((current) => ({ ...current, expiresAt: event.target.value }))
                }
              />
            </div>
          </div>
          {/* AI Writing Assistant */}
          <div className="mt-3 border rounded p-3" style={{ borderColor: "var(--border-muted, #2a3345)" }}>
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => { setAiPanelOpen((o) => !o); setAiSuggestion(""); }}
              >
                {aiPanelOpen ? "Hide AI Assistant" : "AI Writing Assistant"}
              </button>
              {aiPanelOpen && (
                <small className="text-muted">Draft, rewrite, simplify, or translate your message with AI</small>
              )}
            </div>
            {aiPanelOpen && (
              <div className="mt-3 row g-2">
                <div className="col-md-3">
                  <select
                    className="form-select form-select-sm"
                    value={aiAction}
                    onChange={(e) => { setAiAction(e.target.value); setAiSuggestion(""); }}
                  >
                    <option value="draft">Draft from context</option>
                    <option value="rewrite">Rewrite</option>
                    <option value="simplify">Simplify</option>
                    <option value="translate">Translate</option>
                  </select>
                </div>
                {aiAction === "translate" && (
                  <div className="col-md-3">
                    <select
                      className="form-select form-select-sm"
                      value={aiLanguage}
                      onChange={(e) => setAiLanguage(e.target.value)}
                    >
                      <option value="English">English</option>
                      <option value="Arabic">Arabic</option>
                      <option value="French">French</option>
                      <option value="Spanish">Spanish</option>
                    </select>
                  </div>
                )}
                {aiAction === "draft" && (
                  <div className="col-12">
                    <textarea
                      className="form-control form-control-sm"
                      rows={2}
                      placeholder="Describe what you want to announce (e.g., exam on Thursday covering chapters 3–5)"
                      value={aiContext}
                      onChange={(e) => setAiContext(e.target.value)}
                    />
                  </div>
                )}
                <div className="col-auto">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={handleAiDraft}
                    disabled={aiDraftLoading}
                  >
                    {aiDraftLoading ? "Generating…" : "Generate Draft"}
                  </button>
                </div>
                {aiSuggestion && (
                  <div className="col-12">
                    <div
                      className="p-2 rounded"
                      style={{
                        border: "1px solid var(--accent-cyan, #06B6D4)",
                        fontSize: "0.875em",
                      }}
                    >
                      <p className="mb-2" style={{ whiteSpace: "pre-wrap" }}>
                        {aiSuggestion}
                      </p>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => {
                            setForm((f) => ({ ...f, message: aiSuggestion }));
                            setAiPanelOpen(false);
                            setAiSuggestion("");
                          }}
                        >
                          Use this
                        </button>
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setAiSuggestion("")}
                        >
                          Discard
                        </button>
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={handleAiDraft}
                          disabled={aiDraftLoading}
                        >
                          Regenerate
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-3">
            <button
              className="btn btn-primary"
              onClick={submitAnnouncement}
              disabled={saving}
            >
              {saving ? "Saving..." : "Publish announcement"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="d-flex flex-column gap-3">
        {loading ? (
          <div className="dash-card">
            <p className="text-muted mb-0">Loading announcements...</p>
          </div>
        ) : orderedAnnouncements.length === 0 ? (
          <div className="dash-card">
            <p className="text-muted mb-0">No announcements available right now.</p>
          </div>
        ) : (
          orderedAnnouncements.map((announcement) => (
            <div key={announcement._id} className="dash-card">
              <div className="d-flex justify-content-between gap-3 flex-wrap">
                <div>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <h3 className="mb-0">{announcement.title}</h3>
                    {announcement.pinned ? (
                      <span className="badge bg-warning text-dark">Pinned</span>
                    ) : null}
                    <span className="badge bg-secondary text-uppercase">
                      {announcement.scope}
                    </span>
                    <span className="badge bg-info text-dark">
                      {announcement.category}
                    </span>
                  </div>
                  <p className="mt-2 mb-2">{announcement.message}</p>
                  <div className="text-muted small">
                    Published: {formatDate(announcement.publishedAt || announcement.createdAt)}
                    {" | "}Expires: {formatDate(announcement.expiresAt)}
                  </div>
                </div>
                {canCreate ? (
                  <div>
                    <button
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => deleteAnnouncement(announcement._id)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
