import { useCallback, useEffect, useMemo, useState } from "react";
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
      classroomId: form.classroomId || null,
      studentIds: form.studentIds,
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
    if (!form.title.trim() && !form.subject.trim()) {
      toast.error("Enter a title or subject first");
      return;
    }

    try {
      const response = await api.ai.generateQuiz({
        topic: form.title.trim() || form.subject.trim(),
        subject: form.subject.trim() || "General",
        grade_level: form.gradeLevel.trim() || "All",
        num_questions: 5,
        question_type: "multiple_choice",
        difficulty: "medium",
        curriculum: form.curriculum.trim() || "General",
        exam_focus: "practice",
      });

      const questions = extractGeneratedQuestions(response);
      if (!questions.length) {
        toast.error("AI did not return quiz questions");
        return;
      }

      setAiPreview(questions);
      toast.success(
        `${questions.length} questions ready — review and insert below`,
      );
    } catch (error) {
      toast.error(error?.message || "Failed to generate quiz draft");
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
          <div className="dash-card">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h3 className="dash-card-title mb-0">
                <FaBookOpen className="me-2" />
                {selectedQuizId ? "Edit quiz" : "Create quiz"}
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

            <div className="row g-3">
              <div className="col-md-8">
                <label className="form-label">Title</label>
                <input
                  className="form-control"
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Subject</label>
                <input
                  className="form-control"
                  value={form.subject}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, subject: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="mt-3">
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

            <div className="row g-3 mt-1">
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
              <div className="col-md-4">
                <label className="form-label">Time limit (min)</label>
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  value={form.timeLimit}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, timeLimit: event.target.value }))
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Max attempts</label>
                <input
                  className="form-control"
                  type="number"
                  min="1"
                  value={form.maxAttempts}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, maxAttempts: event.target.value }))
                  }
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Passing score</label>
                <input
                  className="form-control"
                  type="number"
                  min="0"
                  max="100"
                  value={form.passingScore}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, passingScore: event.target.value }))
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
            </div>

            <div className="mt-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h4 className="h6 mb-0">Questions</h4>
                <button className="btn btn-outline-light btn-sm" type="button" onClick={addQuestion}>
                  <FaPlus className="me-2" />
                  Add question
                </button>
              </div>

              <div className="d-flex flex-column gap-3">
                {form.questions.map((question, index) => (
                  <div key={`question-${index}`} className="border rounded p-3 bg-light-subtle">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <strong>Question {index + 1}</strong>
                      <button
                        className="btn btn-outline-danger btn-sm"
                        type="button"
                        onClick={() => removeQuestion(index)}
                        disabled={form.questions.length === 1}
                      >
                        <FaTrash />
                      </button>
                    </div>

                    <div className="mb-3">
                      <label className="form-label">Question text</label>
                      <textarea
                        className="form-control"
                        rows={2}
                        value={question.questionText}
                        onChange={(event) =>
                          updateQuestion(index, { questionText: event.target.value })
                        }
                      />
                    </div>

                    <div className="row g-3">
                      <div className="col-md-6">
                        <label className="form-label">Type</label>
                        <select
                          className="form-select"
                          value={question.questionType}
                          onChange={(event) =>
                            updateQuestionType(index, event.target.value)
                          }
                        >
                          {QUESTION_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">Points</label>
                        <input
                          className="form-control"
                          type="number"
                          min="1"
                          value={question.points}
                          onChange={(event) =>
                            updateQuestion(index, { points: event.target.value })
                          }
                        />
                      </div>
                    </div>

                    {question.questionType === "multiple_choice" ? (
                      <div className="mt-3">
                        <label className="form-label">Options</label>
                        <div className="d-flex flex-column gap-2">
                          {question.options.map((option, optionIndex) => (
                            <div key={`option-${optionIndex}`} className="input-group">
                              <span className="input-group-text">
                                {String.fromCharCode(65 + optionIndex)}
                              </span>
                              <input
                                className="form-control"
                                value={option}
                                onChange={(event) =>
                                  updateQuestionOption(
                                    index,
                                    optionIndex,
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                          ))}
                        </div>
                        <div className="mt-3">
                          <label className="form-label">Correct answer</label>
                          <select
                            className="form-select"
                            value={question.correctAnswer}
                            onChange={(event) =>
                              updateQuestion(index, { correctAnswer: event.target.value })
                            }
                          >
                            {question.options.map((_, optionIndex) => {
                              const letter = String.fromCharCode(65 + optionIndex);
                              return (
                                <option key={letter} value={letter}>
                                  {letter}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>
                    ) : question.questionType === "true_false" ? (
                      <div className="mt-3">
                        <label className="form-label">Correct answer</label>
                        <select
                          className="form-select"
                          value={question.correctAnswer}
                          onChange={(event) =>
                            updateQuestion(index, { correctAnswer: event.target.value })
                          }
                        >
                          <option value="true">True</option>
                          <option value="false">False</option>
                        </select>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <label className="form-label">Expected answer</label>
                        <textarea
                          className="form-control"
                          rows={2}
                          value={question.correctAnswer}
                          onChange={(event) =>
                            updateQuestion(index, { correctAnswer: event.target.value })
                          }
                        />
                      </div>
                    )}

                    <div className="mt-3">
                      <label className="form-label">Explanation</label>
                      <textarea
                        className="form-control"
                        rows={2}
                        value={question.explanation}
                        onChange={(event) =>
                          updateQuestion(index, { explanation: event.target.value })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="d-flex gap-2 flex-wrap mt-4">
              <button className="btn btn-primary" type="button" onClick={saveQuiz} disabled={saving}>
                {saving ? "Saving..." : selectedQuizId ? "Update quiz" : "Create quiz"}
              </button>
              <button
                className="btn btn-outline-light"
                type="button"
                onClick={generateQuizDraft}
                title="Generate draft questions with AI — review before inserting"
              >
                <FaMagic className="me-2" />
                Draft with AI
              </button>
            </div>

            {(form.subject || selectedCourseId) && (
              <div className="form-text mt-2">
                AI context:{" "}
                {[
                  courses.find((c) => c._id === selectedCourseId)?.title,
                  form.subject,
                  form.gradeLevel !== "All" ? form.gradeLevel : null,
                ]
                  .filter(Boolean)
                  .join(" › ") || "no context yet — enter a subject first"}
              </div>
            )}

            {aiPreview && aiPreview.length > 0 && (
              <div
                className="border rounded p-3 mt-3"
                style={{
                  borderColor: "var(--purple, #6F79E6)",
                  background: "rgba(111,121,230,0.06)",
                }}
              >
                <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                  <div>
                    <span className="badge bg-warning text-dark me-2">
                      AI Draft
                    </span>
                    <span className="fw-semibold">
                      {aiPreview.length} questions — review before inserting
                    </span>
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      onClick={insertAiPreview}
                    >
                      Insert into form
                    </button>
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      type="button"
                      onClick={() => setAiPreview(null)}
                    >
                      Discard
                    </button>
                  </div>
                </div>
                <div className="d-flex flex-column gap-2">
                  {aiPreview.map((q, i) => (
                    <div
                      key={`preview-${i}`}
                      className="border rounded p-2"
                      style={{ background: "var(--card-bg)" }}
                    >
                      <div className="fw-semibold mb-1">
                        Q{i + 1}: {q.questionText}
                      </div>
                      <div className="text-muted" style={{ fontSize: "0.82em" }}>
                        {q.questionType} · {q.points} pt
                        {q.questionType === "multiple_choice" && q.options.length > 0
                          ? ` · Options: ${q.options.join(", ")} · Answer: ${q.correctAnswer}`
                          : q.questionType === "true_false"
                          ? ` · Answer: ${q.correctAnswer}`
                          : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
