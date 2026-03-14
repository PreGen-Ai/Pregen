// src/pages/quizzes/StudentQuiz.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import "../../styles/dashboard.css";
import "../../styles/QuizGenerator.css";

import {
  FaClock,
  FaFileAlt,
  FaCheckCircle,
  FaExclamationTriangle,
  FaRegLightbulb,
  FaChartLine,
  FaClipboardList,
  FaPlay,
} from "react-icons/fa";

// =====================
// Base URLs
// =====================
const API_BASE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : "https://preprod-pregen.onrender.com";

const PDF_API_BASE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : "https://preprod-pregen.onrender.com";

// =====================
// Axios instances
// =====================
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
});

const pdfApi = axios.create({
  baseURL: PDF_API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
});

// =====================
// Small helpers
// =====================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const safeFileName = (s = "quiz") =>
  String(s)
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);

const postWithRetry = async (client, url, data, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await client.post(url, data);
    } catch (err) {
      const status = err?.response?.status;
      const isLast = i === retries - 1;
      if (isLast) throw err;
      await sleep(700 * (i + 1));
      if (status && status < 500 && status !== 429) throw err;
    }
  }
};

const patchWithRetry = async (client, url, data, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await client.patch(url, data);
    } catch (err) {
      const status = err?.response?.status;
      const isLast = i === retries - 1;
      if (isLast) throw err;
      await sleep(700 * (i + 1));
      if (status && status < 500 && status !== 429) throw err;
    }
  }
};

const getWithRetry = async (client, url, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await client.get(url);
    } catch (err) {
      const status = err?.response?.status;
      const isLast = i === retries - 1;
      if (isLast) throw err;
      await sleep(700 * (i + 1));
      if (status && status < 500 && status !== 429) throw err;
    }
  }
};

const getErrorMessage = (err, fallback) =>
  err?.response?.data?.detail ||
  err?.response?.data?.message ||
  err?.response?.data?.error ||
  err?.message ||
  fallback;

const formatDateTime = (value) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const getScheduleStatus = (assignment, attempt) => {
  const now = new Date();
  const startsAt = new Date(assignment.startsAt || assignment.startAt);
  const endsAt = new Date(assignment.endsAt || assignment.endAt);

  if (attempt?.status === "Submitted") return "Submitted";
  if (attempt?.status === "Expired") return "Expired";
  if (attempt?.status === "InProgress") return "In Progress";
  if (now < startsAt) return "Scheduled";
  if (now > endsAt) return "Closed";
  return "Available";
};

const normalizeQuizFromApi = (quizData = []) =>
  quizData.map((q, index) => {
    const base = {
      id: q.id || `q${index + 1}`,
      question: q.question || `Question ${index + 1}`,
      explanation: q.explanation || "",
      type: q.type || "multiple_choice",
      max_score: q.max_score || (q.type === "essay" ? 10 : 1),
    };

    if (q.type === "essay") {
      return {
        ...base,
        type: "essay",
        correctAnswer: q.expected_answer || q.answer || "Essay question",
        rubric_points: q.rubric
          ? String(q.rubric)
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : ["Clear thesis", "Evidence", "Structure"],
        expected_answer: q.expected_answer,
        solution_steps: q.solution_steps,
      };
    }

    let correctAnswer = "A";
    if (q.correct_answer) correctAnswer = q.correct_answer;
    else if (q.answer) correctAnswer = q.answer;
    else if (q.correctAnswer) correctAnswer = q.correctAnswer;

    if (typeof correctAnswer === "string") {
      const letterMatch = correctAnswer.match(/^([A-D])[\.\)]/);
      if (letterMatch) correctAnswer = letterMatch[1];
      else if (correctAnswer.length === 1 && /[A-D]/i.test(correctAnswer)) {
        correctAnswer = correctAnswer.toUpperCase();
      } else {
        correctAnswer = "A";
      }
    }

    return {
      ...base,
      type: "multiple_choice",
      options: q.options || ["Option A", "Option B", "Option C", "Option D"],
      correctAnswer,
    };
  });

