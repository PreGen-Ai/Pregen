import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  FaClipboardCheck,
  FaClipboardList,
  FaMagic,
  FaUpload,
} from "react-icons/fa";
import api from "../../../services/api/api";
import { useAuthContext } from "../../../context/AuthContext";
import "../../styles/dashboard.css";

const ASSIGNMENT_TYPES = [
  { value: "text_submission", label: "Text submission" },
  { value: "file_upload", label: "File upload" },
  { value: "mixed", label: "Mixed" },
];

const STATUS_OPTIONS = ["draft", "published", "closed"];

function formatDate(value, fallback = "No due date") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString();
}

function badgeClass(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "graded" || normalized === "submitted") return "bg-success";
  if (normalized === "draft") return "bg-warning text-dark";
  if (normalized === "closed" || normalized === "missing") return "bg-secondary";
  if (normalized === "published") return "bg-primary";
  return "bg-secondary";
}

function emptyToNull(value) {
  return String(value || "").trim() || null;
}

function normalizeRole(role) {
  const upper = String(role || "").trim().toUpperCase();
  return upper === "SUPER_ADMIN" ? "SUPERADMIN" : upper;
}

function asCourseItems(value) {
  if (Array.isArray(value?.courses)) return value.courses;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value)) return value;
  return [];
}

function nameForUser(user) {
  return (
    user?.name ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    user?.email ||
    "Unknown user"
  );
}

function SummaryCard({ title, value, subtitle }) {
  return (
    <div className="dash-card h-100">
      <div className="dash-card-title">{title}</div>
      <div style={{ fontSize: 28, fontWeight: 900 }}>{value}</div>
      {subtitle ? <p className="dash-card-muted mb-0">{subtitle}</p> : null}
    </div>
  );
}

