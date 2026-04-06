import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import api from "../../../services/api/api";
import { useAuthContext } from "../../../context/AuthContext";
import { API_BASE_URL } from "../../../services/api/http";

const asCourses = (value) => {
  if (Array.isArray(value?.courses)) return value.courses;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value)) return value;
  return [];
};

const emptyModuleForm = {
  title: "",
  summary: "",
  status: "published",
};

const emptyContentForm = {
  title: "",
  description: "",
  contentType: "link",
  url: "",
  textContent: "",
  status: "published",
  document: null,
};

const roleValue = (user) => String(user?.role || "").trim().toUpperCase();
const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());
const asText = (value) => String(value || "").trim();
const compactText = (value, max = 2400) => {
  const text = asText(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max)}…` : text;
};
const aiReplyText = (payload) =>
  asText(
    payload?.explanation ||
      payload?.reply ||
      payload?.message ||
      payload?.text ||
      payload?.result,
  );

export default function LessonsPage() {
  const { user } = useAuthContext();
  const role = roleValue(user);
  const canEdit = ["TEACHER", "ADMIN", "SUPERADMIN"].includes(role);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [modules, setModules] = useState([]);
  const [editingModuleId, setEditingModuleId] = useState("");
  const [moduleForm, setModuleForm] = useState(emptyModuleForm);
  const [activeModuleId, setActiveModuleId] = useState("");
  const [contentForm, setContentForm] = useState(emptyContentForm);
  const [aiItemId, setAiItemId] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiResponseTitle, setAiResponseTitle] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const activeModule = useMemo(
    () => modules.find((module) => module._id === activeModuleId) || null,
    [modules, activeModuleId],
  );

  const editingModule = useMemo(
    () => modules.find((module) => module._id === editingModuleId) || null,
    [modules, editingModuleId],
  );

  const selectedCourse = useMemo(
    () => courses.find((course) => course._id === selectedCourseId) || null,
    [courses, selectedCourseId],
  );
  const aiSelection = useMemo(() => {
    for (const module of modules) {
      const item = (module.items || []).find((entry) => entry._id === aiItemId);
      if (item) return { module, item };
    }
    return { module: null, item: null };
  }, [modules, aiItemId]);

  const loadCourses = useCallback(async () => {
    const response = await api.courses.getAllCourses({ limit: 200 });
    const nextCourses = asCourses(response);
    setCourses(nextCourses);
    if (!selectedCourseId && nextCourses.length) {
      setSelectedCourseId(nextCourses[0]._id);
    }
  }, [selectedCourseId]);

  const loadLessons = useCallback(async (courseId) => {
    if (!courseId) {
      setModules([]);
      return;
    }
    const response = await api.lessons.listCourseLessons(courseId);
    setModules(response?.modules || []);
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      try {
        await loadCourses();
      } catch (error) {
        if (live) toast.error(error?.message || "Failed to load courses");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [loadCourses]);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!selectedCourseId) return;
      try {
        setLoading(true);
        await loadLessons(selectedCourseId);
      } catch (error) {
        if (live) toast.error(error?.message || "Failed to load lessons");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [selectedCourseId, loadLessons]);

  useEffect(() => {
    setEditingModuleId("");
    setActiveModuleId("");
    setModuleForm(emptyModuleForm);
    setContentForm(emptyContentForm);
    setAiItemId("");
    setAiQuestion("");
    setAiResponse("");
    setAiResponseTitle("");
  }, [selectedCourseId]);

  useEffect(() => {
    if (editingModuleId && !editingModule) {
      setEditingModuleId("");
      setModuleForm(emptyModuleForm);
    }

    if (activeModuleId && !activeModule) {
      setActiveModuleId("");
      setContentForm(emptyContentForm);
    }
  }, [activeModule, activeModuleId, editingModule, editingModuleId]);

  const refreshLessons = useCallback(async () => {
    if (!selectedCourseId) return;
    await loadLessons(selectedCourseId);
  }, [selectedCourseId, loadLessons]);

  const buildAiMaterialContext = useCallback(
    (item, module) => {
      const parts = [
        `Course: ${selectedCourse?.title || "Unknown course"}`,
        module?.title ? `Module: ${module.title}` : "",
        item?.title ? `Material title: ${item.title}` : "",
        item?.description ? `Description: ${item.description}` : "",
        item?.contentType ? `Material type: ${item.contentType}` : "",
        item?.textContent ? `Material text: ${compactText(item.textContent)}` : "",
        item?.url ? `Material URL: ${item.url}` : "",
      ].filter(Boolean);
      return compactText(parts.join("\n"), 3000);
    },
    [selectedCourse],
  );

  const runAiMaterialPrompt = useCallback(
    async ({ item, module, prompt, responseTitle }) => {
      if (!item || !module) {
        toast.error("Choose a lesson item first");
        return;
      }

      try {
        setAiLoading(true);
        setAiItemId(item._id);
        const response = await api.ai.generateExplanation({
          question_data: {
            topic: item.title || module.title || selectedCourse?.title || "Lesson",
            question: prompt,
            context: buildAiMaterialContext(item, module),
            type: item.contentType || "lesson_material",
          },
          subject:
            selectedCourse?.subject?.name ||
            selectedCourse?.subjectName ||
            selectedCourse?.title ||
            "General",
          curriculum: selectedCourse?.curriculum || "General",
          grade_level: selectedCourse?.gradeLevel || selectedCourse?.level || "General",
          language: "English",
          style: canEdit ? "teacher-ready" : "student-friendly",
          previous_knowledge: canEdit ? "teacher planning" : "basic understanding",
        });

        const nextReply = aiReplyText(response);
        if (!nextReply) {
          toast.error("The AI helper returned an empty response");
          return;
        }

        setAiResponseTitle(responseTitle);
        setAiResponse(nextReply);
      } catch (error) {
        toast.error(error?.message || "AI help is unavailable right now");
      } finally {
        setAiLoading(false);
      }
    },
    [buildAiMaterialContext, canEdit, selectedCourse],
  );

  const summarizeMaterial = useCallback(
    async (item, module) => {
      await runAiMaterialPrompt({
        item,
        module,
        prompt: canEdit
          ? "Summarize this lesson material for teacher planning, highlight the key learning points, and suggest one teaching emphasis."
          : "Summarize this lesson material into clear study notes with the key ideas and one quick memory tip.",
        responseTitle: canEdit ? "Teacher summary" : "Study summary",
      });
    },
    [canEdit, runAiMaterialPrompt],
  );

  const askAiAboutMaterial = async () => {
    if (!aiSelection.item || !aiSelection.module) {
      toast.error("Choose a lesson item first");
      return;
    }
    if (!aiQuestion.trim()) {
      toast.error("Write a question for the AI helper");
      return;
    }

    await runAiMaterialPrompt({
      item: aiSelection.item,
      module: aiSelection.module,
      prompt: aiQuestion.trim(),
      responseTitle: "AI study help",
    });
  };

  const startEditModule = (module) => {
    setEditingModuleId(module._id);
    setModuleForm({
      title: module.title || "",
      summary: module.summary || "",
      status: module.status || "published",
    });
  };

  const resetModuleForm = () => {
    setEditingModuleId("");
    setModuleForm(emptyModuleForm);
  };

  const saveModule = async () => {
    if (!selectedCourseId) {
      toast.error("Select a course first");
      return;
    }

    if (!moduleForm.title.trim()) {
      toast.error("Module title is required");
      return;
    }

    try {
      setSaving(true);
      if (editingModuleId) {
        await api.lessons.updateModule(editingModuleId, moduleForm);
        toast.success("Module updated");
      } else {
        await api.lessons.createModule(selectedCourseId, moduleForm);
        toast.success("Module created");
      }
      resetModuleForm();
      await refreshLessons();
    } catch (error) {
      toast.error(error?.message || "Failed to save module");
    } finally {
      setSaving(false);
    }
  };

  const createContent = async () => {
    if (!activeModuleId) {
      toast.error("Choose a module first");
      return;
    }

    if (!contentForm.title.trim()) {
      toast.error("Content title is required");
      return;
    }

    if (contentForm.contentType === "document" && !contentForm.document) {
      toast.error("Select a file to upload");
      return;
    }

    if (
      ["link", "video", "embed"].includes(contentForm.contentType) &&
      !isHttpUrl(contentForm.url)
    ) {
      toast.error("Enter a valid http or https URL");
      return;
    }

    if (contentForm.contentType === "text" && !contentForm.textContent.trim()) {
      toast.error("Write the lesson text content");
      return;
    }

    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("title", contentForm.title);
      formData.append("description", contentForm.description);
      formData.append("contentType", contentForm.contentType);
      formData.append("status", contentForm.status);
      if (contentForm.url) formData.append("url", contentForm.url);
      if (contentForm.textContent) {
        formData.append("textContent", contentForm.textContent);
      }
      if (contentForm.document) {
        formData.append("document", contentForm.document);
      }

      await api.lessons.createContent(activeModuleId, formData);
      toast.success("Lesson content added");
      setContentForm(emptyContentForm);
      await refreshLessons();
    } catch (error) {
      toast.error(error?.message || "Failed to add lesson content");
    } finally {
      setSaving(false);
    }
  };

  const deleteModule = async (moduleId) => {
    if (!window.confirm("Delete this module and its content?")) return;
    try {
      setSaving(true);
      await api.lessons.deleteModule(moduleId);
      toast.success("Module deleted");
      if (activeModuleId === moduleId) setActiveModuleId("");
      if (editingModuleId === moduleId) resetModuleForm();
      await refreshLessons();
    } catch (error) {
      toast.error(error?.message || "Failed to delete module");
    } finally {
      setSaving(false);
    }
  };

  const deleteContent = async (contentId) => {
    if (!window.confirm("Delete this lesson item?")) return;
    try {
      setSaving(true);
      await api.lessons.deleteContent(contentId);
      toast.success("Lesson item deleted");
      await refreshLessons();
    } catch (error) {
      toast.error(error?.message || "Failed to delete lesson item");
    } finally {
      setSaving(false);
    }
  };

  const moveModule = async (moduleId, direction) => {
    const index = modules.findIndex((m) => m._id === moduleId);
    if (index < 0) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= modules.length) return;

    const current = modules[index];
    const other = modules[swapIndex];
    const currentPos = current.position ?? index + 1;
    const otherPos = other.position ?? swapIndex + 1;

    try {
      setSaving(true);
      await Promise.all([
        api.lessons.updateModule(current._id, {
          title: current.title,
          summary: current.summary,
          status: current.status,
          position: otherPos,
        }),
        api.lessons.updateModule(other._id, {
          title: other.title,
          summary: other.summary,
          status: other.status,
          position: currentPos,
        }),
      ]);
      await refreshLessons();
    } catch (error) {
      toast.error(error?.message || "Failed to reorder modules");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-3">
        <div>
          <h2>Materials & Modules</h2>
          <p className="text-muted mb-0">
            {canEdit
              ? "Build course modules and deliver lessons through one content path."
              : "Browse the published course materials you can access."}
          </p>
        </div>
        <div style={{ minWidth: 280 }}>
          <label className="form-label">Course</label>
          <select
            className="form-select"
            value={selectedCourseId}
            onChange={(event) => setSelectedCourseId(event.target.value)}
          >
            <option value="">Select a course</option>
            {courses.map((course) => (
              <option key={course._id} value={course._id}>
                {course.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {aiSelection.item ? (
        <div className="dash-card mb-4">
          <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
            <div>
              <h3 className="mb-1">
                AI {canEdit ? "Teaching" : "Study"} Helper
              </h3>
              <p className="text-muted mb-0">
                Working with <strong>{aiSelection.item.title}</strong> in{" "}
                {aiSelection.module?.title || "this module"}.
              </p>
            </div>
            <div className="d-flex gap-2 flex-wrap">
              <button
                className="btn btn-outline-light btn-sm"
                onClick={() =>
                  summarizeMaterial(aiSelection.item, aiSelection.module)
                }
                disabled={aiLoading}
              >
                {aiLoading ? "Working..." : "Summarize"}
              </button>
              <button
                className="btn btn-outline-light btn-sm"
                onClick={() => {
                  setAiItemId("");
                  setAiQuestion("");
                  setAiResponse("");
                  setAiResponseTitle("");
                }}
                disabled={aiLoading}
              >
                Close
              </button>
            </div>
          </div>

          <div className="mt-3">
            <textarea
              className="form-control"
              rows={3}
              value={aiQuestion}
              placeholder={
                canEdit
                  ? "Ask for a teaching angle, quick summary, or class discussion prompt."
                  : "Ask for help understanding this material in simpler words."
              }
              onChange={(event) => setAiQuestion(event.target.value)}
            />
          </div>
          <div className="mt-3 d-flex gap-2 flex-wrap">
            <button
              className="btn btn-primary"
              onClick={askAiAboutMaterial}
              disabled={aiLoading}
            >
              {aiLoading ? "Working..." : "Ask AI"}
            </button>
          </div>

          {aiResponse ? (
            <div className="border rounded p-3 mt-3">
              <div className="d-flex justify-content-between align-items-start gap-2 mb-2 flex-wrap">
                <div>
                  <span
                    className="badge bg-warning text-dark me-2"
                    style={{ fontSize: "0.73em" }}
                  >
                    AI Generated
                  </span>
                  <span className="fw-semibold">
                    {aiResponseTitle || "AI response"}
                  </span>
                </div>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(aiResponse)
                      .then(() => toast.success("Copied to clipboard"))
                      .catch(() => toast.error("Copy failed"))
                  }
                >
                  Copy
                </button>
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{aiResponse}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {canEdit ? (
        <div className="dash-card mb-4">
          <h3 className="mb-3">{editingModuleId ? "Edit module" : "Create module"}</h3>
          <div className="row g-3">
            <div className="col-md-5">
              <input
                className="form-control"
                placeholder="Module title"
                value={moduleForm.title}
                onChange={(event) =>
                  setModuleForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className="col-md-3">
              <select
                className="form-select"
                value={moduleForm.status}
                onChange={(event) =>
                  setModuleForm((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </div>
            <div className="col-md-12">
              <textarea
                className="form-control"
                rows={3}
                placeholder="Module summary"
                value={moduleForm.summary}
                onChange={(event) =>
                  setModuleForm((current) => ({
                    ...current,
                    summary: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="mt-3 d-flex gap-2 flex-wrap">
            <button className="btn btn-primary" onClick={saveModule} disabled={saving}>
              {saving ? "Saving..." : editingModuleId ? "Update module" : "Create module"}
            </button>
            {editingModuleId ? (
              <button
                className="btn btn-outline-light"
                onClick={resetModuleForm}
                disabled={saving}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {canEdit && activeModule ? (
        <div className="dash-card mb-4">
          <h3 className="mb-3">Add content to {activeModule.title}</h3>
          <div className="row g-3">
            <div className="col-md-4">
              <input
                className="form-control"
                placeholder="Content title"
                value={contentForm.title}
                onChange={(event) =>
                  setContentForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </div>
            <div className="col-md-3">
              <select
                className="form-select"
                value={contentForm.contentType}
                onChange={(event) =>
                  setContentForm((current) => ({
                    ...current,
                    contentType: event.target.value,
                    document: null,
                    url: "",
                    textContent: "",
                  }))
                }
              >
                <option value="link">Link</option>
                <option value="video">Video</option>
                <option value="embed">Embed</option>
                <option value="text">Text note</option>
                <option value="document">Upload file</option>
              </select>
            </div>
            <div className="col-md-3">
              <select
                className="form-select"
                value={contentForm.status}
                onChange={(event) =>
                  setContentForm((current) => ({
                    ...current,
                    status: event.target.value,
                  }))
                }
              >
                <option value="published">Published</option>
                <option value="draft">Draft</option>
              </select>
            </div>
            <div className="col-md-12">
              <textarea
                className="form-control"
                rows={2}
                placeholder="Description"
                value={contentForm.description}
                onChange={(event) =>
                  setContentForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </div>

            {["link", "video", "embed"].includes(contentForm.contentType) ? (
              <div className="col-md-12">
                <input
                  className="form-control"
                  placeholder="https://..."
                  value={contentForm.url}
                  onChange={(event) =>
                    setContentForm((current) => ({
                      ...current,
                      url: event.target.value,
                    }))
                  }
                />
              </div>
            ) : null}

            {contentForm.contentType === "text" ? (
              <div className="col-md-12">
                <textarea
                  className="form-control"
                  rows={5}
                  placeholder="Write the lesson note"
                  value={contentForm.textContent}
                  onChange={(event) =>
                    setContentForm((current) => ({
                      ...current,
                      textContent: event.target.value,
                    }))
                  }
                />
              </div>
            ) : null}

            {contentForm.contentType === "document" ? (
              <div className="col-md-12">
                <input
                  className="form-control"
                  type="file"
                  onChange={(event) =>
                    setContentForm((current) => ({
                      ...current,
                      document: event.target.files?.[0] || null,
                    }))
                  }
                />
              </div>
            ) : null}
          </div>
          <div className="mt-3">
            <button className="btn btn-primary" onClick={createContent} disabled={saving}>
              {saving ? "Saving..." : "Add content"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="d-flex flex-column gap-3">
        {loading ? (
          <div className="dash-card">
            <p className="mb-0 text-muted">Loading lesson materials...</p>
          </div>
        ) : !selectedCourseId ? (
          <div className="dash-card">
            <p className="mb-0 text-muted">Select a course to view its modules.</p>
          </div>
        ) : modules.length === 0 ? (
          <div className="dash-card">
            <p className="mb-0 text-muted">
              No modules found for {selectedCourse?.title || "this course"}.
            </p>
          </div>
        ) : (
          modules.map((module) => (
            <div key={module._id} className="dash-card">
              <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                <div>
                  <h3 className="mb-1">{module.title}</h3>
                  <p className="text-muted mb-2">{module.summary || "No summary yet."}</p>
                  <span className="badge bg-secondary text-uppercase">
                    {module.status}
                  </span>
                </div>
                {canEdit ? (
                  <div className="d-flex gap-2 flex-wrap">
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      title="Move up"
                      onClick={() => moveModule(module._id, "up")}
                      disabled={saving || modules.indexOf(module) === 0}
                    >
                      ▲
                    </button>
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      title="Move down"
                      onClick={() => moveModule(module._id, "down")}
                      disabled={saving || modules.indexOf(module) === modules.length - 1}
                    >
                      ▼
                    </button>
                    <button
                      className="btn btn-outline-light btn-sm"
                      onClick={() => setActiveModuleId(module._id)}
                    >
                      Add content
                    </button>
                    <button
                      className="btn btn-outline-light btn-sm"
                      onClick={() => startEditModule(module)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-outline-danger btn-sm"
                      onClick={() => deleteModule(module._id)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 d-flex flex-column gap-2">
                {(module.items || []).map((item) => (
                  <div
                    key={item._id}
                    className="border rounded p-3 d-flex justify-content-between gap-3 flex-wrap"
                  >
                    <div>
                      <div className="fw-semibold">{item.title}</div>
                      <div className="text-muted small text-uppercase">
                        {item.contentType}
                      </div>
                      {item.description ? (
                        <div className="small mt-1">{item.description}</div>
                      ) : null}
                      {item.contentType === "text" && item.textContent ? (
                        <div className="small mt-2">{item.textContent}</div>
                      ) : null}
                    </div>
                    <div className="d-flex gap-2 flex-wrap align-items-start">
                      <button
                        className="btn btn-outline-light btn-sm"
                        onClick={() => {
                          setAiItemId(item._id);
                          setAiResponse("");
                          setAiResponseTitle("");
                          setAiQuestion("");
                        }}
                      >
                        AI helper
                      </button>
                      <button
                        className="btn btn-outline-light btn-sm"
                        onClick={() => summarizeMaterial(item, module)}
                        disabled={aiLoading}
                      >
                        AI summary
                      </button>
                      {item.contentType === "document" && item.downloadUrl ? (
                        <>
                          {item.previewUrl ? (
                            <button
                              className="btn btn-outline-light btn-sm"
                              onClick={() =>
                                window.open(
                                  `${API_BASE_URL}${item.previewUrl}`,
                                  "_blank",
                                  "noopener",
                                )
                              }
                            >
                              Preview
                            </button>
                          ) : null}
                          <button
                            className="btn btn-outline-light btn-sm"
                            onClick={() =>
                              window.open(
                                `${API_BASE_URL}${item.downloadUrl}`,
                                "_blank",
                                "noopener",
                              )
                            }
                          >
                            Download
                          </button>
                        </>
                      ) : null}
                      {["link", "video", "embed"].includes(item.contentType) && item.url ? (
                        <button
                          className="btn btn-outline-light btn-sm"
                          onClick={() => window.open(item.url, "_blank", "noopener")}
                        >
                          Open
                        </button>
                      ) : null}
                      {canEdit ? (
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => deleteContent(item._id)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}

                {!module.items?.length ? (
                  <div className="text-muted small">No lesson items yet.</div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