// =====================
// Main Page
// =====================
export default function StudentQuiz() {
  const [step, setStep] = useState(1); // 1=assigned 2=take 3=review
  const [mobileTab, setMobileTab] = useState("assigned");
  const [isMobile, setIsMobile] = useState(
    window.matchMedia("(max-width: 991px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 991px)");
    const onChange = () => setIsMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    if (mobileTab === "assigned") setStep(1);
    if (mobileTab === "take") setStep(2);
    if (mobileTab === "review") setStep(3);
  }, [mobileTab, isMobile]);

  const Actions = useMemo(() => {
    const Btn = ({ active, children, onClick }) => (
      <button
        className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-light"}`}
        onClick={onClick}
        type="button"
      >
        {children}
      </button>
    );

    return (
      <div className="d-flex gap-2 flex-wrap">
        <Btn
          active={isMobile ? mobileTab === "assigned" : step === 1}
          onClick={() => (isMobile ? setMobileTab("assigned") : setStep(1))}
        >
          Assigned
        </Btn>
        <Btn
          active={isMobile ? mobileTab === "take" : step === 2}
          onClick={() => (isMobile ? setMobileTab("take") : setStep(2))}
        >
          Take
        </Btn>
        <Btn
          active={isMobile ? mobileTab === "review" : step === 3}
          onClick={() => (isMobile ? setMobileTab("review") : setStep(3))}
        >
          Review
        </Btn>
      </div>
    );
  }, [isMobile, mobileTab, step]);

  return (
    <div className="quizzes-page">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h2>Student Quizzes</h2>
          <p className="text-muted">
            View assigned quizzes, take them inside the schedule window, review
            your result.
          </p>
        </div>
        {Actions}
      </div>

      <StudentQuizCore
        step={step}
        setStep={setStep}
        isMobile={isMobile}
        setMobileTab={setMobileTab}
      />
    </div>
  );
}