function StudentAssignmentsView() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [gradebook, setGradebook] = useState({ items: [], summary: null });
  const [recentLessons, setRecentLessons] = useState([]);
  const [submissionState, setSubmissionState] = useState({});
  const [activeId, setActiveId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [
        assignmentsRes,
        quizzesRes,
        announcementsRes,
        gradebookRes,
        coursesRes,
      ] =
        await Promise.all([
          api.students.listAssignments(),
          api.students.listQuizzes(),
          api.announcements.list(),
          api.gradebook.list(),
          api.courses.getAllCourses({ limit: 20 }),
        ]);

      setItems(assignmentsRes?.data || []);
      setQuizzes(quizzesRes?.data || []);
      setAnnouncements(announcementsRes?.items || announcementsRes || []);
      setGradebook({
        items: gradebookRes?.items || [],
        summary: gradebookRes?.summary || null,
      });

      const courseItems = asCourseItems(coursesRes).slice(0, 4);
      const lessonResponses = await Promise.allSettled(
        courseItems.map((course) => api.lessons.listCourseLessons(course._id)),
      );

      const nextLessons = lessonResponses
        .flatMap((result, index) => {
          if (result.status !== "fulfilled") return [];
          const course = courseItems[index];
          const modules = Array.isArray(result.value?.modules)
            ? result.value.modules
            : [];

          return modules.flatMap((module) =>
            (module.items || [])
              .filter(
                (item) => String(item?.status || "published") !== "draft",
              )
              .map((item) => ({
                _id: item._id,
                title: item.title || "Lesson item",
                courseTitle: course?.title || "Course",
                moduleTitle: module?.title || "Module",
                updatedAt:
                  item.updatedAt ||
                  item.createdAt ||
                  module.updatedAt ||
                  module.createdAt ||
                  course?.updatedAt ||
                  course?.createdAt ||
                  "",
              })),
          );
        })
        .sort(
          (a, b) =>
            new Date(b.updatedAt || 0).getTime() -
            new Date(a.updatedAt || 0).getTime(),
        )
        .slice(0, 4);

      setRecentLessons(nextLessons);
    } catch (error) {
      toast.error(error?.message || "Failed to load assignments");
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const submitted = items.filter((item) => item?.submission).length;
    const upcoming = items.filter((item) => !item?.submission).length;
    const gradedItems = gradebook.items.filter(
      (item) => item?.score !== null && item?.score !== undefined,
    );
    const avgGrade = gradedItems.length
      ? Math.round(
          gradedItems.reduce((sum, item) => sum + Number(item.score || 0), 0) /
            gradedItems.length,
        )
      : 0;

    return {
      assignments: items.length,
      submitted,
      upcoming,
      quizzes: quizzes.length,
      announcements: announcements.length,
      avgGrade,
    };
  }, [announcements.length, gradebook.items, items, quizzes.length]);

  const updateSubmissionField = (assignmentId, key, value) => {
    setSubmissionState((prev) => ({
      ...prev,
      [assignmentId]: {
        ...(prev[assignmentId] || {}),
        [key]: value,
      },
    }));
  };

  const submitAssignment = async (assignment) => {
    const state = submissionState[assignment._id] || {};
    const hasText = String(state.textSubmission || "").trim();
    const files = state.files || [];

    if (!hasText && !files.length) {
      toast.error("Add text or upload a file before submitting");
      return;
    }

    const formData = new FormData();
    formData.append("assignmentId", assignment._id);
    if (hasText) {
      formData.append("textSubmission", hasText);
    }
    for (const file of files) {
      formData.append("files", file);
    }

    try {
      await api.students.submitAssignment(formData);
      toast.success("Assignment submitted");
      setActiveId(null);
      setSubmissionState((prev) => ({
        ...prev,
        [assignment._id]: { textSubmission: "", files: [] },
      }));
      await load();
    } catch (error) {
      toast.error(error?.message || "Failed to submit assignment");
    }
  };

  const gradeItems = gradebook.items.slice(0, 4);
  const recentAnnouncements = announcements.slice(0, 4);

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-3">
        <div>
          <h2>Assignments</h2>
          <p className="text-muted mb-0">
            View upcoming work, submit assignments, and keep an eye on quizzes and grades.
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Link className="btn btn-outline-light" to="/dashboard/materials">
            Open Materials
          </Link>
          <Link className="btn btn-outline-light" to="/dashboard/quizzes">
            Open Quizzes
          </Link>
          <Link className="btn btn-outline-light" to="/dashboard/grades">
            Open Grades
          </Link>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-4 col-xl-2">
          <SummaryCard title="Assignments" value={summary.assignments} />
        </div>
        <div className="col-md-4 col-xl-2">
          <SummaryCard title="Submitted" value={summary.submitted} />
        </div>
        <div className="col-md-4 col-xl-2">
          <SummaryCard title="Pending" value={summary.upcoming} />
        </div>
        <div className="col-md-4 col-xl-2">
          <SummaryCard title="Quizzes" value={summary.quizzes} />
        </div>
        <div className="col-md-4 col-xl-2">
          <SummaryCard title="Announcements" value={summary.announcements} />
        </div>
        <div className="col-md-4 col-xl-2">
          <SummaryCard title="Avg grade" value={`${summary.avgGrade}%`} />
        </div>
      </div>

      {loading ? (
        <div className="dash-card">
          <p className="dash-card-muted mb-0">Loading assignments...</p>
        </div>
      ) : (
        <div className="row g-4">
          <div className="col-lg-8 d-flex flex-column gap-3">
            {items.length ? (
              items.map((assignment) => {
                const state = submissionState[assignment._id] || {
                  textSubmission: "",
                  files: [],
                };
                const submission = assignment?.submission || null;
                const gradeRow = gradebook.items.find(
                  (item) =>
                    item?.kind === "assignment" &&
                    (item?.assignmentId === assignment._id ||
                      item?.sourceId === assignment._id),
                );
                const showForm = activeId === assignment._id && !submission;

                return (
                  <div key={assignment._id} className="dash-card">
                    <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                      <div>
                        <h3 className="dash-card-title mb-1">
                          {assignment.title || "Untitled assignment"}
                        </h3>
                        <p className="dash-card-muted mb-2">
                          Due {formatDate(assignment.dueDate)}
                        </p>
                        <div className="d-flex gap-2 flex-wrap">
                          <span
                            className={`badge ${badgeClass(
                              submission ? "submitted" : assignment.status,
                            )}`}
                          >
                            {submission
                              ? "submitted"
                              : assignment.status || "published"}
                          </span>
                          <span className="badge bg-secondary">
                            {assignment.type || "text_submission"}
                          </span>
                          {gradeRow?.score !== null && gradeRow?.score !== undefined ? (
                            <span className="badge bg-info text-dark">
                              Score {Number(gradeRow.score).toFixed(0)}%
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="d-flex gap-2 flex-wrap">
                        {submission ? (
                          <span className="badge bg-success">
                            Submitted {formatDate(submission.submittedAt, "")}
                          </span>
                        ) : (
                          <button
                            className="btn btn-primary btn-sm"
                            type="button"
                            onClick={() =>
                              setActiveId((current) =>
                                current === assignment._id ? null : assignment._id,
                              )
                            }
                          >
                            <FaUpload className="me-2" />
                            Submit
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="mt-3 mb-2">{assignment.description}</p>
                    {assignment.instructions ? (
                      <div className="small text-muted mb-3">
                        <b>Instructions:</b> {assignment.instructions}
                      </div>
                    ) : null}

                    {submission ? (
                      <div className="border rounded p-3 bg-light-subtle">
                        <div className="small text-muted">
                          <b>Submitted:</b> {formatDate(submission.submittedAt, "")}
                        </div>
                        {submission.textSubmission ? (
                          <div className="mt-2">
                            <b>Your response:</b>
                            <p className="mb-0 mt-1">{submission.textSubmission}</p>
                          </div>
                        ) : null}
                        {gradeRow?.feedback ? (
                          <div className="mt-3">
                            <b>Teacher feedback:</b>
                            <p className="mb-0 mt-1">{gradeRow.feedback}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {showForm ? (
                      <div className="border rounded p-3 bg-light-subtle mt-3">
                        <div className="mb-3">
                          <label className="form-label">Text submission</label>
                          <textarea
                            className="form-control"
                            rows={4}
                            value={state.textSubmission || ""}
                            onChange={(event) =>
                              updateSubmissionField(
                                assignment._id,
                                "textSubmission",
                                event.target.value,
                              )
                            }
                          />
                        </div>

                        <div className="mb-3">
                          <label className="form-label">Upload files</label>
                          <input
                            className="form-control"
                            type="file"
                            multiple
                            onChange={(event) =>
                              updateSubmissionField(
                                assignment._id,
                                "files",
                                Array.from(event.target.files || []),
                              )
                            }
                          />
                        </div>

                        <div className="d-flex gap-2 flex-wrap">
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() => submitAssignment(assignment)}
                          >
                            Submit assignment
                          </button>
                          <button
                            className="btn btn-outline-secondary"
                            type="button"
                            onClick={() => setActiveId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="dash-card">
                <p className="dash-card-muted mb-0">No assignments available yet.</p>
              </div>
            )}
          </div>

          <div className="col-lg-4 d-flex flex-column gap-3">
            <div className="dash-card">
              <h3 className="dash-card-title mb-3">Upcoming quizzes</h3>
              {quizzes.length ? (
                <div className="d-flex flex-column gap-3">
                  {quizzes.slice(0, 4).map((quiz) => (
                    <div key={quiz._id} className="border rounded p-3 bg-light-subtle">
                      <div className="fw-semibold">{quiz.title}</div>
                      <div className="small text-muted">
                        Due {formatDate(quiz.dueDate || quiz.availableUntil)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dash-card-muted mb-0">No quizzes assigned right now.</p>
              )}
            </div>

            <div className="dash-card">
              <h3 className="dash-card-title mb-3">Latest announcements</h3>
              {recentAnnouncements.length ? (
                <div className="d-flex flex-column gap-3">
                  {recentAnnouncements.map((announcement) => (
                    <div
                      key={announcement._id}
                      className="border rounded p-3 bg-light-subtle"
                    >
                      <div className="fw-semibold">
                        {announcement.title || "Announcement"}
                      </div>
                      <div className="small text-muted">
                        {formatDate(announcement.publishedAt || announcement.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dash-card-muted mb-0">No announcements yet.</p>
              )}
            </div>

            <div className="dash-card">
              <h3 className="dash-card-title mb-3">Recent lessons</h3>
              {recentLessons.length ? (
                <div className="d-flex flex-column gap-3">
                  {recentLessons.map((item) => (
                    <div key={item._id} className="border rounded p-3 bg-light-subtle">
                      <div className="fw-semibold">{item.title}</div>
                      <div className="small text-muted">
                        {item.courseTitle} • {item.moduleTitle}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dash-card-muted mb-0">
                  Recent materials will appear here as lessons are published.
                </p>
              )}
            </div>

            <div className="dash-card">
              <h3 className="dash-card-title mb-3">Recent grades</h3>
              {gradeItems.length ? (
                <div className="d-flex flex-column gap-3">
                  {gradeItems.map((item) => (
                    <div key={item.sourceId || item._id} className="border rounded p-3 bg-light-subtle">
                      <div className="fw-semibold">{item.title || "Graded work"}</div>
                      <div className="small text-muted">
                        {item.score !== null && item.score !== undefined
                          ? `${Number(item.score).toFixed(0)}%`
                          : "Awaiting grade"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dash-card-muted mb-0">Grades will appear here once work is reviewed.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TeacherAssignmentsView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [roster, setRoster] = useState({ students: [], classrooms: [] });
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
  const [review, setReview] = useState(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState({});

  const [form, setForm] = useState({
    title: "",
    description: "",
    instructions: "",
    dueDate: "",
    type: "text_submission",
    maxScore: 100,
    status: "draft",
    classroomId: "",
    studentIds: [],
  });

  const loadAssignments = async (courseId) => {
    const assignmentsRes = await api.teachers.listAssignments(
      courseId ? { courseId } : undefined,
    );
    setAssignments(assignmentsRes?.data || []);
  };

  const load = async (courseId = selectedCourseId) => {
    setLoading(true);
    try {
      const coursesRes = await api.courses.getAllCourses();
      const nextCourses = Array.isArray(coursesRes)
        ? coursesRes
        : coursesRes?.items || [];
      setCourses(nextCourses);

      const effectiveCourseId = courseId || nextCourses[0]?._id || "";
      if (effectiveCourseId && effectiveCourseId !== selectedCourseId) {
        setSelectedCourseId(effectiveCourseId);
      }
      await loadAssignments(effectiveCourseId);
    } catch (error) {
      toast.error(error?.message || "Failed to load teacher assignments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCourseId) {
      setRoster({ students: [], classrooms: [] });
      return;
    }

    let live = true;
    (async () => {
      try {
        const [rosterRes] = await Promise.all([
          api.teachers.getCourseRoster(selectedCourseId),
          loadAssignments(selectedCourseId),
        ]);
        if (!live) return;
        setRoster({
          students: rosterRes?.students || [],
          classrooms: rosterRes?.classrooms || [],
        });
        setForm((prev) => ({
          ...prev,
          classroomId:
            prev.classroomId || rosterRes?.course?.classroomId || "",
        }));
      } catch (error) {
        if (!live) return;
        toast.error(error?.message || "Failed to load course roster");
      }
    })();

    return () => {
      live = false;
    };
  }, [selectedCourseId]);

  const summary = useMemo(() => {
    const published = assignments.filter((item) => item.status === "published").length;
    const draft = assignments.filter((item) => item.status === "draft").length;
    const submitted = assignments.reduce(
      (sum, item) => sum + Number(item?.counts?.submitted || 0),
      0,
    );

    return {
      total: assignments.length,
      published,
      draft,
      submitted,
    };
  }, [assignments]);

  const resetForm = () => {
    setSelectedAssignmentId(null);
    setForm({
      title: "",
      description: "",
      instructions: "",
      dueDate: "",
      type: "text_submission",
      maxScore: 100,
      status: "draft",
      classroomId: roster.classrooms[0]?._id || "",
      studentIds: [],
    });
  };

  const populateForm = (assignment) => {
    setSelectedAssignmentId(assignment._id);
    setSelectedCourseId(assignment.courseId || selectedCourseId);
    setForm({
      title: assignment.title || "",
      description: assignment.description || "",
      instructions: assignment.instructions || "",
      dueDate: assignment.dueDate
        ? new Date(assignment.dueDate).toISOString().slice(0, 16)
        : "",
      type: assignment.type || "text_submission",
      maxScore: assignment.maxScore || 100,
      status: assignment.status || "draft",
      classroomId: assignment.classroomId || "",
      studentIds: assignment.selectedStudentIds || [],
    });
  };

  const saveAssignment = async () => {
    if (!selectedCourseId) return toast.error("Select a course first");
    if (!form.title.trim() || !form.description.trim() || !form.dueDate) {
      return toast.error("Title, description, and due date are required");
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      instructions: form.instructions.trim(),
      dueDate: new Date(form.dueDate).toISOString(),
      type: form.type,
      maxScore: Number(form.maxScore || 100),
      status: form.status,
      courseId: selectedCourseId,
      classroomId: emptyToNull(form.classroomId),
      studentIds: form.studentIds,
    };

    try {
      setSaving(true);
      if (selectedAssignmentId) {
        await api.teachers.updateAssignment(selectedAssignmentId, payload);
        toast.success("Assignment updated");
      } else {
        await api.teachers.createAssignment(payload);
        toast.success("Assignment created");
      }
      resetForm();
      await load(selectedCourseId);
    } catch (error) {
      toast.error(error?.message || "Failed to save assignment");
    } finally {
      setSaving(false);
    }
  };

  const loadReview = async (assignmentId) => {
    try {
      const data = await api.teachers.getAssignmentSubmissions(assignmentId);
      setReview(data);
    } catch (error) {
      toast.error(error?.message || "Failed to load submissions");
    }
  };

  const draftFeedback = async (submission) => {
    const prompt = submission?.textSubmission || submission?.answers || "";
    if (!prompt) {
      toast.error("This submission does not contain text to summarize");
      return;
    }

    try {
      const response = await api.ai.generateExplanation({
        question_data: {
          question: review?.assignment?.title || "Assignment feedback draft",
          context:
            review?.assignment?.instructions ||
            review?.assignment?.description ||
            "",
          type: "essay",
        },
        student_answer:
          typeof prompt === "string" ? prompt : JSON.stringify(prompt, null, 2),
        subject: "assignment_feedback",
        style: "teacher_feedback",
      });

      const explanation =
        response?.explanation ||
        response?.data?.explanation ||
        response?.summary ||
        "No feedback draft returned.";

      setFeedbackDrafts((prev) => ({ ...prev, [submission._id]: explanation }));
      toast.success("AI draft ready");
    } catch (error) {
      toast.error(error?.message || "Failed to draft AI feedback");
    }
  };

  const generateDraft = async () => {
    if (!form.title.trim()) return toast.error("Enter a title or topic first");

    try {
      const response = await api.ai.generateAssignment({
        topic: form.title.trim(),
        subject: "General",
        grade_level: "All",
        num_questions: 3,
        question_type: "mixed",
        difficulty: "medium",
        assignment_type: "homework",
        curriculum: "General",
        exam_focus: "practice",
      });

      const generated = response?.assignment || response?.data || response || {};
      const instructions =
        generated?.instructions ||
        generated?.assignment_text ||
        generated?.description ||
        "";

      setForm((prev) => ({
        ...prev,
        description:
          generated?.topic || generated?.title
            ? `AI draft for ${generated.topic || generated.title}`
            : prev.description,
        instructions: instructions || prev.instructions,
      }));
      toast.success("AI draft applied to assignment form");
    } catch (error) {
      toast.error(error?.message || "Failed to generate AI draft");
    }
  };

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-3">
        <div>
          <h2>Assignments</h2>
          <p className="text-muted mb-0">
            Create, publish, review, and track assignment submissions on the repaired contract.
          </p>
        </div>
        <Link className="btn btn-outline-light" to="/dashboard/grades">
          Open Gradebook
        </Link>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <SummaryCard title="Total" value={summary.total} />
        </div>
        <div className="col-md-3">
          <SummaryCard title="Published" value={summary.published} />
        </div>
        <div className="col-md-3">
          <SummaryCard title="Drafts" value={summary.draft} />
        </div>
        <div className="col-md-3">
          <SummaryCard title="Submitted work" value={summary.submitted} />
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="dash-card">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3 className="dash-card-title mb-0">
                <FaClipboardList className="me-2" />
                {selectedAssignmentId ? "Edit assignment" : "Create assignment"}
              </h3>
              <button className="btn btn-outline-secondary btn-sm" type="button" onClick={resetForm}>
                Reset
              </button>
            </div>

            <div className="mb-3">
              <label className="form-label">Course</label>
              <select
                className="form-select"
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
              >
                <option value="">Select course</option>
                {courses.map((course) => (
                  <option key={course._id} value={course._id}>
                    {course.title || course.name || course.code || course._id}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label">Title</label>
              <input
                className="form-control"
                value={form.title}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, title: event.target.value }))
                }
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Description</label>
              <textarea
                className="form-control"
                rows={3}
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </div>

            <div className="mb-3">
              <label className="form-label">Instructions</label>
              <textarea
                className="form-control"
                rows={3}
                value={form.instructions}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, instructions: event.target.value }))
                }
              />
            </div>

            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Due date</label>
                <input
                  className="form-control"
                  type="datetime-local"
                  value={form.dueDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, dueDate: event.target.value }))
                  }
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  value={form.status}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, status: event.target.value }))
                  }
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Type</label>
                <select
                  className="form-select"
                  value={form.type}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, type: event.target.value }))
                  }
                >
                  {ASSIGNMENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Max score</label>
                <input
                  className="form-control"
                  type="number"
                  min="0"
                  value={form.maxScore}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, maxScore: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="form-label">Classroom target</label>
              <select
                className="form-select"
                value={form.classroomId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, classroomId: event.target.value }))
                }
              >
                <option value="">Course-wide or selected students</option>
                {roster.classrooms.map((classroom) => (
                  <option key={classroom._id} value={classroom._id}>
                    {classroom.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3">
              <label className="form-label">Selected students</label>
              <select
                className="form-select"
                multiple
                size={6}
                value={form.studentIds}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    studentIds: Array.from(
                      event.target.selectedOptions,
                      (option) => option.value,
                    ),
                  }))
                }
              >
                {roster.students.map((student) => (
                  <option key={student._id} value={student._id}>
                    {nameForUser(student)} • {student.email}
                  </option>
                ))}
              </select>
              <div className="form-text">
                Leave student selection empty to assign course-wide or by classroom.
              </div>
            </div>

            <div className="d-flex gap-2 flex-wrap mt-4">
              <button className="btn btn-primary" type="button" onClick={saveAssignment} disabled={saving}>
                {saving
                  ? "Saving..."
                  : selectedAssignmentId
                    ? "Update assignment"
                    : "Create assignment"}
              </button>
              <button className="btn btn-outline-light" type="button" onClick={generateDraft}>
                <FaMagic className="me-2" />
                Draft with AI
              </button>
            </div>
          </div>
        </div>

        <div className="col-lg-7 d-flex flex-column gap-3">
          <div className="dash-card">
            <h3 className="dash-card-title mb-3">
              <FaClipboardCheck className="me-2" />
              Your assignments
            </h3>

            {loading ? (
              <p className="dash-card-muted mb-0">Loading assignments...</p>
            ) : assignments.length ? (
              <div className="d-flex flex-column gap-3">
                {assignments.map((assignment) => (
                  <div key={assignment._id} className="border rounded p-3 bg-light-subtle">
                    <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                      <div>
                        <div className="fw-semibold">{assignment.title}</div>
                        <div className="text-muted small">
                          Due {formatDate(assignment.dueDate)} • {assignment.status}
                        </div>
                      </div>
                      <div className="d-flex gap-2 flex-wrap">
                        <span className="badge bg-secondary">
                          targeted {assignment?.counts?.targetedStudents || 0}
                        </span>
                        <span className="badge bg-secondary">
                          submitted {assignment?.counts?.submitted || 0}
                        </span>
                        <span className="badge bg-secondary">
                          missing {assignment?.counts?.missing || 0}
                        </span>
                      </div>
                    </div>

                    <div className="d-flex gap-2 flex-wrap mt-3">
                      <button
                        className="btn btn-outline-light btn-sm"
                        type="button"
                        onClick={() => populateForm(assignment)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        onClick={() => loadReview(assignment._id)}
                      >
                        Review submissions
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="dash-card-muted mb-0">No assignments created yet.</p>
            )}
          </div>

          {review ? (
            <div className="dash-card">
              <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                <h3 className="dash-card-title mb-0">
                  Submission review: {review?.assignment?.title || "Assignment"}
                </h3>
                <Link className="btn btn-outline-light btn-sm" to="/dashboard/grades">
                  Gradebook
                </Link>
              </div>

              <div className="d-flex gap-2 flex-wrap mb-3">
                <span className="badge bg-secondary">
                  Submitted {review?.summary?.submitted || 0}
                </span>
                <span className="badge bg-secondary">
                  Missing {review?.summary?.missing || 0}
                </span>
                <span className="badge bg-secondary">
                  Graded {review?.summary?.graded || 0}
                </span>
              </div>

              <div className="d-flex flex-column gap-3">
                {(review?.submissions || []).map((submission) => (
                  <div key={submission._id} className="border rounded p-3 bg-light-subtle">
                    <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                      <div>
                        <div className="fw-semibold">
                          {nameForUser(submission.student)}
                        </div>
                        <div className="small text-muted">
                          Submitted {formatDate(submission.submittedAt, "")}
                        </div>
                      </div>
                      <span className={`badge ${badgeClass(submission.gradingStatus)}`}>
                        {submission.gradingStatus || "submitted"}
                      </span>
                    </div>

                    {submission.textSubmission ? (
                      <div className="mt-3">
                        <b>Response</b>
                        <p className="mb-0 mt-1">{submission.textSubmission}</p>
                      </div>
                    ) : null}

                    <div className="d-flex gap-2 flex-wrap mt-3">
                      <button
                        className="btn btn-outline-light btn-sm"
                        type="button"
                        onClick={() => draftFeedback(submission)}
                      >
                        <FaMagic className="me-2" />
                        Draft feedback
                      </button>
                    </div>

                    {feedbackDrafts[submission._id] ? (
                      <div className="mt-3 p-3 border rounded bg-white">
                        <b>AI draft</b>
                        <p className="mb-0 mt-2">{feedbackDrafts[submission._id]}</p>
                      </div>
                    ) : null}
                  </div>
                ))}

                {!(review?.submissions || []).length ? (
                  <p className="dash-card-muted mb-0">No submissions yet.</p>
                ) : null}
              </div>

              {review?.missingStudents?.length ? (
                <div className="mt-4">
                  <h4 className="h6">Missing students</h4>
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {review.missingStudents.map((student) => (
                      <span key={student._id} className="badge bg-secondary">
                        {nameForUser(student)}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function AssignmentsPage() {
  const { user } = useAuthContext();
  const role = normalizeRole(user?.role);

  if (role === "TEACHER") return <TeacherAssignmentsView />;
  if (role === "STUDENT") return <StudentAssignmentsView />;

  return (
    <div className="quizzes-page">
      <div className="dash-card">
        <h2>Assignments</h2>
        <p className="text-muted mb-0">You do not have access to this page.</p>
      </div>
    </div>
  );
}
