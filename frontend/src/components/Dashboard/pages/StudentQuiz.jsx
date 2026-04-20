import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  FaCheckCircle,
  FaClipboardList,
  FaClock,
  FaPlay,
} from "react-icons/fa";
import api from "../../../services/api/api";
import useRealtimeRefresh from "../../../hooks/useRealtimeRefresh";
import { withRequestId } from "../../../utils/requestId";
import "../../styles/dashboard.css";

function formatDate(value, fallback = "Not scheduled") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString();
}

function formatPercent(value, fallback = "Awaiting score") {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(0)}%` : fallback;
}

function normalizeAttemptStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "in_progress" || normalized === "inprogress") {
    return "in_progress";
  }
  if (normalized === "submitted") return "submitted";
  if (normalized === "graded" || normalized === "final") return "graded";
  if (
    [
      "grading",
      "ai_graded",
      "aigraded",
      "pending_teacher_review",
      "pendingteacherreview",
      "grading_delayed",
      "gradingdelayed",
    ].includes(normalized)
  ) {
    return "grading";
  }
  return normalized;
}

function normalizeQuestion(question, index) {
  const type = String(
    question?.questionType || question?.type || "multiple_choice",
  )
    .trim()
    .toLowerCase();

  let correctAnswer =
    question?.correctAnswer ||
    question?.correct_answer ||
    question?.expected_answer ||
    "";
  const options = Array.isArray(question?.options) ? question.options : [];

  if (type === "multiple_choice" && correctAnswer && !["A", "B", "C", "D"].includes(String(correctAnswer).toUpperCase())) {
    const optionIndex = options.findIndex(
      (option) =>
        String(option || "").trim().toLowerCase() ===
        String(correctAnswer).trim().toLowerCase(),
    );
    correctAnswer = optionIndex >= 0 ? String.fromCharCode(65 + optionIndex) : "";
  }

  return {
    id: question?.id || String(question?._id || `q-${index + 1}`),
    questionText: question?.questionText || question?.question || `Question ${index + 1}`,
    type,
    options,
    correctAnswer: String(correctAnswer || ""),
    explanation: question?.explanation || "",
    maxScore: Number(question?.points || question?.max_score || 1),
  };
}

function statusForItem(item) {
  const attemptStatus = normalizeAttemptStatus(item?.attempt?.status);
  if (attemptStatus === "graded") return "Graded";
  if (attemptStatus === "submitted") return "Submitted";
  if (attemptStatus === "grading") return "Grading";
  if (attemptStatus === "in_progress") return "In Progress";

  const now = Date.now();
  const startsAt = item?.startAt ? new Date(item.startAt).getTime() : null;
  const endsAt = item?.endAt ? new Date(item.endAt).getTime() : null;

  if (startsAt && now < startsAt) return "Scheduled";
  if (endsAt && now > endsAt) return "Closed";
  return "Available";
}

function scoreQuestions(questions, answers) {
  return questions.map((question) => {
    const userAnswer = answers[question.id];
    const normalizedUser = String(userAnswer || "").trim();
    const normalizedCorrect = String(question.correctAnswer || "").trim();
    const requiresManualReview =
      question.type === "essay" || question.type === "short_answer";
    const isCorrect =
      question.type === "multiple_choice" || question.type === "true_false"
        ? normalizedUser.toUpperCase() === normalizedCorrect.toUpperCase()
        : null;

    return {
      ...question,
      userAnswer: normalizedUser || "Not answered",
      isCorrect,
      requiresManualReview,
      earnedScore:
        requiresManualReview
          ? null
          : isCorrect
            ? question.maxScore
            : 0,
    };
  });
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

export default function StudentQuiz() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState("assigned");
  const saveTimerRef = useRef(null);

  const loadAssignedQuizzes = async () => {
    setLoading(true);
    try {
      const response = await api.quizzes.listAssignedForStudent();
      setItems(response?.items || []);
    } catch (error) {
      toast.error(error?.message || "Failed to load assigned quizzes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssignedQuizzes();
    return () => clearTimeout(saveTimerRef.current);
  }, []);

  useRealtimeRefresh(loadAssignedQuizzes, {
    shouldRefresh: (event) =>
      ["quiz_publish", "grading", "teacher_review", "grade"].includes(
        String(event?.type || ""),
      ),
  });

  const mergedAnswers = useMemo(
    () => ({
      ...(attempt?.answers || {}),
      ...answers,
    }),
    [answers, attempt?.answers],
  );

  const reviewQuestions = useMemo(
    () => scoreQuestions(questions, mergedAnswers),
    [mergedAnswers, questions],
  );

  useEffect(() => {
    if (!attempt?._id || normalizeAttemptStatus(attempt?.status) !== "in_progress") {
      return;
    }

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        setSavingAnswers(true);
        await api.quizzes.saveAttemptAnswers(attempt._id, { answers: mergedAnswers });
      } catch {
        // keep typing uninterrupted
      } finally {
        setSavingAnswers(false);
      }
    }, 700);

    return () => clearTimeout(saveTimerRef.current);
  }, [attempt?._id, attempt?.status, mergedAnswers]);

  const openAssignedQuiz = async (item) => {
    try {
      const [startRes, contentRes] = await Promise.all([
        api.quizzes.startAssignedQuiz(item._id),
        api.quizzes.getAssignedContent(item._id),
      ]);

      const nextAttempt = startRes?.attempt || null;
      const nextQuestions = (contentRes?.quiz?.questions || []).map(normalizeQuestion);
      const savedAnswers = nextAttempt?.answers || {};

      setActiveItem(contentRes?.assignment || item);
      setQuestions(nextQuestions);
      setAttempt(nextAttempt);
      setAnswers(savedAnswers);
      setStep("take");
    } catch (error) {
      toast.error(error?.message || "Failed to open quiz");
    }
  };

  const openReview = async (item) => {
    try {
      const contentRes = await api.quizzes.getAssignedContent(item._id);
      setActiveItem(contentRes?.assignment || item);
      setQuestions((contentRes?.quiz?.questions || []).map(normalizeQuestion));
      setAttempt(item?.attempt || null);
      setAnswers(item?.attempt?.answers || {});
      setStep("review");
    } catch (error) {
      toast.error(error?.message || "Failed to load quiz review");
    }
  };

  const updateAnswer = (questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const submitQuiz = async () => {
    if (!attempt?._id) {
      toast.error("Quiz attempt not found");
      return;
    }

    const allAnswered = questions.every((question) =>
      String(mergedAnswers[question.id] || "").trim(),
    );
    if (!allAnswered) {
      toast.error("Answer all questions before submitting");
      return;
    }

    try {
      setSubmitting(true);
      const { config } = withRequestId({}, "quiz-submit");
      const response = await api.quizzes.submitAttempt(
        attempt._id,
        {
          answers: mergedAnswers,
        },
        config,
      );
      setAttempt(response?.attempt || attempt);
      setStep("review");
      toast.success("Quiz submitted");
      await loadAssignedQuizzes();
    } catch (error) {
      toast.error(error?.message || "Failed to submit quiz");
    } finally {
      setSubmitting(false);
    }
  };

  const currentScore =
    attempt?.score !== null && attempt?.score !== undefined
      ? Number(attempt.score)
      : 0;

  const summary = useMemo(() => {
    const counts = {
      total: items.length,
      available: 0,
      inProgress: 0,
      submitted: 0,
      graded: 0,
    };

    for (const item of items) {
      const status = statusForItem(item);
      if (status === "Available") counts.available += 1;
      if (status === "In Progress") counts.inProgress += 1;
      if (status === "Submitted" || status === "Grading") counts.submitted += 1;
      if (status === "Graded") counts.graded += 1;
    }

    return counts;
  }, [items]);

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-3">
        <div>
          <h2>Student Quizzes</h2>
          <p className="text-muted mb-0">
            View assigned quizzes, take them inside the schedule window, and review results.
          </p>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button
            className={`btn ${step === "assigned" ? "btn-primary" : "btn-outline-light"}`}
            type="button"
            onClick={() => setStep("assigned")}
          >
            Assigned
          </button>
          <button
            className={`btn ${step === "take" ? "btn-primary" : "btn-outline-light"}`}
            type="button"
            onClick={() => setStep("take")}
            disabled={!questions.length}
          >
            Take
          </button>
          <button
            className={`btn ${step === "review" ? "btn-primary" : "btn-outline-light"}`}
            type="button"
            onClick={() => setStep("review")}
            disabled={!attempt}
          >
            Review
          </button>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-6 col-xl-3">
          <SummaryCard title="Assigned" value={summary.total} />
        </div>
        <div className="col-md-6 col-xl-3">
          <SummaryCard title="Available" value={summary.available} />
        </div>
        <div className="col-md-6 col-xl-3">
          <SummaryCard title="In progress" value={summary.inProgress} />
        </div>
        <div className="col-md-6 col-xl-3">
          <SummaryCard
            title="Reviewed"
            value={summary.graded}
            subtitle={`${summary.submitted} submitted`}
          />
        </div>
      </div>

      {step === "assigned" ? (
        <div className="dash-card">
          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <h3 className="dash-card-title mb-0">
              <FaClipboardList className="me-2" />
              Assigned quizzes
            </h3>
            <span className="badge bg-secondary">{items.length} quizzes</span>
          </div>

          {loading ? (
            <p className="dash-card-muted mb-0">Loading quizzes...</p>
          ) : items.length ? (
            <div className="d-flex flex-column gap-3">
              {items.map((item) => (
                <div key={item._id} className="border rounded p-3 bg-light-subtle">
                  {(() => {
                    const itemStatus = statusForItem(item);
                    const normalizedAttemptStatus = normalizeAttemptStatus(
                      item?.attempt?.status,
                    );
                    const canStart = !["Closed", "Scheduled", "Submitted", "Grading", "Graded"].includes(
                      itemStatus,
                    );

                    return (
                  <>
                  <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                    <div>
                      <div className="fw-semibold">
                        {item.quizId?.title || "Assigned quiz"}
                      </div>
                      <div className="small text-muted">
                        Opens {formatDate(item.startAt)} • Closes {formatDate(item.endAt)}
                      </div>
                    </div>
                    <div className="d-flex gap-2 flex-wrap">
                      <span className="badge bg-secondary">{itemStatus}</span>
                      <span className="badge bg-secondary">
                        <FaClock className="me-1" />
                        {Number(item.durationMinutes || 0)} min
                      </span>
                      {item?.attempt?.score !== null && item?.attempt?.score !== undefined ? (
                        <span className="badge bg-info text-dark">
                          {formatPercent(item.attempt.score)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="d-flex gap-2 flex-wrap mt-3">
                    <button
                      className="btn btn-primary btn-sm"
                      type="button"
                      onClick={() => openAssignedQuiz(item)}
                      disabled={!canStart}
                    >
                      <FaPlay className="me-2" />
                      {normalizedAttemptStatus === "in_progress"
                        ? "Continue"
                        : "Start"}
                    </button>
                    {["submitted", "graded"].includes(normalizedAttemptStatus) ? (
                      <button
                        className="btn btn-outline-light btn-sm"
                        type="button"
                        onClick={() => openReview(item)}
                      >
                        <FaCheckCircle className="me-2" />
                        Review
                      </button>
                    ) : null}
                  </div>
                  </>
                    );
                  })()}
                </div>
              ))}
            </div>
          ) : (
            <p className="dash-card-muted mb-0">No quizzes assigned right now.</p>
          )}
        </div>
      ) : null}

      {step === "take" ? (
        questions.length && normalizeAttemptStatus(attempt?.status) === "in_progress" ? (
          <div className="dash-card">
            <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
              <div>
                <h3 className="dash-card-title mb-1">
                  {activeItem?.quizId?.title || "Take quiz"}
                </h3>
                <p className="dash-card-muted mb-0">
                  Autosave is enabled while you work.
                </p>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                {savingAnswers ? (
                  <span className="badge bg-secondary">Saving...</span>
                ) : null}
                <span className="badge bg-secondary">
                  {questions.filter((question) => mergedAnswers[question.id]).length}/
                  {questions.length} answered
                </span>
              </div>
            </div>

            <div className="d-flex flex-column gap-3 mt-4">
              {questions.map((question, index) => (
                <div key={question.id} className="border rounded p-3 bg-light-subtle">
                  <div className="fw-semibold mb-2">
                    Question {index + 1}
                  </div>
                  <p>{question.questionText}</p>

                  {question.type === "multiple_choice" ? (
                    <div className="d-flex flex-column gap-2">
                      {question.options.map((option, optionIndex) => {
                        const letter = String.fromCharCode(65 + optionIndex);
                        return (
                          <label key={letter} className="border rounded p-2 bg-white">
                            <input
                              className="me-2"
                              type="radio"
                              name={`question-${question.id}`}
                              checked={mergedAnswers[question.id] === letter}
                              onChange={() => updateAnswer(question.id, letter)}
                            />
                            <b>{letter}.</b> {option}
                          </label>
                        );
                      })}
                    </div>
                  ) : question.type === "true_false" ? (
                    <div className="d-flex gap-2 flex-wrap">
                      {["true", "false"].map((value) => (
                        <button
                          key={value}
                          className={`btn ${
                            mergedAnswers[question.id] === value
                              ? "btn-primary"
                              : "btn-outline-light"
                          }`}
                          type="button"
                          onClick={() => updateAnswer(question.id, value)}
                        >
                          {value === "true" ? "True" : "False"}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <textarea
                      className="form-control"
                      rows={5}
                      value={mergedAnswers[question.id] || ""}
                      onChange={(event) =>
                        updateAnswer(question.id, event.target.value)
                      }
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="d-flex gap-2 flex-wrap mt-4">
              <button
                className="btn btn-primary"
                type="button"
                onClick={submitQuiz}
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit quiz"}
              </button>
              <button
                className="btn btn-outline-light"
                type="button"
                onClick={() => setStep("assigned")}
              >
                Back to assigned
              </button>
            </div>
          </div>
        ) : (
          <div className="dash-card">
            <p className="dash-card-muted mb-0">
              Start or continue an assigned quiz to answer questions here.
            </p>
          </div>
        )
      ) : null}

      {step === "review" ? (
        attempt ? (
          <div className="dash-card">
            <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <div>
                <h3 className="dash-card-title mb-1">
                  {activeItem?.quizId?.title || "Quiz review"}
                </h3>
                <p className="dash-card-muted mb-0">
                  Score {currentScore}% • Status {attempt?.status || "submitted"}
                </p>
              </div>
              <button
                className="btn btn-outline-light"
                type="button"
                onClick={() => setStep("assigned")}
              >
                Back to assigned
              </button>
            </div>

            <div className="d-flex flex-column gap-3">
              {reviewQuestions.map((question, index) => (
                <div key={question.id} className="border rounded p-3 bg-light-subtle">
                  <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
                    <div>
                      <div className="fw-semibold">Question {index + 1}</div>
                      <p className="mb-2">{question.questionText}</p>
                    </div>
                    <span className="badge bg-secondary">
                      {question.requiresManualReview
                        ? "Manual review"
                        : `${question.earnedScore}/${question.maxScore}`}
                    </span>
                  </div>

                  <div className="small text-muted">
                    <b>Your answer:</b> {question.userAnswer}
                  </div>
                  {question.correctAnswer && !question.requiresManualReview ? (
                    <div className="small text-muted mt-1">
                      <b>Correct answer:</b> {question.correctAnswer}
                    </div>
                  ) : null}
                  {question.requiresManualReview ? (
                    <div className="small text-muted mt-1">
                      <b>Teacher review:</b> Written responses are reviewed manually before a final score is confirmed.
                    </div>
                  ) : null}
                  {attempt?.feedback ? (
                    <div className="small text-muted mt-2">
                      <b>Teacher feedback:</b> {attempt.feedback}
                    </div>
                  ) : null}
                  {question.explanation ? (
                    <div className="small text-muted mt-2">
                      <b>Explanation:</b> {question.explanation}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="dash-card">
            <p className="dash-card-muted mb-0">
              Submit a quiz first to review it here.
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}
