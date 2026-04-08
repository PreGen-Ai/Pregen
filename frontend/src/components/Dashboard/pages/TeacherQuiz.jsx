import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { FaBookOpen, FaMagic, FaPlus, FaTrash } from "react-icons/fa";
import api from "../../../services/api/api";
import "../../styles/dashboard.css";

const STATUS_OPTIONS = ["draft", "published", "closed"];
const QUESTION_TYPES = [
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "true_false", label: "True / False" },
  { value: "short_answer", label: "Short answer" },
  { value: "essay", label: "Essay" },
];

function formatDate(value, fallback = "No due date") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString();
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

function formatPercent(value, fallback = "Awaiting score") {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(0)}%` : fallback;
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

function statusBadgeClass(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "published") return "bg-primary";
  if (normalized === "graded" || normalized === "submitted") return "bg-success";
  if (normalized === "draft") return "bg-warning text-dark";
  if (normalized === "closed" || normalized === "missing") return "bg-secondary";
  return "bg-secondary";
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

function createQuestion(type = "multiple_choice") {
  return {
    questionText: "",
    questionType: type,
    options:
      type === "multiple_choice"
        ? ["Option A", "Option B", "Option C", "Option D"]
        : [],
    correctAnswer: type === "true_false" ? "true" : "A",
    points: type === "essay" ? 10 : 1,
    explanation: "",
  };
}

function normalizeCorrectAnswer(value, options) {
  const raw = String(value || "").trim();
  if (!raw) return "A";
  const upper = raw.toUpperCase();
  if (["A", "B", "C", "D"].includes(upper)) return upper;

  const optionIndex = (options || []).findIndex(
    (option) => String(option || "").trim().toLowerCase() === raw.toLowerCase(),
  );
  return optionIndex >= 0 ? String.fromCharCode(65 + optionIndex) : "A";
}

function extractGeneratedQuestions(response) {
  const payload = response?.quiz || response?.data || response || {};
  const rawQuestions = Array.isArray(payload?.questions)
    ? payload.questions
    : Array.isArray(payload)
      ? payload
      : [];

  return rawQuestions.map((question, index) => {
    const questionType = String(
      question?.questionType || question?.type || "multiple_choice",
    )
      .trim()
      .toLowerCase();
    const rawOptions = Array.isArray(question?.options)
      ? question.options.map((option) =>
          typeof option === "string" ? option : option?.text || option?.label || "",
        )
      : [];

    const options =
      questionType === "multiple_choice"
        ? rawOptions.length
          ? rawOptions
          : ["Option A", "Option B", "Option C", "Option D"]
        : [];

    const correctAnswer =
      questionType === "multiple_choice"
        ? normalizeCorrectAnswer(
            question?.correct_answer || question?.correctAnswer || question?.answer,
            options,
          )
        : questionType === "true_false"
          ? String(question?.correct_answer || question?.correctAnswer || "true")
              .trim()
              .toLowerCase() === "false"
            ? "false"
            : "true"
          : String(
              question?.expected_answer ||
                question?.correct_answer ||
                question?.correctAnswer ||
                "",
            ).trim();

    return {
      questionText:
        question?.questionText || question?.question || `Question ${index + 1}`,
      questionType,
      options,
      correctAnswer,
      points: Number(question?.points || question?.max_score || 1),
      explanation: question?.explanation || "",
    };
  });
}

export default function TeacherQuiz() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [roster, setRoster] = useState({ students: [], classrooms: [] });
  const [selectedQuizId, setSelectedQuizId] = useState(null);
  const [results, setResults] = useState(null);
  const [aiPreview, setAiPreview] = useState(null); // questions staged for review before insert
  const [aiConfig, setAiConfig] = useState({
    topic: "",
    subject: "",
    gradeLevel: "All",
    curriculum: "General",
    questionType: "multiple_choice",
    difficulty: "medium",
    numQuestions: 5,
  });
  const [generating, setGenerating] = useState(false);
  const [assignMode, setAssignMode] = useState("course"); // "course" | "class" | "students"
  const [warming, setWarming] = useState(false);
  const [warmingCountdown, setWarmingCountdown] = useState(0);
  const warmingTimerRef = useRef(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    subject: "",
    curriculum: "General",
    gradeLevel: "All",
    dueDate: "",
    timeLimit: 30,
    maxAttempts: 1,
    passingScore: 60,
    status: "draft",
    classroomId: "",
    studentIds: [],
    questions: [createQuestion()],
  });

  const loadQuizzes = useCallback(async (courseId) => {
    const response = await api.teachers.listQuizzes(courseId ? { courseId } : undefined);
    setQuizzes(response?.data || []);
  }, []);

  const load = useCallback(async (courseId = selectedCourseId) => {
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
      await loadQuizzes(effectiveCourseId);
    } catch (error) {
      toast.error(error?.message || "Failed to load quizzes");
    } finally {
      setLoading(false);
    }
  }, [loadQuizzes, selectedCourseId]);

  useEffect(() => {
    load();
  }, [load]);

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
          loadQuizzes(selectedCourseId),
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
  }, [loadQuizzes, selectedCourseId]);

  const summary = useMemo(() => {
    const published = quizzes.filter((item) => item.status === "published").length;
    const draft = quizzes.filter((item) => item.status === "draft").length;
    const attempts = quizzes.reduce(
      (sum, item) => sum + Number(item?.counts?.submitted || 0),
      0,
    );
    const missing = quizzes.reduce(
      (sum, item) => sum + Number(item?.counts?.missing || 0),
      0,
    );
    const pendingReview = quizzes.reduce(
      (sum, item) => sum + countPendingReview(item?.counts),
      0,
    );

    return {
      total: quizzes.length,
      published,
      draft,
      attempts,
      missing,
      pendingReview,
    };
  }, [quizzes]);

  const resetForm = () => {
    setSelectedQuizId(null);
    setForm({
      title: "",
      description: "",
      subject: "",
      curriculum: "General",
      gradeLevel: "All",
      dueDate: "",
      timeLimit: 30,
      maxAttempts: 1,
      passingScore: 60,
      status: "draft",
      classroomId: roster.classrooms[0]?._id || "",
      studentIds: [],
      questions: [createQuestion()],
    });
  };

  const updateQuestion = (index, patch) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((question, questionIndex) =>
        questionIndex === index ? { ...question, ...patch } : question,
      ),
    }));
  };

  const updateQuestionType = (index, type) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((question, questionIndex) =>
        questionIndex === index
          ? {
              ...createQuestion(type),
              questionText: question.questionText,
              explanation: question.explanation,
            }
          : question,
      ),
    }));
  };

  const updateQuestionOption = (questionIndex, optionIndex, value) => {
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.map((question, currentQuestionIndex) => {
        if (currentQuestionIndex !== questionIndex) return question;
        return {
          ...question,
          options: question.options.map((option, currentOptionIndex) =>
            currentOptionIndex === optionIndex ? value : option,
          ),
        };
      }),
    }));
  };

  const addQuestion = () => {
    setForm((prev) => ({
      ...prev,
      questions: [...prev.questions, createQuestion()],
    }));
  };

  const removeQuestion = (index) => {
    setForm((prev) => ({
      ...prev,
      questions:
        prev.questions.length > 1
          ? prev.questions.filter((_, questionIndex) => questionIndex !== index)
          : prev.questions,
    }));
  };

  const populateForm = (quiz) => {
    setSelectedQuizId(quiz._id);
    setSelectedCourseId(quiz.courseId || selectedCourseId);
    setForm({
      title: quiz.title || "",
      description: quiz.description || "",
      subject: quiz.subject || "",
      curriculum: quiz.curriculum || "General",
      gradeLevel: quiz.gradeLevel || "All",
      dueDate: quiz.dueDate
        ? new Date(quiz.dueDate).toISOString().slice(0, 16)
        : "",
      timeLimit: quiz.timeLimit || 30,
      maxAttempts: quiz.maxAttempts || 1,
      passingScore: quiz.passingScore || 60,
      status: quiz.status || "draft",
      classroomId: quiz.classroomId || "",
      studentIds: quiz.selectedStudentIds || [],
      questions: (quiz.questions || []).length
        ? quiz.questions.map((question) => ({
            questionText: question.questionText || question.question || "",
            questionType: question.questionType || question.type || "multiple_choice",
            options: Array.isArray(question.options)
              ? question.options.map((option) =>
                  typeof option === "string" ? option : option?.text || "",
                )
              : [],
            correctAnswer:
              question.correctAnswer ||
              question.correct_answer ||
              question.expected_answer ||
              "",
            points: Number(question.points || question.max_score || 1),
            explanation: question.explanation || "",
          }))
        : [createQuestion()],
    });
  };

  const saveQuiz = async () => {
    if (!selectedCourseId) return toast.error("Select a course first");
    if (!form.title.trim() || !form.subject.trim()) {
      return toast.error("Title and subject are required");
    }
    if (!form.questions.length || !form.questions.every((q) => q.questionText.trim())) {
      return toast.error("Add at least one complete question");
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      subject: form.subject.trim(),
      curriculum: form.curriculum.trim() || "General",
      gradeLevel: form.gradeLevel.trim() || "All",
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
      timeLimit: Number(form.timeLimit || 30),
      maxAttempts: Number(form.maxAttempts || 1),
      passingScore: Number(form.passingScore || 60),
      status: form.status,
      courseId: selectedCourseId,
      classroomId: assignMode === "class" ? (form.classroomId || null) : null,
      studentIds: assignMode === "students" ? form.studentIds : [],
      questions: form.questions.map((question) => ({
        questionText: question.questionText.trim(),
        questionType: question.questionType,
        options:
          question.questionType === "multiple_choice"
            ? question.options.map((option) => option.trim()).filter(Boolean)
            : [],
        correctAnswer: question.correctAnswer,
        points: Number(question.points || 1),
        explanation: question.explanation.trim(),
      })),
    };

    try {
      setSaving(true);
      if (selectedQuizId) {
        await api.teachers.updateQuiz(selectedQuizId, payload);
        toast.success("Quiz updated");
      } else {
        await api.teachers.createQuiz(payload);
        toast.success("Quiz created");
      }
      resetForm();
      await load(selectedCourseId);
    } catch (error) {
      toast.error(error?.message || "Failed to save quiz");
    } finally {
      setSaving(false);
    }
  };

  const generateQuizDraft = async () => {
    if (!aiConfig.topic.trim() && !aiConfig.subject.trim()) {
      toast.error("Enter a topic or subject first");
      return;
    }
    setGenerating(true);
    try {
      const response = await api.ai.generateQuiz({
        topic: aiConfig.topic.trim() || aiConfig.subject.trim(),
        subject: aiConfig.subject.trim() || "General",
        grade_level: aiConfig.gradeLevel,
        num_questions: Number(aiConfig.numQuestions),
        question_type: aiConfig.questionType,
        difficulty: aiConfig.difficulty,
        curriculum: aiConfig.curriculum,
        exam_focus: "practice",
      });

      const questions = extractGeneratedQuestions(response);
      if (!questions.length) {
        toast.error("AI did not return quiz questions");
        return;
      }

      setAiPreview(questions);
      // Auto-fill title
      setForm(prev => ({
        ...prev,
        title: prev.title || (aiConfig.topic.trim() ? `${aiConfig.topic} Quiz` : prev.title),
        subject: prev.subject || aiConfig.subject,
        gradeLevel: prev.gradeLevel !== "All" ? prev.gradeLevel : aiConfig.gradeLevel,
        curriculum: aiConfig.curriculum,
      }));
      toast.success(`${questions.length} questions generated — review below`);
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
            generateQuizDraft();
          }
        }, 1000);
      } else {
        toast.error(error?.message || "Failed to generate quiz");
      }
    } finally {
      setGenerating(false);
    }
  };

  const insertAiPreview = () => {
    if (!aiPreview?.length) return;
    setForm((prev) => ({
      ...prev,
      description:
        prev.description ||
        `AI-generated quiz draft for ${prev.title || prev.subject || "this topic"}`,
      questions: aiPreview,
    }));
    setAiPreview(null);
    toast.success("Questions inserted into form");
  };

  const loadResults = async (quizId) => {
    try {
      const data = await api.teachers.getQuizResults(quizId);
      setResults(data);
    } catch (error) {
      toast.error(error?.message || "Failed to load quiz results");
    }
  };

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-3">
        <div>
          <h2>Quizzes</h2>
          <p className="text-muted mb-0">
            Create, publish, assign, and review quizzes on the repaired quiz contract.
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
          <SummaryCard title="Attempts" value={summary.attempts} />
        </div>
        <div className="col-md-6 col-xl">
          <SummaryCard title="Needs review" value={summary.pendingReview} />
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
              <h3 className="dash-card-title mb-0">Generate Quiz with AI</h3>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">Topic <span className="text-danger">*</span></label>
              <input
                className="form-control"
                placeholder="e.g. Newton's laws, World War II, Algebra…"
                value={aiConfig.topic}
                onChange={e => setAiConfig(p => ({ ...p, topic: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && generateQuizDraft()}
              />
            </div>

            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label fw-semibold">Subject</label>
                <select className="form-select" value={aiConfig.subject} onChange={e => setAiConfig(p => ({ ...p, subject: e.target.value }))}>
                  <option value="">— select —</option>
                  {["Mathematics","Physics","Chemistry","Biology","English","History","Geography","Computer Science","Economics"].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-6">
                <label className="form-label fw-semibold">Exam / Curriculum</label>
                <select className="form-select" value={aiConfig.curriculum} onChange={e => setAiConfig(p => ({ ...p, curriculum: e.target.value }))}>
                  {["General","SAT","IGCSE","AP","IB","GCSE","A-Level","Regents"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-6">
                <label className="form-label fw-semibold">Question type</label>
                <select className="form-select" value={aiConfig.questionType} onChange={e => setAiConfig(p => ({ ...p, questionType: e.target.value }))}>
                  <option value="multiple_choice">Multiple choice</option>
                  <option value="true_false">True / False</option>
                  <option value="short_answer">Short answer</option>
                  <option value="essay">Essay</option>
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
              <div className="col-4">
                <label className="form-label fw-semibold"># Questions</label>
                <input className="form-control" type="number" min="1" max="20" value={aiConfig.numQuestions}
                  onChange={e => setAiConfig(p => ({ ...p, numQuestions: e.target.value }))} />
              </div>
              <div className="col-4">
                <label className="form-label fw-semibold">Grade</label>
                <input className="form-control" placeholder="e.g. 10" value={aiConfig.gradeLevel}
                  onChange={e => setAiConfig(p => ({ ...p, gradeLevel: e.target.value }))} />
              </div>
            </div>

            <button
              className="btn btn-primary w-100 d-flex align-items-center justify-content-center gap-2"
              type="button"
              onClick={generateQuizDraft}
              disabled={generating || (!aiConfig.topic.trim() && !aiConfig.subject.trim())}
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
                  generateQuizDraft();
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
          {aiPreview && (
            <div className="dash-card mb-3" style={{ border: "1px solid rgba(167,139,250,0.4)", background: "rgba(167,139,250,0.06)" }}>
              <div className="d-flex justify-content-between align-items-start mb-2">
                <h4 className="dash-card-title mb-0" style={{ color: "#a78bfa" }}>
                  ✓ {aiPreview.length} questions ready
                </h4>
                <div className="d-flex gap-2">
                  <button className="btn btn-sm btn-primary" onClick={insertAiPreview}>Use these</button>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setAiPreview(null)}>✕</button>
                </div>
              </div>
              <div className="d-flex flex-column gap-1" style={{ maxHeight: 180, overflowY: "auto" }}>
                {aiPreview.slice(0, 5).map((q, i) => (
                  <div key={i} className="small p-2 rounded" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <span style={{ opacity: 0.5 }}>{i + 1}.</span>{" "}
                    <span className="badge me-1" style={{ fontSize: "0.65rem", background: "rgba(99,102,241,0.3)" }}>{q.questionType?.replace("_"," ") || "mcq"}</span>
                    {q.questionText || "(no text)"}
                  </div>
                ))}
                {aiPreview.length > 5 && (
                  <p className="dash-card-muted mb-0 small">+ {aiPreview.length - 5} more</p>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Quiz Details & Assign ────────────────── */}
          <div className="dash-card">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3 className="dash-card-title mb-0">
                <FaBookOpen className="me-2" />
                {selectedQuizId ? "Edit quiz" : "Details & Assign"}
              </h3>
              <button className="btn btn-outline-secondary btn-sm" type="button" onClick={() => { resetForm(); setAiPreview(null); }}>
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

            <div className="row g-3 mb-3">
              <div className="col-8">
                <label className="form-label">Title</label>
                <input className="form-control" value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="col-4">
                <label className="form-label">Subject</label>
                <input className="form-control" value={form.subject}
                  onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} />
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label">Description</label>
              <textarea className="form-control" rows={2} value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>

            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label">Due date</label>
                <input className="form-control" type="datetime-local" value={form.dueDate}
                  onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
              </div>
              <div className="col-6">
                <label className="form-label">Status</label>
                <select className="form-select" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-4">
                <label className="form-label">Time (min)</label>
                <input className="form-control" type="number" min="1" value={form.timeLimit}
                  onChange={e => setForm(p => ({ ...p, timeLimit: e.target.value }))} />
              </div>
              <div className="col-4">
                <label className="form-label">Max attempts</label>
                <input className="form-control" type="number" min="1" value={form.maxAttempts}
                  onChange={e => setForm(p => ({ ...p, maxAttempts: e.target.value }))} />
              </div>
              <div className="col-4">
                <label className="form-label">Pass %</label>
                <input className="form-control" type="number" min="0" max="100" value={form.passingScore}
                  onChange={e => setForm(p => ({ ...p, passingScore: e.target.value }))} />
              </div>
            </div>

            {/* Assign to */}
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
                  <option value="">Select class</option>
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

            {/* Questions count */}
            <div className="mb-3 d-flex justify-content-between align-items-center">
              <span className="dash-card-muted" style={{ fontSize: "0.85rem" }}>
                Questions: <strong>{form.questions.length}</strong>
                {aiPreview && <span className="text-warning ms-2">(⚠ AI preview not yet applied — click &quot;Use these&quot; above)</span>}
              </span>
              <button className="btn btn-outline-light btn-sm" type="button" onClick={addQuestion}>
                <FaPlus className="me-1" /> Add question
              </button>
            </div>

            {/* Questions list */}
            <div className="d-flex flex-column gap-3 mb-3" style={{ maxHeight: 400, overflowY: "auto" }}>
              {form.questions.map((question, index) => (
                <div key={`question-${index}`} className="border rounded p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <strong style={{ fontSize: "0.85rem" }}>Question {index + 1}</strong>
                    <button className="btn btn-outline-danger btn-sm" type="button"
                      onClick={() => removeQuestion(index)} disabled={form.questions.length === 1}>
                      <FaTrash />
                    </button>
                  </div>
                  <textarea className="form-control mb-2" rows={2} placeholder="Question text"
                    value={question.questionText}
                    onChange={e => updateQuestion(index, { questionText: e.target.value })} />
                  <div className="row g-2">
                    <div className="col-6">
                      <select className="form-select form-select-sm" value={question.questionType}
                        onChange={e => updateQuestionType(index, e.target.value)}>
                        {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="col-6">
                      <input className="form-control form-control-sm" type="number" min="1" placeholder="Points"
                        value={question.points} onChange={e => updateQuestion(index, { points: e.target.value })} />
                    </div>
                  </div>
                  {question.questionType === "multiple_choice" && (
                    <div className="mt-2 d-flex flex-column gap-1">
                      {question.options.map((opt, oi) => (
                        <div key={oi} className="input-group input-group-sm">
                          <span className="input-group-text">{String.fromCharCode(65+oi)}</span>
                          <input className="form-control" value={opt}
                            onChange={e => updateQuestionOption(index, oi, e.target.value)} />
                        </div>
                      ))}
                      <div className="mt-1">
                        <select className="form-select form-select-sm" value={question.correctAnswer}
                          onChange={e => updateQuestion(index, { correctAnswer: e.target.value })}>
                          {question.options.map((_, oi) => (
                            <option key={oi} value={String.fromCharCode(65+oi)}>
                              Correct: {String.fromCharCode(65+oi)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                  {question.questionType === "true_false" && (
                    <div className="mt-2">
                      <select className="form-select form-select-sm" value={question.correctAnswer}
                        onChange={e => updateQuestion(index, { correctAnswer: e.target.value })}>
                        <option value="true">True</option>
                        <option value="false">False</option>
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="d-flex gap-2">
              <button className="btn btn-outline-light flex-fill" type="button" disabled={saving}
                onClick={() => { setForm(p => ({ ...p, status: "draft" })); saveQuiz(); }}>
                Save draft
              </button>
              <button className="btn btn-primary flex-fill" type="button" disabled={saving}
                onClick={() => { setForm(p => ({ ...p, status: "published" })); saveQuiz(); }}>
                {saving ? "Saving…" : "Publish"}
              </button>
            </div>
          </div>
        </div>

        <div className="col-lg-7 d-flex flex-column gap-3">
          <div className="dash-card">
            <h3 className="dash-card-title mb-3">Your quizzes</h3>
            {loading ? (
              <p className="dash-card-muted mb-0">Loading quizzes...</p>
            ) : quizzes.length ? (
              <div className="d-flex flex-column gap-3">
                {quizzes.map((quiz) => (
                  <div key={quiz._id} className="border rounded p-3 bg-light-subtle">
                    <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                      <div>
                        <div className="fw-semibold">{quiz.title}</div>
                        <div className="small text-muted">
                          Target: {targetScopeLabel(quiz)}
                        </div>
                        <div className="small text-muted">
                          Due {formatDate(quiz.dueDate)} • {quiz.status}
                        </div>
                      </div>
                      <div className="d-flex gap-2 flex-wrap">
                        <span className={`badge ${statusBadgeClass(quiz?.status)}`}>
                          {quiz?.status || "draft"}
                        </span>
                        <span className="badge bg-secondary">
                          targeted {quiz?.counts?.targetedStudents || 0}
                        </span>
                        <span className="badge bg-secondary">
                          attempts {quiz?.counts?.submitted || 0}
                        </span>
                        <span className="badge bg-warning text-dark">
                          needs review {countPendingReview(quiz?.counts)}
                        </span>
                        <span className="badge bg-secondary">
                          missing {quiz?.counts?.missing || 0}
                        </span>
                      </div>
                    </div>

                    <div className="d-flex gap-2 flex-wrap mt-3">
                      <button
                        className="btn btn-outline-light btn-sm"
                        type="button"
                        onClick={() => populateForm(quiz)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        type="button"
                        onClick={() => loadResults(quiz._id)}
                      >
                        Review results
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="dash-card-muted mb-0">No quizzes created yet.</p>
            )}
          </div>

          {results ? (
            <div className="dash-card">
              <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                <h3 className="dash-card-title mb-0">
                  Results: {results?.quiz?.title || "Quiz"}
                </h3>
                <Link className="btn btn-outline-light btn-sm" to="/dashboard/grades">
                  Gradebook
                </Link>
              </div>

              <div className="d-flex gap-2 flex-wrap mb-3">
                <span className="badge bg-secondary">
                  Target {targetScopeLabel(results?.quiz)}
                </span>
                <span className="badge bg-secondary">
                  Attempts {results?.summary?.submitted || 0}
                </span>
                <span className="badge bg-warning text-dark">
                  Needs review {countPendingReview(results?.summary)}
                </span>
                <span className="badge bg-secondary">
                  Graded {results?.summary?.graded || 0}
                </span>
                <span className="badge bg-secondary">
                  Missing {results?.summary?.missing || 0}
                </span>
              </div>

              {(results?.attempts || []).length ? (
                <div className="d-flex flex-column gap-3">
                  {results.attempts.map((attempt) => (
                    <div key={attempt._id} className="border rounded p-3 bg-light-subtle">
                      <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                      <div>
                        <div className="fw-semibold">{nameForUser(attempt.student)}</div>
                        <div className="small text-muted">
                          Submitted {formatDate(attempt.submittedAt || attempt.updatedAt, "")}
                        </div>
                        <div className="small text-muted">
                          {attempt.feedback
                            ? `Feedback saved - ${attempt.feedback}`
                            : "No feedback saved yet"}
                        </div>
                      </div>
                      <span
                        className={`badge ${
                          attempt.score !== null && attempt.score !== undefined
                            ? "bg-info text-dark"
                            : statusBadgeClass(attempt.status)
                        }`}
                      >
                        {attempt.score !== null && attempt.score !== undefined
                          ? formatPercent(attempt.score)
                          : attempt.status || "submitted"}
                      </span>
                    </div>
                  </div>
                ))}
                </div>
              ) : (
                <p className="dash-card-muted mb-0">No quiz attempts yet.</p>
              )}

              {results?.missingStudents?.length ? (
                <div className="mt-4">
                  <h4 className="h6">Missing students</h4>
                  <div className="d-flex flex-wrap gap-2 mt-2">
                    {results.missingStudents.map((student) => (
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