// =====================
// Core
// =====================
function StudentQuizCore({ step, setStep, isMobile, setMobileTab }) {
  const [assignedQuizzes, setAssignedQuizzes] = useState([]);
  const [currentAssignment, setCurrentAssignment] = useState(null);
  const [currentQuiz, setCurrentQuiz] = useState([]);
  const [currentAttempt, setCurrentAttempt] = useState(null);

  const [userAnswers, setUserAnswers] = useState({});
  const [essayAnswers, setEssayAnswers] = useState({});

  const [reviewReady, setReviewReady] = useState(false);
  const [score, setScore] = useState(0);
  const [timeSpent, setTimeSpent] = useState(0);
  const [tick, setTick] = useState(0);

  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [loadingAttempt, setLoadingAttempt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingAnswers, setSavingAnswers] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  const [alert, setAlert] = useState(null);

  const timerRef = useRef(null);
  const saveTimerRef = useRef(null);
  const ignoreNextSaveRef = useRef(true);

  useEffect(() => {
    loadAssignedQuizzes();
  }, []);

  useEffect(() => {
    const active = currentAttempt?.status === "InProgress";
    if (active) {
      timerRef.current = setInterval(() => {
        setTimeSpent((prev) => prev + 1);
        setTick((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [currentAttempt?.status]);

  const formatTime = (sec) =>
    `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

  const answeredCount = useMemo(() => {
    const mc = Object.keys(userAnswers).length;
    const es = Object.keys(essayAnswers).length;
    return mc + es;
  }, [userAnswers, essayAnswers]);

  const allQuestionsAnswered = () =>
    currentQuiz.every((q) => {
      if (q.type === "multiple_choice") return userAnswers[q.id] !== undefined;
      return (essayAnswers[q.id] || "").trim().length > 0;
    });

  const getPerformanceMessage = (pct) => {
    if (pct >= 90) return "Excellent performance.";
    if (pct >= 80) return "Great job.";
    if (pct >= 70) return "Good work.";
    if (pct >= 60) return "Solid attempt. Review the explanations.";
    return "Keep practicing and review the explanations carefully.";
  };

  const expiresAt = currentAttempt?.expiresAt
    ? new Date(currentAttempt.expiresAt)
    : null;

  const timeRemaining = useMemo(() => {
    if (!expiresAt) return null;
    return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  }, [expiresAt, tick]);

  useEffect(() => {
    if (currentAttempt?.status === "InProgress" && timeRemaining === 0) {
      setAlert({
        type: "error",
        message:
          "Time ended. Please refresh if the attempt was auto-submitted by the server.",
      });
    }
  }, [timeRemaining, currentAttempt?.status]);

  const reviewQuestions = useMemo(() => {
    const mergedAnswers = {
      ...userAnswers,
      ...essayAnswers,
      ...(currentAttempt?.answers || {}),
    };

    return currentQuiz.map((q) => {
      const rawUserAnswer = mergedAnswers[q.id];
      let isCorrect = false;
      let overall_score = 0;

      if (q.type === "multiple_choice") {
        const ua = String(rawUserAnswer || "")
          .trim()
          .toUpperCase();
        const ca = String(q.correctAnswer || "")
          .trim()
          .toUpperCase();
        isCorrect = ua === ca;
        overall_score = isCorrect ? Number(q.max_score || 1) : 0;
      } else {
        overall_score = rawUserAnswer ? Number(q.max_score || 10) : 0;
      }

      return {
        ...q,
        userAnswer: rawUserAnswer || "Not answered",
        isCorrect,
        overall_score,
      };
    });
  }, [currentQuiz, currentAttempt?.answers, essayAnswers, userAnswers]);

  const loadAssignedQuizzes = async () => {
    setLoadingAssigned(true);
    try {
      const res = await getWithRetry(api, "/api/quizzes/student/my");
      setAssignedQuizzes(res?.data?.items || []);
    } catch (err) {
      setAlert({
        type: "error",
        message: getErrorMessage(err, "Failed to load assigned quizzes."),
      });
    } finally {
      setLoadingAssigned(false);
    }
  };

  const openAssignment = async (assignmentId) => {
    setLoadingAttempt(true);
    setAlert(null);

    try {
      const [startRes, contentRes] = await Promise.all([
        postWithRetry(
          api,
          `/api/quizzes/assignments/${assignmentId}/start`,
          {},
        ),
        getWithRetry(api, `/api/quizzes/assignments/${assignmentId}/content`),
      ]);

      const attempt = startRes?.data?.attempt || null;
      const assignment = contentRes?.data?.assignment || null;
      const quiz = normalizeQuizFromApi(
        contentRes?.data?.quiz?.questions || [],
      );

      const savedAnswers = attempt?.answers || {};
      const nextMcqAnswers = {};
      const nextEssayAnswers = {};

      quiz.forEach((q) => {
        if (q.type === "essay") {
          nextEssayAnswers[q.id] = savedAnswers[q.id] || "";
        } else if (savedAnswers[q.id] != null) {
          nextMcqAnswers[q.id] = savedAnswers[q.id];
        }
      });

      ignoreNextSaveRef.current = true;

      setCurrentAssignment(assignment);
      setCurrentQuiz(quiz);
      setCurrentAttempt(attempt);
      setUserAnswers(nextMcqAnswers);
      setEssayAnswers(nextEssayAnswers);
      setTimeSpent(0);
      setReviewReady(false);

      setStep(2);
      if (isMobile) setMobileTab("take");
    } catch (err) {
      setAlert({
        type: "error",
        message: getErrorMessage(err, "Failed to open quiz."),
      });
    } finally {
      setLoadingAttempt(false);
    }
  };

  const openSubmittedReview = async (item) => {
    setLoadingAttempt(true);
    setAlert(null);

    try {
      const contentRes = await getWithRetry(
        api,
        `/api/quizzes/assignments/${item._id}/content`,
      );

      const assignment = contentRes?.data?.assignment || item;
      const quiz = normalizeQuizFromApi(
        contentRes?.data?.quiz?.questions || [],
      );
      const attempt = item.attempt || null;
      const savedAnswers = attempt?.answers || {};

      const nextMcqAnswers = {};
      const nextEssayAnswers = {};

      quiz.forEach((q) => {
        if (q.type === "essay") {
          nextEssayAnswers[q.id] = savedAnswers[q.id] || "";
        } else if (savedAnswers[q.id] != null) {
          nextMcqAnswers[q.id] = savedAnswers[q.id];
        }
      });

      setCurrentAssignment(assignment);
      setCurrentQuiz(quiz);
      setCurrentAttempt(attempt);
      setUserAnswers(nextMcqAnswers);
      setEssayAnswers(nextEssayAnswers);
      setScore(Number(attempt?.score || 0));
      setReviewReady(true);

      setStep(3);
      if (isMobile) setMobileTab("review");
    } catch (err) {
      setAlert({
        type: "error",
        message: getErrorMessage(err, "Failed to load review."),
      });
    } finally {
      setLoadingAttempt(false);
    }
  };

  const handleAnswerSelect = (questionId, selectedOption) => {
    setUserAnswers((prev) => ({ ...prev, [questionId]: selectedOption }));
  };

  const handleEssayAnswer = (questionId, answer) => {
    setEssayAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  useEffect(() => {
    if (!currentAttempt?._id || currentAttempt?.status !== "InProgress") return;

    const mergedAnswers = {
      ...userAnswers,
      ...essayAnswers,
    };

    if (ignoreNextSaveRef.current) {
      ignoreNextSaveRef.current = false;
      return;
    }

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        setSavingAnswers(true);
        await patchWithRetry(
          api,
          `/api/quizzes/attempts/${currentAttempt._id}/answers`,
          { answers: mergedAnswers },
        );
      } catch {
        // keep silent while typing
      } finally {
        setSavingAnswers(false);
      }
    }, 700);

    return () => clearTimeout(saveTimerRef.current);
  }, [userAnswers, essayAnswers, currentAttempt?._id, currentAttempt?.status]);

  const submitQuiz = async () => {
    if (!allQuestionsAnswered()) {
      setAlert({ type: "error", message: "Please answer all questions." });
      return;
    }

    if (!currentAttempt?._id) {
      setAlert({ type: "error", message: "Attempt not found." });
      return;
    }

    setSubmitting(true);
    setAlert(null);

    try {
      const answers = {
        ...userAnswers,
        ...essayAnswers,
      };

      const res = await postWithRetry(
        api,
        `/api/quizzes/attempts/${currentAttempt._id}/submit`,
        { answers },
      );

      const nextAttempt = res?.data?.attempt || {
        ...currentAttempt,
        answers,
        score:
          res?.data?.attempt?.score ??
          res?.data?.score ??
          currentAttempt?.score ??
          0,
        status: "Submitted",
        submittedAt: new Date().toISOString(),
      };

      setCurrentAttempt(nextAttempt);
      setScore(Number(nextAttempt?.score || 0));
      setReviewReady(true);

      setAlert({
        type: "success",
        message: "Quiz submitted successfully.",
      });

      await loadAssignedQuizzes();

      setStep(3);
      if (isMobile) setMobileTab("review");
    } catch (err) {
      setAlert({
        type: "error",
        message: getErrorMessage(err, "Failed to submit quiz."),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetCurrentQuiz = () => {
    setCurrentAssignment(null);
    setCurrentQuiz([]);
    setCurrentAttempt(null);
    setUserAnswers({});
    setEssayAnswers({});
    setReviewReady(false);
    setScore(0);
    setTimeSpent(0);
    setTick(0);
  };

  const generatePDFReport = async () => {
    if (!reviewReady || currentQuiz.length === 0) {
      setAlert({ type: "error", message: "Nothing to export yet." });
      return;
    }

    setPdfGenerating(true);
    setAlert(null);

    try {
      const pdfContent = `<!DOCTYPE html>
<html>
<head>
  <title>Quiz Report</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; color:#111827; line-height:1.6; }
    .cover {
      height:100vh;
      display:flex; flex-direction:column;
      align-items:center; justify-content:center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color:#fff; padding:48px; text-align:center;
    }
    .cover h1 { font-size:42px; margin-bottom:10px; }
    .cover p { font-size:18px; opacity:0.95; margin-bottom:18px; }
    .meta {
      width:min(720px, 100%);
      background: rgba(255,255,255,0.12);
      border:1px solid rgba(255,255,255,0.18);
      padding:22px; border-radius:16px;
      text-align:left;
      display:grid; grid-template-columns: 1fr 1fr; gap:12px;
    }
    .meta b { opacity:0.9; display:block; font-size:12px; }
    .meta span { font-size:14px; }
    .page { padding:40px; page-break-before:always; }
    .header { border-bottom:2px solid #667eea; padding-bottom:14px; margin-bottom:22px; }
    .scoreBox {
      border:1px solid #e5e7eb;
      border-radius:14px;
      padding:18px;
      background:#f8fafc;
      margin:18px 0;
    }
    .score { font-size:34px; font-weight:700; color:#111827; }
    .muted { color:#6b7280; }
    .q {
      border-left:6px solid #667eea;
      background:#f8fafc;
      padding:16px;
      border-radius:0 12px 12px 0;
      margin:16px 0;
      page-break-inside:avoid;
    }
    .q.correct { border-left-color:#16a34a; background:#f0fdf4; }
    .q.incorrect { border-left-color:#dc2626; background:#fef2f2; }
    .row { margin-top:8px; padding:10px; background:#fff; border-radius:10px; border:1px solid #e5e7eb; }
    .printBtn { position:fixed; top:16px; left:16px; background:#111827; color:#fff; border:0; padding:10px 14px; border-radius:10px; cursor:pointer; }
    @media print { .printBtn { display:none; } }
  </style>
</head>
<body>
  <button class="printBtn" onclick="window.print()">Download PDF</button>

  <section class="cover">
    <h1>Quiz Performance Report</h1>
    <p>${currentAssignment?.quizId?.title || "Quiz"}</p>

    <div class="meta">
      <div><b>Score</b><span>${score}%</span></div>
      <div><b>Date</b><span>${new Date().toLocaleDateString()}</span></div>
      <div><b>Time Spent</b><span>${formatTime(timeSpent)}</span></div>
      <div><b>Status</b><span>${currentAttempt?.status || "Submitted"}</span></div>
    </div>
  </section>

  <section class="page">
    <div class="header">
      <h2>Question Breakdown</h2>
      <div class="muted">Per-question review</div>
    </div>

    ${reviewQuestions
      .map(
        (q, idx) => `
      <div class="q ${q.type === "essay" ? "" : q.isCorrect ? "correct" : "incorrect"}">
        <h3>Question ${idx + 1}</h3>
        <div>${q.question}</div>

        <div class="row">
          <div><b>Your Answer:</b> ${q.userAnswer || "Not answered"}</div>
          ${
            q.type !== "essay" && !q.isCorrect
              ? `<div><b>Correct Answer:</b> ${q.correctAnswer}</div>`
              : ""
          }
          <div><b>Score:</b> ${q.overall_score || 0}/${q.max_score}</div>
        </div>

        ${
          q.explanation
            ? `<div class="row"><b>Explanation:</b> ${q.explanation}</div>`
            : ""
        }
      </div>
    `,
      )
      .join("")}
  </section>
</body>
</html>`;

      const reportWindow = window.open("", "_blank");
      reportWindow.document.write(pdfContent);
      reportWindow.document.close();

      const res = await postWithRetry(pdfApi, "/api/documents/export-pdf", {
        html: pdfContent,
        filename: `${safeFileName(
          `Quiz_Report_${currentAssignment?.quizId?.title || "quiz"}`,
        )}.pdf`,
      });

      const contentType = res.headers?.["content-type"] || "";

      if (contentType.includes("application/pdf")) {
        const blob = new Blob([res.data], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${safeFileName(
          `Quiz_Report_${currentAssignment?.quizId?.title || "quiz"}`,
        )}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (res.data?.url) {
        window.open(res.data.url, "_blank");
      }

      setAlert({ type: "success", message: "PDF report generated." });
    } catch {
      setAlert({ type: "error", message: "Failed to generate PDF report." });
    } finally {
      setPdfGenerating(false);
    }
  };

  const renderQuestion = (question) => {
    if (question.type === "essay") {
      const words =
        essayAnswers[question.id]?.split(/\s+/).filter((w) => w.length > 0)
          .length || 0;

      return (
        <div className="pg-quiz__essay">
          <textarea
            placeholder="Write your answer here..."
            value={essayAnswers[question.id] || ""}
            onChange={(e) => handleEssayAnswer(question.id, e.target.value)}
            rows={7}
            className="pg-quiz__textarea"
          />
          <div className="pg-quiz__metaRow">
            <span className="pg-chip pg-chip--muted">Word count: {words}</span>
          </div>

          {question.rubric_points?.length ? (
            <div className="pg-quiz__rubric">
              <div className="pg-quiz__rubricTitle">Rubric</div>
              <ul className="pg-quiz__rubricList">
                {question.rubric_points.map((p, idx) => (
                  <li key={idx}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="pg-quiz__optionsGrid">
        {(question.options || []).map((option, index) => {
          const letter = String.fromCharCode(65 + index);
          const selected = userAnswers[question.id] === letter;

          return (
            <label
              key={index}
              className={`pg-option ${selected ? "is-selected" : ""}`}
            >
              <input
                type="radio"
                name={`question-${question.id}`}
                value={letter}
                onChange={() => handleAnswerSelect(question.id, letter)}
                checked={selected}
              />
              <span className="pg-option__letter">{letter}</span>
              <span className="pg-option__text">{option}</span>
            </label>
          );
        })}
      </div>
    );
  };

  const AssignedSection = (
    <div className="dash-card">
      <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
        <div>
          <h3 className="dash-card-title d-flex align-items-center gap-2">
            <FaClipboardList /> Assigned Quizzes
          </h3>
          <p className="dash-card-muted mb-0">
            Start a quiz only inside the scheduled window. You can submit once
            only.
          </p>
        </div>

        <div className="d-flex gap-2 flex-wrap">
          <span className="badge bg-secondary">
            {assignedQuizzes.length} quizzes
          </span>
          {loadingAssigned ? (
            <span className="badge bg-secondary">Loading...</span>
          ) : null}
        </div>
      </div>

      {alert ? (
        <div className={`pg-alert pg-alert--${alert.type} mt-3`}>
          <div className="pg-alert__icon">
            {alert.type === "success" ? (
              <FaCheckCircle />
            ) : alert.type === "error" ? (
              <FaExclamationTriangle />
            ) : (
              <FaRegLightbulb />
            )}
          </div>
          <div className="pg-alert__text">{alert.message}</div>
        </div>
      ) : null}

      <div className="pg-quiz__breakdown mt-3">
        {assignedQuizzes.length === 0 ? (
          <div className="pg-note">
            <b>No quizzes assigned right now.</b>
          </div>
        ) : (
          assignedQuizzes.map((item) => (
            <div key={item._id} className="pg-result">
              <div className="pg-result__top">
                <div className="pg-result__left">
                  <div className="pg-result__q">
                    {item.quizId?.title || "Quiz"}
                    <span className="pg-muted ms-2">
                      ({item.classId?.name || "Class"})
                    </span>
                  </div>
                  <div className="pg-result__text">
                    Opens: {formatDateTime(item.startsAt || item.startAt)} |
                    Closes: {formatDateTime(item.endsAt || item.endAt)}
                  </div>
                </div>

                <div className="pg-result__right">
                  <span className="pg-pill pg-pill--ok">
                    {getScheduleStatus(item, item.attempt)}
                  </span>
                </div>
              </div>

              <div className="mt-3 d-flex gap-2 flex-wrap">
                <span className="pg-chip pg-chip--muted">
                  <FaClock /> {item.durationMinutes} min
                </span>

                {item.attempt?.score != null ? (
                  <span className="pg-chip">{item.attempt.score}%</span>
                ) : null}
              </div>

              <div className="pg-actions mt-3">
                <button
                  onClick={() => openAssignment(item._id)}
                  disabled={
                    loadingAttempt ||
                    item.attempt?.status === "Submitted" ||
                    item.attempt?.status === "Expired"
                  }
                  className="pg-btn pg-btn--primary"
                  type="button"
                >
                  <FaPlay />
                  <span className="ms-2">
                    {item.attempt?.status === "InProgress"
                      ? "Continue"
                      : "Start"}
                  </span>
                </button>

                {item.attempt?.status === "Submitted" ? (
                  <button
                    onClick={() => openSubmittedReview(item)}
                    className="pg-btn pg-btn--secondary"
                    type="button"
                  >
                    Review
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const TakeSection =
    currentQuiz.length > 0 && currentAttempt?.status === "InProgress" ? (
      <div className="dash-card">
        <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
          <div>
            <h3 className="dash-card-title">
              Take Quiz{" "}
              <span className="dash-card-muted">
                ({currentAssignment?.quizId?.title || "Assigned Quiz"})
              </span>
            </h3>
            <p className="dash-card-muted mb-0">
              Server-side schedule and one-attempt rules are active.
            </p>
          </div>

          <div className="d-flex gap-2 flex-wrap">
            <span className="pg-chip pg-chip--muted">
              <FaClock /> {formatTime(timeSpent)}
            </span>
            <span className="pg-chip">
              {answeredCount}/{currentQuiz.length} answered
            </span>
            {timeRemaining != null ? (
              <span className="pg-chip">
                Remaining: {formatTime(timeRemaining)}
              </span>
            ) : null}
            {savingAnswers ? (
              <span className="pg-chip pg-chip--ok">Saving...</span>
            ) : null}
          </div>
        </div>

        <div className="pg-quiz__questions mt-3">
          {currentQuiz.map((q, idx) => (
            <div key={q.id} className="pg-qcard">
              <div className="pg-qcard__top">
                <div className="pg-qcard__title">
                  Question {idx + 1}
                  <span
                    className={`pg-badge ${
                      q.type === "essay" ? "pg-badge--purple" : "pg-badge--cyan"
                    }`}
                  >
                    {q.type === "essay" ? "Essay" : "Multiple Choice"}
                  </span>
                </div>
                <div className="pg-qcard__marks">
                  {q.max_score} {q.max_score === 1 ? "mark" : "marks"}
                </div>
              </div>

              <div className="pg-qcard__question">{q.question}</div>
              {renderQuestion(q)}
            </div>
          ))}
        </div>

        <div className="pg-quiz__submit">
          <button
            onClick={submitQuiz}
            disabled={!allQuestionsAnswered() || submitting}
            className="pg-btn pg-btn--primary"
            type="button"
          >
            {submitting ? "Submitting..." : "Submit Quiz"}
          </button>

          <button
            className="pg-btn pg-btn--ghost"
            type="button"
            onClick={() => {
              setStep(1);
              if (isMobile) setMobileTab("assigned");
            }}
          >
            Back to Assigned
          </button>

          <div className="pg-muted pg-quiz__hint">
            {allQuestionsAnswered()
              ? "All questions answered. Ready to submit."
              : `Answer all ${currentQuiz.length} questions to submit.`}
          </div>
        </div>
      </div>
    ) : (
      <div className="dash-card">
        <h3 className="dash-card-title">Take</h3>
        <p className="dash-card-muted">
          Start an assigned quiz first, then come back here to answer.
        </p>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            setStep(1);
            if (isMobile) setMobileTab("assigned");
          }}
        >
          Go to Assigned
        </button>
      </div>
    );

  const ReviewSection =
    reviewReady && currentQuiz.length > 0 ? (
      <div className="dash-card">
        <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
          <div>
            <h3 className="dash-card-title">Review</h3>
            <p className="dash-card-muted mb-0">
              {getPerformanceMessage(score)}
            </p>
          </div>

          <div className="d-flex align-items-center gap-2 flex-wrap">
            <span className="pg-chip pg-chip--muted">
              <FaClock /> {formatTime(timeSpent)}
            </span>

            <button
              onClick={generatePDFReport}
              disabled={pdfGenerating}
              className="btn btn-outline-light btn-sm d-flex align-items-center gap-2"
              type="button"
            >
              <FaFileAlt />
              {pdfGenerating ? "Generating PDF..." : "Download PDF"}
            </button>

            <button
              onClick={() => {
                resetCurrentQuiz();
                setStep(1);
                if (isMobile) setMobileTab("assigned");
              }}
              className="btn btn-primary btn-sm"
              type="button"
            >
              Back to Assigned
            </button>
          </div>
        </div>

        <div
          className="mt-3"
          style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
        >
          <span className="badge bg-secondary">Score: {score}%</span>
          <span className="badge bg-secondary">
            Quiz: {currentAssignment?.quizId?.title || "—"}
          </span>
          <span className="badge bg-secondary">
            Status: {currentAttempt?.status || "Submitted"}
          </span>
        </div>

        <div className="pg-quiz__breakdownTitle mt-4">
          <FaChartLine /> Question Breakdown
        </div>

        <div className="pg-quiz__breakdown">
          {reviewQuestions.map((q, index) => (
            <div
              key={q.id}
              className={`pg-result ${
                q.type === "essay"
                  ? ""
                  : q.isCorrect
                    ? "is-correct"
                    : "is-wrong"
              }`}
            >
              <div className="pg-result__top">
                <div className="pg-result__left">
                  <div className="pg-result__q">
                    Q{index + 1} <span className="pg-muted">({q.type})</span>
                  </div>
                  <div className="pg-result__text">{q.question}</div>
                </div>

                <div className="pg-result__right">
                  <span
                    className={`pg-pill ${
                      q.type === "essay"
                        ? "pg-pill--ok"
                        : q.isCorrect
                          ? "pg-pill--ok"
                          : "pg-pill--bad"
                    }`}
                  >
                    {q.type === "essay"
                      ? "Submitted"
                      : q.isCorrect
                        ? "Correct"
                        : "Incorrect"}{" "}
                    ({q.overall_score}/{q.max_score})
                  </span>
                </div>
              </div>

              <div className="pg-result__answers">
                <div className="pg-kv">
                  <div className="pg-kv__k">Your Answer</div>
                  <div
                    className={`pg-kv__v ${
                      q.type !== "essay" && !q.isCorrect ? "is-bad" : ""
                    }`}
                  >
                    {q.userAnswer || "Not answered"}
                  </div>
                </div>

                {q.type !== "essay" && !q.isCorrect ? (
                  <div className="pg-kv">
                    <div className="pg-kv__k">Correct Answer</div>
                    <div className="pg-kv__v is-ok">{q.correctAnswer}</div>
                  </div>
                ) : null}
              </div>

              {q.explanation ? (
                <div className="pg-note">
                  <b>Explanation:</b> {q.explanation}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className="dash-card">
        <h3 className="dash-card-title">Review</h3>
        <p className="dash-card-muted">
          Submit a quiz first, then you can review the result here.
        </p>
        <div className="d-flex gap-2 flex-wrap">
          <button
            className="btn btn-outline-light"
            type="button"
            onClick={() => {
              setStep(1);
              if (isMobile) setMobileTab("assigned");
            }}
          >
            Go to Assigned
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setStep(2);
              if (isMobile) setMobileTab("take");
            }}
            disabled={currentQuiz.length === 0}
          >
            Go to Take
          </button>
        </div>
      </div>
    );

  return (
    <div className="dash-card" style={{ padding: 0 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 12,
          padding: 14,
        }}
      >
        {step === 1 ? AssignedSection : null}
        {step === 2 ? TakeSection : null}
        {step === 3 ? ReviewSection : null}
      </div>
    </div>
  );
}
