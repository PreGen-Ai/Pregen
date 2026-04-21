import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import {
  FaClipboardCheck,
  FaClipboardList,
  FaMagic,
  FaUpload,
} from "react-icons/fa";
import api from "../../../services/api/api";
import useRealtimeRefresh from "../../../hooks/useRealtimeRefresh";
import { withRequestId } from "../../../utils/requestId";
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

function formatPercent(value, fallback = "Not graded") {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(0)}%` : fallback;
}

function hasPastDue(value) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function countPendingReview(counts) {
  const submitted = Number(counts?.submitted || 0);
  const graded = Number(counts?.graded || 0);
  return Math.max(submitted - graded, 0);
}

function targetScopeLabel(item) {
  const selectedCount = Array.isArray(item?.selectedStudentIds)
    ? item.selectedStudentIds.length
    : 0;

  if (selectedCount) {
    return `${selectedCount} selected student${selectedCount === 1 ? "" : "s"}`;
  }

  if (item?.class?.name) {
    return `Classroom: ${item.class.name}`;
  }

  return "Course-wide";
}

function assignmentStudentState({ assignment, submission, gradeRow }) {
  if (gradeRow?.score !== null && gradeRow?.score !== undefined) {
    return { label: "Graded", badge: "bg-info text-dark" };
  }

  if (submission) {
    return { label: "Awaiting grade", badge: "bg-warning text-dark" };
  }

  if (hasPastDue(assignment?.dueDate)) {
    return { label: "Overdue", badge: "bg-danger" };
  }

  return { label: "Upcoming", badge: "bg-primary" };
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

  useRealtimeRefresh(load, {
    shouldRefresh: (event) =>
      [
        "submission",
        "teacher_review",
        "grade",
        "assignment_publish",
        "quiz_publish",
      ].includes(String(event?.type || "")),
  });

  const summary = useMemo(() => {
    const submitted = items.filter((item) => item?.submission).length;
    const overdue = items.filter(
      (item) => !item?.submission && hasPastDue(item?.dueDate),
    ).length;
    const awaitingGrade = items.filter((item) => {
      if (!item?.submission) return false;
      return !gradebook.items.find(
        (gradeItem) =>
          gradeItem?.kind === "assignment" &&
          (gradeItem?.assignmentId === item._id ||
            gradeItem?.sourceId === item._id) &&
          gradeItem?.score !== null &&
          gradeItem?.score !== undefined,
      );
    }).length;
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
      overdue,
      awaitingGrade,
      quizzes: quizzes.length,
      avgGrade,
    };
  }, [gradebook.items, items, quizzes.length]);

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
      const { config } = withRequestId({}, "assignment-submit");
      await api.students.submitAssignment(formData, config);
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
  const upcomingWork = useMemo(() => {
    const assignmentRows = items
      .filter((item) => !item?.submission)
      .map((item) => ({
        _id: `assignment-${item._id}`,
        kind: "Assignment",
        title: item.title || "Untitled assignment",
        dueDate: item.dueDate || null,
        status: hasPastDue(item?.dueDate) ? "Overdue" : "Upcoming",
      }));

    const quizRows = quizzes
      .filter((item) => {
        const attemptStatus = String(item?.attempt?.status || "").toLowerCase();
        return !["submitted", "graded"].includes(attemptStatus);
      })
      .map((item) => ({
        _id: `quiz-${item._id}`,
        kind: "Quiz",
        title: item.title || "Untitled quiz",
        dueDate: item.dueDate || item.availableUntil || null,
        status: String(item?.attempt?.status || "").toLowerCase() === "inprogress"
          ? "In progress"
          : "Upcoming",
      }));

    return [...assignmentRows, ...quizRows]
      .sort((a, b) => {
        const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      })
      .slice(0, 5);
  }, [items, quizzes]);

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
          <SummaryCard title="Awaiting grade" value={summary.awaitingGrade} />
        </div>
        <div className="col-md-4 col-xl-2">
          <SummaryCard title="Overdue" value={summary.overdue} />
        </div>
        <div className="col-md-4 col-xl-2">
          <SummaryCard title="Quizzes" value={summary.quizzes} />
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
                const studentState = assignmentStudentState({
                  assignment,
                  submission,
                  gradeRow,
                });

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
                          <span className={`badge ${studentState.badge}`}>
                            {studentState.label}
                          </span>
                          {gradeRow?.score !== null && gradeRow?.score !== undefined ? (
                            <span className="badge bg-info text-dark">
                              Score {formatPercent(gradeRow.score, "Not graded")}
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
                        <div className="d-flex gap-2 flex-wrap small text-muted">
                          <span>
                            <b>Submitted:</b> {formatDate(submission.submittedAt, "")}
                          </span>
                          <span>
                            <b>Status:</b> {studentState.label}
                          </span>
                          {Array.isArray(submission.files) && submission.files.length ? (
                            <span>
                              <b>Files:</b> {submission.files.length}
                            </span>
                          ) : null}
                        </div>
                        {submission.textSubmission ? (
                          <div className="mt-2">
                            <b>Your response:</b>
                            <p className="mb-0 mt-1">{submission.textSubmission}</p>
                          </div>
                        ) : null}
                        {gradeRow?.score !== null && gradeRow?.score !== undefined ? (
                          <div className="mt-3">
                            <b>Score:</b> {formatPercent(gradeRow.score, "Not graded")}
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
              <h3 className="dash-card-title mb-3">Upcoming work</h3>
              {upcomingWork.length ? (
                <div className="d-flex flex-column gap-3">
                  {upcomingWork.map((item) => (
                    <div key={item._id} className="border rounded p-3 bg-light-subtle">
                      <div className="fw-semibold">
                        {item.title}
                        <span className="badge bg-secondary ms-2">{item.kind}</span>
                      </div>
                      <div className="small text-muted">
                        {item.status} • Due {formatDate(item.dueDate)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dash-card-muted mb-0">
                  You are caught up on current assignments and quizzes.
                </p>
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

  const [aiConfig, setAiConfig] = useState({
    topic: "",
    subject: "Mathematics",
    gradeLevel: "High School",
    curriculum: "General",
    assignmentType: "homework",
    questionType: "mixed",
    difficulty: "medium",
    numQuestions: 5,
  });
  const [generating, setGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(null); // holds generated assignment data
  const [assignMode, setAssignMode] = useState("course"); // "course" | "class" | "students"
  const [warming, setWarming] = useState(false);
  const [warmingCountdown, setWarmingCountdown] = useState(0);
  const warmingTimerRef = useRef(null);

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
      // API may return { courses: [] }, { items: [] }, or a plain array
      const nextCourses = Array.isArray(coursesRes)
        ? coursesRes
        : coursesRes?.courses || coursesRes?.items || [];
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
    const missing = assignments.reduce(
      (sum, item) => sum + Number(item?.counts?.missing || 0),
      0,
    );
    const pendingReview = assignments.reduce(
      (sum, item) => sum + countPendingReview(item?.counts),
      0,
    );

    return {
      total: assignments.length,
      published,
      draft,
      submitted,
      missing,
      pendingReview,
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

  const saveAssignment = async (nextStatus = form.status) => {
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
      status: nextStatus,
      courseId: selectedCourseId,
      classroomId: assignMode === "class" ? emptyToNull(form.classroomId) : null,
      studentIds: assignMode === "students" ? form.studentIds : [],
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
      setFeedbackDrafts({});
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
    if (!aiConfig.topic.trim()) return toast.error("Enter a topic first");
    setGenerating(true);
    try {
      const { config } = withRequestId({}, "assignment-generation");
      const response = await api.ai.generateAssignment({
        topic: aiConfig.topic.trim(),
        subject: aiConfig.subject,
        grade_level: aiConfig.gradeLevel,
        num_questions: Number(aiConfig.numQuestions),
        question_type: aiConfig.questionType,
        difficulty: aiConfig.difficulty,
        assignment_type: aiConfig.assignmentType,
        curriculum: aiConfig.curriculum,
        exam_focus: "practice",
      }, config);

      const generated = response?.data || response?.assignment || response || {};
      const questions = generated?.assignment || generated?.questions || [];
      setAiGenerated({ ...generated, questions });

      setForm(prev => ({
        ...prev,
        title: generated?.topic || aiConfig.topic,
        description: `AI-generated ${aiConfig.assignmentType} on ${aiConfig.topic}`,
        instructions: generated?.instructions || questions.map((q, i) => `${i+1}. ${q.question || q.questionText || ""}`).join("\n") || "",
      }));
      toast.success(`Assignment generated — review and assign below`);
    } catch (error) {
      const status = error?.status || error?.response?.status;
      if (status === 502 || status === 503) {
        if (warmingTimerRef.current) clearInterval(warmingTimerRef.current);
        setWarming(true);
        let countdown = 30;
        setWarmingCountdown(countdown);
        warmingTimerRef.current = setInterval(() => {
          countdown -= 1;
          setWarmingCountdown(countdown);
          if (countdown <= 0) {
            clearInterval(warmingTimerRef.current);
            warmingTimerRef.current = null;
            setWarming(false);
            generateDraft();
          }
        }, 1000);
      } else {
        toast.error(error?.message || "AI generation failed");
      }
    } finally {
      setGenerating(false);
    }
  };

  useRealtimeRefresh(
    async () => {
      await load(selectedCourseId);

      if (review?.assignment?._id) {
        await loadReview(review.assignment._id);
      }
    },
    {
      shouldRefresh: (event) => {
        const eventType = String(event?.type || "");
        if (!["submission", "teacher_review", "grade"].includes(eventType)) {
          return false;
        }

        const eventCourseId = String(event?.meta?.courseId || "");
        return !selectedCourseId || !eventCourseId || eventCourseId === selectedCourseId;
      },
    },
  );

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
        <div className="col-md-6 col-xl">
          <SummaryCard title="Total" value={summary.total} />
        </div>
        <div className="col-md-6 col-xl">
          <SummaryCard title="Published" value={summary.published} />
        </div>
        <div className="col-md-6 col-xl">
          <SummaryCard title="Drafts" value={summary.draft} />
        </div>
        <div className="col-md-6 col-xl">
          <SummaryCard title="Submitted work" value={summary.submitted} />
        </div>
        <div className="col-md-6 col-xl">
          <SummaryCard title="Needs grading" value={summary.pendingReview} />
        </div>
        <div className="col-md-6 col-xl">
          <SummaryCard title="Missing" value={summary.missing} />
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-5">
          {/* ── Step 1: AI Generator ─────────────────────────── */}
          <div className="dash-card mb-3">
            <div className="d-flex align-items-center gap-2 mb-3">
              <FaMagic style={{ color: "#a78bfa" }} />
              <h3 className="dash-card-title mb-0">Generate with AI</h3>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">Topic <span className="text-danger">*</span></label>
              <input
                className="form-control"
                placeholder="e.g. Quadratic equations, The French Revolution…"
                value={aiConfig.topic}
                onChange={e => setAiConfig(p => ({ ...p, topic: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && generateDraft()}
              />
            </div>

            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label fw-semibold">Subject</label>
                <select className="form-select" value={aiConfig.subject} onChange={e => setAiConfig(p => ({ ...p, subject: e.target.value }))}>
                  {["Mathematics","Physics","Chemistry","Biology","English","History","Geography","Computer Science","Economics","General"].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-6">
                <label className="form-label fw-semibold">Exam / Curriculum</label>
                <select className="form-select" value={aiConfig.curriculum} onChange={e => setAiConfig(p => ({ ...p, curriculum: e.target.value }))}>
                  {["General","SAT","IGCSE","AP","IB","GCSE","A-Level","Regents"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-6">
                <label className="form-label fw-semibold">Assignment type</label>
                <select className="form-select" value={aiConfig.assignmentType} onChange={e => setAiConfig(p => ({ ...p, assignmentType: e.target.value }))}>
                  <option value="homework">Homework</option>
                  <option value="classwork">Classwork</option>
                  <option value="worksheet">Worksheet</option>
                  <option value="project">Project</option>
                  <option value="assessment">Assessment</option>
                  <option value="practice">Practice</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label fw-semibold">Question type</label>
                <select className="form-select" value={aiConfig.questionType} onChange={e => setAiConfig(p => ({ ...p, questionType: e.target.value }))}>
                  <option value="multiple_choice">Multiple choice</option>
                  <option value="short_answer">Short answer</option>
                  <option value="essay">Essay</option>
                  <option value="problem_solving">Problem solving</option>
                  <option value="mixed">Mixed</option>
                </select>
              </div>
              <div className="col-6">
                <label className="form-label fw-semibold">Difficulty</label>
                <select className="form-select" value={aiConfig.difficulty} onChange={e => setAiConfig(p => ({ ...p, difficulty: e.target.value }))}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div className="col-3">
                <label className="form-label fw-semibold"># Questions</label>
                <input className="form-control" type="number" min="1" max="20" value={aiConfig.numQuestions}
                  onChange={e => setAiConfig(p => ({ ...p, numQuestions: e.target.value }))} />
              </div>
              <div className="col-3">
                <label className="form-label fw-semibold">Grade level</label>
                <input className="form-control" placeholder="e.g. 10" value={aiConfig.gradeLevel}
                  onChange={e => setAiConfig(p => ({ ...p, gradeLevel: e.target.value }))} />
              </div>
            </div>

            <button
              className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
              type="button"
              onClick={generateDraft}
              disabled={generating || !aiConfig.topic.trim()}
            >
              <FaMagic />
              {generating ? "Generating…" : "Generate with AI"}
            </button>
          </div>

          {/* Warmup banner — Render free-tier cold start */}
          {warming && (
            <div className="alert alert-warning d-flex align-items-center gap-2 flex-wrap mb-3">
              <span className="spinner-border spinner-border-sm flex-shrink-0" aria-hidden="true" />
              <span className="flex-grow-1">
                ⏳ AI service warming up (Render free tier)&hellip; auto-retrying in&nbsp;
                <strong>{warmingCountdown}s</strong>
              </span>
              <button
                className="btn btn-sm btn-outline-warning ms-auto"
                onClick={() => {
                  if (warmingTimerRef.current) { clearInterval(warmingTimerRef.current); warmingTimerRef.current = null; }
                  setWarming(false);
                  generateDraft();
                }}
              >Retry Now</button>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => {
                  if (warmingTimerRef.current) { clearInterval(warmingTimerRef.current); warmingTimerRef.current = null; }
                  setWarming(false);
                }}
              >Cancel</button>
            </div>
          )}

          {/* ── AI Preview ───────────────────────────────────── */}
          {aiGenerated && (
            <div className="dash-card mb-3" style={{ border: "1px solid rgba(167,139,250,0.4)", background: "rgba(167,139,250,0.06)" }}>
              <div className="d-flex justify-content-between align-items-start mb-2">
                <h4 className="dash-card-title mb-0" style={{ color: "#a78bfa" }}>
                  ✓ Generated — {aiGenerated.questions?.length || 0} questions
                </h4>
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setAiGenerated(null)}>✕</button>
              </div>
              <p className="dash-card-muted mb-2" style={{ fontSize: "0.82rem" }}>
                Topic: <strong>{aiGenerated.topic || aiConfig.topic}</strong> · Difficulty: {aiGenerated.difficulty || aiConfig.difficulty} · Curriculum: {aiGenerated.curriculum || aiConfig.curriculum}
              </p>
              <div className="d-flex flex-column gap-1" style={{ maxHeight: 180, overflowY: "auto" }}>
                {(aiGenerated.questions || []).slice(0, 5).map((q, i) => (
                  <div key={i} className="small p-2 rounded" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <span style={{ opacity: 0.5 }}>{i + 1}.</span> {q.question || q.questionText || "(no text)"}
                  </div>
                ))}
                {(aiGenerated.questions?.length || 0) > 5 && (
                  <p className="dash-card-muted mb-0 small">+ {aiGenerated.questions.length - 5} more questions</p>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Details & Assign ─────────────────────── */}
          <div className="dash-card">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3 className="dash-card-title mb-0">
                <FaClipboardList className="me-2" />
                {selectedAssignmentId ? "Edit assignment" : "Details & Assign"}
              </h3>
              <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => { resetForm(); setAiGenerated(null); }}>
                Reset
              </button>
            </div>

            <div className="mb-3">
              <label className="form-label">Course</label>
              <select className="form-select" value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)}>
                <option value="">Select course</option>
                {courses.map(c => <option key={c._id} value={c._id}>{c.title || c.name || c._id}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label">Title</label>
              <input className="form-control" value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>

            <div className="mb-3">
              <label className="form-label">Description</label>
              <textarea className="form-control" rows={2} value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>

            <div className="mb-3">
              <label className="form-label">Instructions</label>
              <textarea className="form-control" rows={4} value={form.instructions}
                onChange={e => setForm(p => ({ ...p, instructions: e.target.value }))} />
            </div>

            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <label className="form-label">Due date</label>
                <input className="form-control" type="datetime-local" value={form.dueDate}
                  onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Max score</label>
                <input className="form-control" type="number" value={form.maxScore}
                  onChange={e => setForm(p => ({ ...p, maxScore: e.target.value }))} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Type</label>
                <select className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                  {ASSIGNMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Status</label>
                <select className="form-select" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Assign to section */}
            <div className="mb-3">
              <label className="form-label fw-semibold">Assign to</label>
              <div className="d-flex gap-2 mb-2">
                {["course","class","students"].map(mode => (
                  <button key={mode} type="button"
                    className={`btn btn-sm ${assignMode === mode ? "btn-primary" : "btn-outline-secondary"}`}
                    onClick={() => setAssignMode(mode)}>
                    {mode === "course" ? "Entire course" : mode === "class" ? "Class" : "Specific students"}
                  </button>
                ))}
              </div>

              {assignMode === "class" && (
                <select className="form-select" value={form.classroomId}
                  onChange={e => setForm(p => ({ ...p, classroomId: e.target.value }))}>
                  <option value="">Select class / classroom</option>
                  {roster.classrooms.map(cl => <option key={cl._id} value={cl._id}>{cl.name}</option>)}
                </select>
              )}

              {assignMode === "students" && (
                <>
                  <p className="dash-card-muted mb-1" style={{ fontSize: "0.8rem" }}>Hold Ctrl/Cmd to select multiple</p>
                  <select className="form-select" multiple size={6} value={form.studentIds}
                    onChange={e => setForm(p => ({ ...p, studentIds: Array.from(e.target.selectedOptions, o => o.value) }))}>
                    {roster.students.map(s => (
                      <option key={s._id} value={s._id}>{nameForUser(s)} · {s.email}</option>
                    ))}
                  </select>
                  {form.studentIds.length > 0 && (
                    <p className="dash-card-muted mb-0 mt-1" style={{ fontSize: "0.8rem" }}>
                      {form.studentIds.length} student{form.studentIds.length !== 1 ? "s" : ""} selected
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="d-flex gap-2">
              <button className="btn btn-outline-light flex-fill" type="button" disabled={saving}
                onClick={() => { setForm(p => ({ ...p, status: "draft" })); saveAssignment("draft"); }}>
                Save draft
              </button>
              <button className="btn btn-primary flex-fill" type="button" disabled={saving}
                onClick={() => { setForm(p => ({ ...p, status: "published" })); saveAssignment("published"); }}>
                {saving ? "Saving…" : "Publish"}
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
                          Target: {targetScopeLabel(assignment)}
                        </div>
                        <div className="text-muted small">
                          Due {formatDate(assignment.dueDate)} • {assignment.status}
                        </div>
                      </div>
                      <div className="d-flex gap-2 flex-wrap">
                        <span className={`badge ${badgeClass(assignment?.status)}`}>
                          {assignment?.status || "draft"}
                        </span>
                        <span className="badge bg-secondary">
                          targeted {assignment?.counts?.targetedStudents || 0}
                        </span>
                        <span className="badge bg-secondary">
                          submitted {assignment?.counts?.submitted || 0}
                        </span>
                        <span className="badge bg-warning text-dark">
                          needs grading {countPendingReview(assignment?.counts)}
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
                  Target {targetScopeLabel(review?.assignment)}
                </span>
                <span className="badge bg-secondary">
                  Submitted {review?.summary?.submitted || 0}
                </span>
                <span className="badge bg-warning text-dark">
                  Needs grading {countPendingReview(review?.summary)}
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
                        <div className="small text-muted">
                          {submission.score !== null && submission.score !== undefined
                            ? `Current score ${formatPercent(submission.score)}`
                            : "Awaiting grade"}
                          {Array.isArray(submission.files) && submission.files.length
                            ? ` - ${submission.files.length} file(s)`
                            : ""}
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
                      <Link
                        className="btn btn-primary btn-sm"
                        to="/dashboard/grades"
                      >
                        Open in gradebook
                      </Link>
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

                    {submission.feedback ? (
                      <div className="mt-3 p-3 border rounded bg-white">
                        <b>Saved feedback</b>
                        <p className="mb-0 mt-2">{submission.feedback}</p>
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
