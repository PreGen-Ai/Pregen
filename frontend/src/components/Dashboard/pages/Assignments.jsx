import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import "../../styles/dashboard.css";
import "../../styles/Assignments.css";

import { FaCalculator } from "react-icons/fa";
import Casio from "../../casio";
import { latexToImage } from "../../../utils/latexToImage";

// Environment-safe API Base URLs
const ASSIGNMENT_API_BASE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:8000"
    : "https://pregen.onrender.com";

const PDF_API_BASE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : "https://preprod-pregen.onrender.com";

// Axios instances
const assignmentApi = axios.create({
  baseURL: ASSIGNMENT_API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
});

const pdfApi = axios.create({
  baseURL: PDF_API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
});

// Util: safe filename
const safeFileName = (s = "assignment") =>
  String(s)
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_");

// Util: normalize text for PDF
const normalizeText = (str = "") =>
  String(str).replace(/\s+/g, " ").replace(/\n+/g, " ").trim();

/** -----------------------------
 * Robust API service
 * ----------------------------- */
const apiService = {
  async postWithRetry(apiInstance, endpoint, data, config = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await apiInstance.post(endpoint, data, config);
        return response.data;
      } catch (error) {
        console.error(`API POST failed (${i + 1}/${retries})`, {
          endpoint,
          status: error.response?.status,
          message: error.message,
        });

        if (i === retries - 1) {
          const enhancedError = new Error(
            error.response?.data?.detail ||
              error.response?.data?.message ||
              error.message ||
              `API call to ${endpoint} failed`,
          );
          enhancedError.status = error.response?.status;
          enhancedError.data = error.response?.data;
          throw enhancedError;
        }

        await new Promise((r) => setTimeout(r, 900 * (i + 1)));
      }
    }
  },

  async getWithRetry(apiInstance, endpoint, config = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await apiInstance.get(endpoint, config);
        return response.data;
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise((r) => setTimeout(r, 900 * (i + 1)));
      }
    }
  },

  // Assignment endpoints
  generateAssignment(data, config) {
    return this.postWithRetry(
      assignmentApi,
      "/api/assignments/generate",
      data,
      config,
    );
  },
  validateAssignment(data, config) {
    return this.postWithRetry(
      assignmentApi,
      "/api/assignments/validate",
      data,
      config,
    );
  },
  uploadAssignmentFile(formData, config) {
    return this.postWithRetry(
      assignmentApi,
      "/api/assignments/upload",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        ...(config || {}),
      },
    );
  },
  saveAssignmentReport(data, config) {
    return this.postWithRetry(
      assignmentApi,
      "/api/assignments/report",
      data,
      config,
    );
  },
  gradeAssignment(data, config) {
    return this.postWithRetry(
      assignmentApi,
      "/api/assignments/grade",
      data,
      config,
    );
  },
  getAssignmentById(assignmentId, config) {
    return this.getWithRetry(
      assignmentApi,
      `/api/assignments/${assignmentId}`,
      config,
    );
  },
  getAllAssignments(config) {
    return this.getWithRetry(assignmentApi, "/api/assignments", config);
  },
  getAssignmentsHealth(config) {
    return this.getWithRetry(assignmentApi, "/api/assignments/health", config);
  },

  // PDF service
  async generatePDF(data, config = {}) {
    const res = await pdfApi.post("/api/documents/export-pdf", data, {
      responseType: "blob",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/pdf",
        ...(config.headers || {}),
      },
      ...(config || {}),
    });
    return res.data; // blob
  },

  // Learning explanations
  generateEnhancedExplanations(data, config) {
    return this.postWithRetry(
      assignmentApi,
      "/api/learning/explanations/batch",
      data,
      config,
    );
  },
};

export default function AssignmentsPage() {
  // Page list/search layer
  const [query, setQuery] = useState("");

  // Main assignments state
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);

  const [topic, setTopic] = useState("");
  const [gradeLevel, setGradeLevel] = useState("high school");
  const [subject, setSubject] = useState("Mathematics");
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState("medium");
  const [questionType, setQuestionType] = useState("multiple_choice");
  const [assignmentType, setAssignmentType] = useState("homework");
  const [curriculum, setCurriculum] = useState("IGCSE");
  const [examFocus, setExamFocus] = useState("practice");

  const [currentAssignment, setCurrentAssignment] = useState(null);
  const [studentAnswers, setStudentAnswers] = useState({});
  const [gradingResults, setGradingResults] = useState(null);

  const [enhancedExplanations, setEnhancedExplanations] = useState({});
  const [alertMessage, setAlertMessage] = useState("");
  const [apiHealth, setApiHealth] = useState(null);

  // Calculator
  const [showCalculator, setShowCalculator] = useState(false);
  const [calculatorPosition, setCalculatorPosition] = useState({
    x: 100,
    y: 100,
  });
  const dragRef = useRef({ dragging: false, offsetX: 0, offsetY: 0 });

  // Abort controllers to prevent freezes
  const abortRef = useRef(null);

  // latex cache
  const latexCache = useRef(new Map());

  // Init load
  useEffect(() => {
    let live = true;

    (async () => {
      try {
        await checkApiHealth(live);
        await loadAssignments(live);
      } catch {
        // ignore; handlers already fallback
      }
    })();

    return () => {
      live = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const checkApiHealth = async (live = true) => {
    try {
      const health = await apiService.getAssignmentsHealth();
      if (live) setApiHealth(health);
    } catch (error) {
      console.warn("API health check failed:", error);
      if (live)
        setApiHealth({ status: "unavailable", message: "Service unavailable" });
    }
  };

  const loadAssignments = async (live = true) => {
    try {
      const apiAssignments = await apiService.getAllAssignments();
      if (apiAssignments && apiAssignments.assignments) {
        if (live) setAssignments(apiAssignments.assignments);
      } else {
        const saved = JSON.parse(localStorage.getItem("ai_assignments")) || [];
        if (live) setAssignments(saved);
      }
    } catch (error) {
      console.warn(
        "Failed to load assignments from API, using localStorage:",
        error,
      );
      const saved = JSON.parse(localStorage.getItem("ai_assignments")) || [];
      if (live) setAssignments(saved);
    }
  };

  /* =========================
     LaTeX helpers
  ========================= */
  const parseLatexSegments = (text = "") => {
    if (!text) return [{ type: "text", value: "" }];
    const parts = [];
    const regex = /\$\$(.*?)\$\$|\$(.*?)\$/gs;
    let lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      const matchStart = m.index;
      if (matchStart > lastIndex) {
        parts.push({ type: "text", value: text.slice(lastIndex, matchStart) });
      }
      const latex = m[1] || m[2] || "";
      parts.push({ type: "latex", latex });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      parts.push({ type: "text", value: text.slice(lastIndex) });
    }
    return parts;
  };

  const getLatexImage = async (latex) => {
    if (!latex) return null;
    const key = latex.trim();
    if (latexCache.current.has(key)) return latexCache.current.get(key);
    try {
      const imgSrc = await latexToImage(key);
      latexCache.current.set(key, imgSrc);
      return imgSrc;
    } catch (err) {
      console.warn("latexToImage failed:", key, err);
      return null;
    }
  };

  const renderTextWithLatex = useCallback(async (rawText = "") => {
    const segments = parseLatexSegments(rawText);
    const out = [];
    for (const seg of segments) {
      if (seg.type === "text") out.push({ type: "text", value: seg.value });
      else if (seg.type === "latex") {
        const src = await getLatexImage(seg.latex);
        if (src) out.push({ type: "image", src });
        else out.push({ type: "text", value: `\\(${seg.latex}\\)` });
      }
    }
    return out;
  }, []);

  /* =========================
     Explanations
  ========================= */
  const generateEnhancedExplanationsForAssignment = async () => {
    if (!currentAssignment || !gradingResults) {
      setAlertMessage("Please complete and grade the assignment first.");
      return {};
    }

    try {
      const explanationRequests = currentAssignment.questions.map(
        (question, index) => {
          const gradedQuestion = gradingResults.graded_questions?.find(
            (q) => q.id === question.id || q.id === String(index + 1),
          );

          return {
            question_data: {
              question: question.question,
              topic: currentAssignment.topic,
              type: question.type,
              options: question.options || [],
              correct_answer: question.correct_answer || question.solution,
              context: `Subject: ${currentAssignment.subject}, Grade Level: ${currentAssignment.grade_level}`,
            },
            student_answer:
              gradedQuestion?.student_answer || studentAnswers[question.id],
            subject: currentAssignment.subject,
            curriculum,
            grade_level: currentAssignment.grade_level,
            language: "English",
            style: "friendly",
            previous_knowledge: "basic understanding",
          };
        },
      );

      const response = await apiService.generateEnhancedExplanations({
        requests: explanationRequests,
        mode: "balanced",
      });

      const explanations = {};
      (response || []).forEach((exp, index) => {
        const questionId =
          currentAssignment.questions[index]?.id || `q${index + 1}`;
        explanations[questionId] = exp?.explanation || "";
      });

      setEnhancedExplanations(explanations);
      setAlertMessage("Enhanced explanations generated.");
      return explanations;
    } catch (error) {
      console.error("Enhanced explanation generation failed:", error);
      setAlertMessage("Failed to generate enhanced explanations.");
      return {};
    }
  };

  /* =========================
     Save assignment report
  ========================= */
  const saveAssignmentReport = useCallback(
    async (assignment) => {
      if (
        !assignment ||
        !assignment.questions ||
        assignment.questions.length === 0
      )
        return null;

      try {
        const reportData = {
          assignment: {
            ...assignment,
            student_answers: studentAnswers,
            grading_results: gradingResults,
          },
          student_id: "assignment_user",
          workspace_id: "main_workspace",
          assignment_title: assignment.title,
        };

        const result = await apiService.saveAssignmentReport(reportData);
        if (result?.success) return result.report_id;
        return null;
      } catch (err) {
        console.error("Failed to save assignment report:", err);
        return null;
      }
    },
    [studentAnswers, gradingResults],
  );

  /* =========================
     PDF generation
  ========================= */
  const generatePDFReport = async () => {
    if (!currentAssignment || !currentAssignment.questions?.length) {
      setAlertMessage("Generate and complete an assignment first.");
      return;
    }

    setLoading(true);
    setAlertMessage("");

    try {
      // cancel any previous long request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      let explanations = enhancedExplanations;
      if (!Object.keys(enhancedExplanations).length && gradingResults) {
        explanations = await generateEnhancedExplanationsForAssignment();
      }

      const questionsWithExplanations = currentAssignment.questions.map(
        (question, index) => {
          const qid = question.id || `q${index + 1}`;
          const graded = gradingResults?.graded_questions?.find(
            (q) => q.id === qid,
          );
          return {
            ...question,
            id: qid,
            enhanced_explanation:
              explanations[qid] || question.explanation || "",
            userAnswer: studentAnswers[qid] || "Not answered",
            isCorrect: graded?.is_correct || false,
            max_score: question.points || 1,
            overall_score: graded?.score || 0,
          };
        },
      );

      const score = gradingResults?.overall_score ?? 0;

      // Use absolute URLs or empty strings if assets aren't publicly accessible
      const logoSrc = ""; // e.g. "https://yourdomain.com/logo.png"
      const coverSrc = ""; // e.g. "https://yourdomain.com/cover.png"

      const pdfContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Assignment Report - ${normalizeText(currentAssignment.topic)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#2c3e50;background:#fff}
    .page-logo{position:fixed;top:20px;right:20px;width:72px;height:72px;z-index:1000;object-fit:contain}
    .cover-page{height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:40px;position:relative}
    .cover-image{width:180px;height:180px;margin-bottom:24px;border-radius:18px;object-fit:cover;box-shadow:0 8px 32px rgba(0,0,0,.3)}
    .cover-title{font-size:3em;font-weight:700;margin-bottom:14px;text-shadow:2px 2px 4px rgba(0,0,0,.3)}
    .cover-subtitle{font-size:1.4em;font-weight:300;margin-bottom:28px;opacity:.92}
    .cover-details{background:rgba(255,255,255,.12);backdrop-filter:blur(10px);padding:22px;border-radius:18px;margin:10px 0;border:1px solid rgba(255,255,255,.18);width:min(720px,92vw)}
    .cover-info-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;text-align:left}
    .cover-info-label{font-weight:600;font-size:.85em;opacity:.8}
    .cover-info-value{font-size:1.05em;font-weight:500}
    .content-page{padding:60px 40px 40px;page-break-before:always}
    .header{text-align:center;border-bottom:3px solid #3498db;padding-bottom:18px;margin-bottom:26px}
    .header h1{font-size:2.1em;margin-bottom:6px}
    .header h2{color:#7f8c8d;font-size:1.1em;font-weight:300}
    .score-section{background:linear-gradient(135deg,#f8f9fa 0%,#e9ecef 100%);padding:22px;border-radius:14px;margin:18px 0;text-align:center;border:1px solid #dee2e6}
    .score-circle{width:110px;height:110px;border-radius:50%;background:${score >= 70 ? "#27ae60" : score >= 50 ? "#f39c12" : "#e74c3c"};display:flex;align-items:center;justify-content:center;margin:0 auto 12px;color:#fff;font-size:1.8em;font-weight:800}
    .stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:18px 0}
    .stat-item{text-align:center;padding:12px;background:#fff;border-radius:10px;border:1px solid #e9ecef}
    .stat-value{font-size:1.5em;font-weight:800;color:#3498db}
    .stat-label{font-size:.85em;color:#7f8c8d;margin-top:4px}
    .section-title{font-size:1.5em;color:#2c3e50;margin:26px 0 18px;padding-bottom:8px;border-bottom:2px solid #3498db}
    .question{margin:18px 0;padding:18px;border-left:6px solid #3498db;background:#f8fafc;border-radius:0 12px 12px 0;page-break-inside:avoid}
    .question.correct{border-left-color:#27ae60;background:#f0f9f0}
    .question.incorrect{border-left-color:#e74c3c;background:#fef0f0}
    .question-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px}
    .question-number{font-size:1.15em;font-weight:800}
    .question-type{background:#3498db;color:#fff;padding:3px 10px;border-radius:999px;font-size:.75em;font-weight:700}
    .question-status{font-weight:700}
    .question-status.correct{color:#27ae60}.question-status.incorrect{color:#e74c3c}
    .answer-section{margin:14px 0;padding:14px;background:#fff;border-radius:10px;border:1px solid #e9ecef}
    .answer-item{margin:8px 0;display:flex;gap:10px}
    .answer-label{font-weight:700;min-width:120px;color:#7f8c8d}
    .answer-value.wrong{color:#e74c3c;font-weight:800}
    .answer-value.correct{color:#27ae60;font-weight:800}
    .explanation{background:#e8f4fd;padding:14px;border-radius:10px;margin-top:10px;border-left:4px solid #3498db}
    .enhanced-explanation{background:#e8f5e8;border-left-color:#27ae60}
    .options-list{margin:10px 0;padding-left:0}
    .option-item{margin:6px 0;padding:8px 10px;background:#fff;border-radius:8px;border:1px solid #e9ecef}
    .option-item.correct{background:#d4edda;border-color:#c3e6cb;color:#155724}
    .report-footer{margin-top:28px;padding-top:14px;border-top:2px solid #ecf0f1;text-align:center;color:#7f8c8d;font-style:italic}
    @media print{
      .cover-page{page-break-after:always}
      .question,.score-section{page-break-inside:avoid}
      .page-logo{position:fixed;top:20px;right:20px}
    }
  </style>
</head>
<body>
  ${logoSrc ? `<img src="${logoSrc}" class="page-logo" alt="Logo" />` : ""}

  <div class="cover-page">
    ${coverSrc ? `<img src="${coverSrc}" class="cover-image" alt="Cover" />` : ""}
    <h1 class="cover-title">Assignment Report</h1>
    <p class="cover-subtitle">${normalizeText(currentAssignment.topic)} - ${normalizeText(
      currentAssignment.subject,
    )}</p>

    <div class="cover-details">
      <div class="cover-info-grid">
        <div><div class="cover-info-label">Student</div><div class="cover-info-value">Student 01</div></div>
        <div><div class="cover-info-label">Curriculum</div><div class="cover-info-value">${normalizeText(
          currentAssignment.curriculum,
        )}</div></div>
        <div><div class="cover-info-label">Grade Level</div><div class="cover-info-value">${normalizeText(
          currentAssignment.grade_level,
        )}</div></div>
        <div><div class="cover-info-label">Difficulty</div><div class="cover-info-value">${normalizeText(
          currentAssignment.difficulty,
        )}</div></div>
        <div><div class="cover-info-label">Assignment Type</div><div class="cover-info-value">${normalizeText(
          currentAssignment.assignment_type,
        )}</div></div>
        <div><div class="cover-info-label">Date Generated</div><div class="cover-info-value">${new Date().toLocaleDateString()}</div></div>
      </div>
    </div>
  </div>

  <div class="content-page">
    <div class="header">
      <h1>Performance Analysis</h1>
      <h2>Detailed breakdown of assignment results</h2>
    </div>

    <div class="score-section">
      <div class="score-circle"><span>${score}%</span></div>
      <div style="font-size:1.15em;font-weight:800;margin:10px 0">${normalizeText(
        gradingResults?.feedback ||
          (score >= 80
            ? "Excellent work."
            : score >= 60
              ? "Good progress."
              : "Keep practicing."),
      )}</div>

      <div class="stats-grid">
        <div class="stat-item"><div class="stat-value">${gradingResults?.total_correct || 0}/${
          currentAssignment.questions.length
        }</div><div class="stat-label">Correct Answers</div></div>
        <div class="stat-item"><div class="stat-value">${currentAssignment.total_points}</div><div class="stat-label">Total Points</div></div>
        <div class="stat-item"><div class="stat-value">${normalizeText(
          currentAssignment.difficulty,
        )}</div><div class="stat-label">Difficulty</div></div>
      </div>
    </div>

    ${
      currentAssignment.instructions
        ? `<div class="explanation"><strong>Instructions</strong><div>${normalizeText(
            currentAssignment.instructions,
          )}</div></div>`
        : ""
    }

    ${
      currentAssignment.learning_objectives?.length
        ? `<div class="explanation"><strong>Learning Objectives</strong><ul style="margin-top:8px;margin-left:16px">${currentAssignment.learning_objectives
            .map((obj) => `<li>${normalizeText(obj)}</li>`)
            .join("")}</ul></div>`
        : ""
    }
  </div>

  <div class="content-page">
    <h2 class="section-title">Question Breakdown</h2>
    <p style="margin-bottom:18px;color:#7f8c8d">Per-question analysis, answers, and explanations</p>

    ${questionsWithExplanations
      .map((question, index) => {
        const typeLabel = String(question.type || "")
          .replaceAll("_", " ")
          .toUpperCase();
        const correctAnswer = question.correct_answer || "";
        const userAnswer = question.userAnswer || "Not answered";

        return `
        <div class="question ${question.isCorrect ? "correct" : "incorrect"}">
          <div class="question-header">
            <span class="question-number">Question ${index + 1}</span>
            <span class="question-type">${typeLabel || "QUESTION"}</span>
            <span class="question-status ${question.isCorrect ? "correct" : "incorrect"}">
              ${question.isCorrect ? "Correct" : "Incorrect"} (${question.overall_score || 0}/${
                question.max_score || 1
              })
            </span>
          </div>

          <div style="margin:10px 0">${normalizeText(question.question)}</div>

          ${
            question.options?.length
              ? `<div class="options-list">
                ${question.options
                  .map((opt, optIndex) => {
                    const letter = String.fromCharCode(65 + optIndex);
                    const isCorrectOpt =
                      String(letter) === String(correctAnswer);
                    const isUserOpt = String(userAnswer) === String(letter);
                    return `<div class="option-item ${isCorrectOpt ? "correct" : ""}">
                      <strong>${letter}.</strong> ${normalizeText(opt)}
                      ${isCorrectOpt ? " (correct)" : ""}
                      ${isUserOpt && !isCorrectOpt ? " (selected)" : ""}
                    </div>`;
                  })
                  .join("")}
              </div>`
              : ""
          }

          <div class="answer-section">
            <div class="answer-item">
              <span class="answer-label">Your Answer:</span>
              <span class="answer-value ${question.isCorrect ? "correct" : "wrong"}">${normalizeText(
                userAnswer,
              )}</span>
            </div>
            ${
              !question.isCorrect && question.type !== "essay"
                ? `<div class="answer-item">
                    <span class="answer-label">Correct Answer:</span>
                    <span class="answer-value correct">${normalizeText(correctAnswer)}</span>
                  </div>`
                : ""
            }
          </div>

          ${
            question.enhanced_explanation
              ? `<div class="explanation enhanced-explanation"><strong>AI-Enhanced Explanation</strong><div>${normalizeText(
                  question.enhanced_explanation,
                )}</div></div>`
              : ""
          }

          ${
            question.explanation &&
            question.explanation !== question.enhanced_explanation
              ? `<div class="explanation"><strong>Explanation</strong><div>${normalizeText(
                  question.explanation,
                )}</div></div>`
              : ""
          }

          ${
            question.type === "essay" && question.expected_answer
              ? `<div class="explanation"><strong>Expected Answer Guide</strong><div>${normalizeText(
                  question.expected_answer,
                )}</div></div>`
              : ""
          }

          ${
            question.type === "problem_solving" && question.solution_steps
              ? `<div class="explanation"><strong>Solution Steps</strong><div>${normalizeText(
                  question.solution_steps,
                )}</div></div>`
              : ""
          }
        </div>
      `;
      })
      .join("")}

    <div class="report-footer">
      Report generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}.
    </div>
  </div>
</body>
</html>
      `.trim();

      // Optional: preview in browser (fast feedback)
      const preview = window.open("", "_blank");
      if (preview) {
        preview.document.open();
        preview.document.write(pdfContent);
        preview.document.close();
      }

      // Generate PDF on backend and download
      const filename = `Assignment_Report_${safeFileName(currentAssignment.topic)}.pdf`;
      const blob = await apiService.generatePDF(
        { html: pdfContent, filename },
        { signal: controller.signal },
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setAlertMessage("PDF report generated.");
    } catch (error) {
      console.error("PDF generation error:", error);
      setAlertMessage("Failed to generate PDF report.");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  /* =========================
     Generate assignment
  ========================= */
  const generateAssignment = async () => {
    if (!topic.trim()) {
      setAlertMessage("Enter a topic for the assignment.");
      return;
    }

    setLoading(true);
    setAlertMessage("");

    try {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const assignmentData = {
        topic: topic.split(",")[0].trim(),
        grade_level: gradeLevel,
        subject,
        num_questions: numQuestions,
        language: "English",
        question_type: questionType,
        difficulty,
        assignment_type: assignmentType,
        curriculum,
        exam_focus: examFocus,
        instructions: "",
        learning_objectives: [],
        total_points: 100,
        estimated_time: "",
      };

      const response = await apiService.generateAssignment(assignmentData, {
        signal: controller.signal,
      });

      if (!response?.success) {
        throw new Error(response?.message || "Assignment generation failed");
      }

      const assignment = response.data || response.assignment || {};
      const assignmentQuestions =
        assignment.assignment || assignment.questions || [];

      const formattedQuestions = assignmentQuestions.map((item, idx) => ({
        id: item.id || `q-${Date.now()}-${idx}`,
        type: item.type || questionType,
        question: item.question || "",
        points: item.points || 1,
        options: item.options || [],
        correct_answer: item.correct_answer || "",
        explanation: item.explanation || "",
        expected_answer: item.expected_answer || "",
        rubric: item.rubric || "",
        solution_steps: item.solution_steps || "",
        scoring_criteria: item.scoring_criteria || "",
      }));

      const newAssignment = {
        id: assignment.id || `assign-${Date.now()}`,
        title: `Assignment: ${assignment.topic || topic}`,
        topic: assignment.topic || topic,
        subject: assignment.subject || subject,
        grade_level: assignment.grade_level || gradeLevel,
        difficulty: assignment.difficulty || difficulty,
        assignment_type: assignment.assignment_type || assignmentType,
        curriculum: assignment.curriculum || curriculum,
        questions: formattedQuestions,
        total_points: assignment.total_points || 100,
        estimated_time: assignment.estimated_time || "",
        instructions: assignment.instructions || "",
        learning_objectives: assignment.learning_objectives || [],
        confidence:
          typeof assignment.confidence === "number"
            ? assignment.confidence
            : 1.0,
        generated_at: new Date().toISOString(),
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        exam_focus: examFocus,
      };

      const reportId = await saveAssignmentReport(newAssignment);
      if (reportId) newAssignment.report_id = reportId;

      const updated = [...assignments, newAssignment];
      setAssignments(updated);
      localStorage.setItem("ai_assignments", JSON.stringify(updated));

      setCurrentAssignment(newAssignment);
      setStudentAnswers({});
      setGradingResults(null);
      setEnhancedExplanations({});

      setAlertMessage(
        newAssignment.confidence < 0.7
          ? "Assignment generated with lower confidence. Review questions."
          : "Assignment generated successfully.",
      );
    } catch (err) {
      console.error("Assignment generation failed:", err);
      const status = err?.status || err?.response?.status;

      if (status === 422)
        setAlertMessage("Invalid request format. Check inputs.");
      else if (status === 500)
        setAlertMessage("Server error. Try again later.");
      else if (
        String(err?.message || "")
          .toLowerCase()
          .includes("timeout")
      )
        setAlertMessage("Request timeout. Check your connection.");
      else
        setAlertMessage(
          `Failed to generate assignment: ${err.message || "Unknown error"}`,
        );
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const resetAssignment = () => {
    setCurrentAssignment(null);
    setStudentAnswers({});
    setGradingResults(null);
    setEnhancedExplanations({});
    setTopic("");
    setAlertMessage("Starting a new assignment.");
  };

  /* =========================
     Upload file
  ========================= */
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("workspace_id", "assignments");
    if (currentAssignment)
      formData.append("assignment_id", currentAssignment.id);

    try {
      setLoading(true);
      await apiService.uploadAssignmentFile(formData);
      setAlertMessage("File uploaded successfully.");
    } catch (error) {
      console.error("File upload failed:", error);
      setAlertMessage("File upload failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId, answer) => {
    setStudentAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  /* =========================
     Local grading + compare
  ========================= */
  const isCodeAnswer = (answer) => {
    const codeIndicators = [
      "int ",
      "void ",
      "function",
      "def ",
      "print",
      "return",
    ];
    return codeIndicators.some((indicator) =>
      String(answer).toLowerCase().includes(indicator.toLowerCase()),
    );
  };

  const compareCodeAnswers = (userCode, correctCode) => {
    const user = String(userCode).toLowerCase().replace(/\s+/g, "");
    const correct = String(correctCode).toLowerCase().replace(/\s+/g, "");
    return user === correct;
  };

  const compareAnswers = (userAnswer, correctAnswer, qType) => {
    if (!userAnswer || !correctAnswer) return false;

    const user = userAnswer.toString().trim().toLowerCase();
    const correct = correctAnswer.toString().trim().toLowerCase();

    if (qType === "multiple_choice") {
      const userLetter = user.replace(/[^a-z]/g, "");
      const correctLetter = correct.replace(/[^a-z]/g, "");
      return userLetter === correctLetter || user === correct;
    }

    if (qType === "short_answer" || qType === "essay") {
      const cleanUser = user
        .replace(/[.,;!?]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const cleanCorrect = correct
        .replace(/[.,;!?]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      if (cleanUser === cleanCorrect) return true;
      if (cleanCorrect.includes(cleanUser) || cleanUser.includes(cleanCorrect))
        return true;

      if (isCodeAnswer(correct)) return compareCodeAnswers(user, correct);
    }

    if (qType === "true_false") {
      const userBool = user.startsWith("t") ? "true" : "false";
      const correctBool = correct.startsWith("t") ? "true" : "false";
      return userBool === correctBool;
    }

    return user === correct;
  };

  const gradeAssignmentLocally = () => {
    let totalScore = 0;
    let maxPossible = 0;

    const gradedQuestions = currentAssignment.questions.map((q) => {
      const userAnswer = studentAnswers[q.id] || "";
      const correctAnswer = q.correct_answer || "";
      const isCorrect = compareAnswers(userAnswer, correctAnswer, q.type);
      const score = isCorrect ? q.points || 1 : 0;

      totalScore += score;
      maxPossible += q.points || 1;

      return {
        ...q,
        userAnswer,
        is_correct: isCorrect,
        score,
        max_score: q.points || 1,
        feedback: isCorrect
          ? "Correct."
          : `Incorrect. Correct answer: ${correctAnswer}`,
      };
    });

    const overallScore =
      maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;

    return {
      overall_score: overallScore,
      graded_questions: gradedQuestions,
      total_correct: gradedQuestions.filter((q) => q.is_correct).length,
      total_possible: maxPossible,
      total_questions: currentAssignment.questions.length,
      feedback:
        overallScore >= 80
          ? "Excellent work."
          : overallScore >= 60
            ? "Good progress."
            : "Keep practicing.",
      grading_method: "local_fallback",
    };
  };

  /* =========================
     Submit for grading (AI)
  ========================= */
  const submitAssignment = async () => {
    if (!currentAssignment) return;

    try {
      setLoading(true);
      setAlertMessage("");

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const gradingResponse = await apiService.gradeAssignment(
        { assignment: currentAssignment, student_answers: studentAnswers },
        { signal: controller.signal },
      );

      const results =
        gradingResponse.grading_results ||
        gradingResponse.data ||
        gradingResponse;

      setGradingResults(results);

      await saveAssignmentReport(currentAssignment);

      setAlertMessage("Assignment graded successfully.");
    } catch (err) {
      console.error("Error grading assignment:", err);
      const local = gradeAssignmentLocally();
      setGradingResults(local);
      setAlertMessage("AI grading unavailable. Used local grading.");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const deleteAssignment = (assignmentId) => {
    const updated = assignments.filter((a) => a.id !== assignmentId);
    setAssignments(updated);
    localStorage.setItem("ai_assignments", JSON.stringify(updated));

    if (currentAssignment?.id === assignmentId) {
      setCurrentAssignment(null);
      setStudentAnswers({});
      setGradingResults(null);
      setEnhancedExplanations({});
      setAlertMessage("Assignment deleted.");
    }
  };

  const getQuestionTypeDisplay = (type) => {
    const types = {
      multiple_choice: "Multiple Choice",
      essay: "Essay",
      true_false: "True/False",
      short_answer: "Short Answer",
      problem_solving: "Problem Solving",
      mixed: "Mixed Types",
    };
    return (
      types[type] ||
      String(type || "")
        .replace("_", " ")
        .toUpperCase() ||
      "Question"
    );
  };

  const getAssignmentTypeDisplay = (type) => {
    const types = {
      homework: "Homework",
      classwork: "Classwork",
      worksheet: "Worksheet",
      project: "Project",
      assessment: "Assessment",
      practice: "Practice",
    };
    return types[type] || type || "Assignment";
  };

  /* =========================
     Calculator drag
  ========================= */
  const onCalculatorMouseDown = (e) => {
    dragRef.current.dragging = true;
    dragRef.current.offsetX = e.clientX - calculatorPosition.x;
    dragRef.current.offsetY = e.clientY - calculatorPosition.y;
  };

  const onWindowMouseMove = useCallback(
    (e) => {
      if (!dragRef.current.dragging) return;
      setCalculatorPosition({
        x: e.clientX - dragRef.current.offsetX,
        y: e.clientY - dragRef.current.offsetY,
      });
    },
    [setCalculatorPosition],
  );

  const onWindowMouseUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [onWindowMouseMove, onWindowMouseUp]);

  /* =========================
     KPI (simple)
  ========================= */
  const totalAssignments = assignments.length;

  const averageScore =
    assignments.length > 0
      ? Math.round(
          assignments.reduce((acc, a) => {
            if (a.report_id) return acc + (a.report_score || 70);
            return acc + 0;
          }, 0) / assignments.length,
        )
      : 0;

  const nextDue =
    assignments.length > 0
      ? assignments[0].due_date
        ? new Date(assignments[0].due_date).toLocaleDateString()
        : "No due date"
      : "N/A";

  const weakConcepts = 3;

  /* =========================
     Search filter
  ========================= */
  const filteredAssignments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assignments;

    return assignments.filter((a) =>
      `${a.title || ""} ${a.subject || ""} ${a.topic || ""} ${a.curriculum || ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [assignments, query]);

  return (
    <div className="assignments-page">
      {/* Header with title, subtitle and search */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1>Assignments</h1>
          <p className="text-muted">
            Generate, complete, grade, and export PDF reports.
          </p>
        </div>
        <input
          className="form-control"
          style={{ maxWidth: 340 }}
          placeholder="Search assignments…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <div className="header-left">
            <h1>My Assignments</h1>
            <p className="subtitle">
              Generate, complete, and track assignments.
            </p>
          </div>
          <div className="header-actions">
            <button
              onClick={() => setShowCalculator((s) => !s)}
              className="btn btn-primary"
              aria-label="Toggle calculator"
              type="button"
            >
              <FaCalculator className="inline-icon" /> Calculator
            </button>
            <button
              className="btn btn-secondary"
              onClick={resetAssignment}
              type="button"
            >
              New Assignment
            </button>
          </div>
        </header>

        {/* KPI */}
        <div className="stats-grid">
          <div className="stat-card accent-cyan">
            <span className="stat-icon accent-cyan">Total</span>
            <div className="stat-content">
              <h3>Total Assignments</h3>
              <p>{totalAssignments}</p>
            </div>
          </div>
          <div className="stat-card accent-mint">
            <span className="stat-icon accent-mint">Avg</span>
            <div className="stat-content">
              <h3>Average Score</h3>
              <p>{averageScore}%</p>
            </div>
          </div>
          <div className="stat-card accent-amber">
            <span className="stat-icon accent-amber">Due</span>
            <div className="stat-content">
              <h3>Next Due</h3>
              <p>{nextDue}</p>
            </div>
          </div>
          <div className="stat-card accent-purple">
            <span className="stat-icon accent-purple">Weak</span>
            <div className="stat-content">
              <h3>Weak Concepts</h3>
              <p>{weakConcepts}</p>
            </div>
          </div>
        </div>

        {/* Alert */}
        {alertMessage ? (
          <div
            className={`alert ${/failed|invalid|unavailable/i.test(alertMessage) ? "alert-warning" : "alert-success"}`}
          >
            {alertMessage}
          </div>
        ) : null}

        <div className="dashboard-content">
          {/* Left column */}
          <div className="left-col">
            {/* Generate */}
            <section
              className="feature-section"
              aria-label="Generate Assignment"
            >
              <h3>Generate New Assignment</h3>

              <div className="assignment-controls">
                <div className="control-group">
                  <label htmlFor="topic">Topic</label>
                  <input
                    id="topic"
                    type="text"
                    placeholder="e.g., Trigonometry, World War II"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="topic-input"
                  />
                </div>

                <div className="control-row">
                  <div className="control-group">
                    <label>Subject</label>
                    <select
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    >
                      <option value="General">General</option>
                      <option value="Mathematics">Mathematics</option>
                      <option value="Physics">Physics</option>
                      <option value="Chemistry">Chemistry</option>
                      <option value="Biology">Biology</option>
                      <option value="History">History</option>
                    </select>
                  </div>

                  <div className="control-group">
                    <label>Curriculum</label>
                    <select
                      value={curriculum}
                      onChange={(e) => setCurriculum(e.target.value)}
                    >
                      <option value="IGCSE">IGCSE</option>
                      <option value="IB">IB</option>
                      <option value="American">American</option>
                    </select>
                  </div>

                  <div className="control-group">
                    <label>Type</label>
                    <select
                      value={assignmentType}
                      onChange={(e) => setAssignmentType(e.target.value)}
                    >
                      <option value="homework">Homework</option>
                      <option value="classwork">Classwork</option>
                      <option value="worksheet">Worksheet</option>
                      <option value="project">Project</option>
                      <option value="assessment">Assessment</option>
                      <option value="practice">Practice</option>
                    </select>
                  </div>
                </div>

                <div className="control-row">
                  <div className="control-group">
                    <label>Question Type</label>
                    <select
                      value={questionType}
                      onChange={(e) => setQuestionType(e.target.value)}
                    >
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="essay">Essay</option>
                      <option value="short_answer">Short Answer</option>
                      <option value="true_false">True/False</option>
                      <option value="problem_solving">Problem Solving</option>
                    </select>
                  </div>

                  <div className="control-group">
                    <label>Difficulty</label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>

                  <div className="control-group">
                    <label>Grade Level</label>
                    <select
                      value={gradeLevel}
                      onChange={(e) => setGradeLevel(e.target.value)}
                    >
                      <option value="elementary">Elementary</option>
                      <option value="middle school">Middle School</option>
                      <option value="high school">High School</option>
                      <option value="college">College</option>
                    </select>
                  </div>

                  <div className="control-group">
                    <label>Questions</label>
                    <select
                      value={numQuestions}
                      onChange={(e) =>
                        setNumQuestions(parseInt(e.target.value, 10))
                      }
                    >
                      {[3, 5, 10, 15].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="control-group">
                    <label>Exam Focus</label>
                    <select
                      value={examFocus}
                      onChange={(e) => setExamFocus(e.target.value)}
                    >
                      <option value="practice">Practice</option>
                      <option value="exam">Exam</option>
                      <option value="revision">Revision</option>
                      <option value="conceptual">Conceptual</option>
                    </select>
                  </div>
                </div>

                <div className="action-buttons">
                  <button
                    onClick={generateAssignment}
                    disabled={loading}
                    className="btn btn-primary generate-btn"
                    type="button"
                  >
                    {loading ? "Generating..." : "Generate Assignment"}
                  </button>

                  {currentAssignment?.questions?.length ? (
                    <button
                      onClick={resetAssignment}
                      className="btn btn-secondary"
                      type="button"
                    >
                      New Assignment
                    </button>
                  ) : null}
                </div>
              </div>
            </section>

            {/* Current Assignment */}
            {currentAssignment ? (
              <section
                className="feature-section"
                aria-label="Current Assignment"
              >
                <h3>Current Assignment</h3>

                <div className="assignment-header">
                  <h4>{currentAssignment.title}</h4>
                  <div className="assignment-meta">
                    {currentAssignment.report_id ? (
                      <span className="badge slate">
                        Report: {currentAssignment.report_id}
                      </span>
                    ) : null}
                    {currentAssignment.confidence < 0.7 ? (
                      <span className="badge amber">
                        Confidence:{" "}
                        {Math.round(currentAssignment.confidence * 100)}%
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="assignment-meta-list">
                  <span className="badge mint">
                    {currentAssignment.subject}
                  </span>
                  <span className="badge slate">
                    {currentAssignment.grade_level}
                  </span>
                  <span className="badge amber">
                    {currentAssignment.difficulty}
                  </span>
                  <span className="badge cyan">
                    {currentAssignment.curriculum}
                  </span>
                  <span className="badge purple">
                    {getAssignmentTypeDisplay(
                      currentAssignment.assignment_type,
                    )}
                  </span>
                  <span className="badge gold">
                    Points: {currentAssignment.total_points}
                  </span>
                  <span className="badge mint">
                    Confidence: {Math.round(currentAssignment.confidence * 100)}
                    %
                  </span>
                </div>

                {currentAssignment.instructions ? (
                  <div className="assignment-instructions card-inner">
                    <h5>Instructions</h5>
                    <p>{currentAssignment.instructions}</p>
                  </div>
                ) : null}

                {currentAssignment.learning_objectives?.length ? (
                  <div className="learning-objectives card-inner">
                    <h5>Learning Objectives</h5>
                    <ul>
                      {currentAssignment.learning_objectives.map((obj, idx) => (
                        <li key={idx}>{obj}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="questions-section">
                  {currentAssignment.questions.map((q, index) => (
                    <div key={q.id} className="question-card card-inner">
                      <div className="question-header">
                        <h5>
                          Question {index + 1}{" "}
                          <span className="badge gold">{q.points} pts</span>
                        </h5>
                        <span className="badge cyan">
                          {getQuestionTypeDisplay(q.type)}
                        </span>
                      </div>

                      <div className="question-content">
                        <p className="question-text">{q.question}</p>

                        {q.type === "multiple_choice" && q.options?.length ? (
                          <div className="options">
                            {q.options.map((option, optIndex) => {
                              const letter = String.fromCharCode(65 + optIndex);
                              return (
                                <label key={optIndex} className="option">
                                  <input
                                    type="radio"
                                    name={`question-${q.id}`}
                                    value={letter}
                                    onChange={(e) =>
                                      handleAnswerChange(q.id, e.target.value)
                                    }
                                    checked={studentAnswers[q.id] === letter}
                                  />
                                  <span className="option-letter">
                                    {letter}
                                  </span>
                                  <span className="option-text">{option}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}

                        {q.type === "essay" ||
                        q.type === "short_answer" ||
                        q.type === "problem_solving" ? (
                          <textarea
                            placeholder={`Type your ${
                              q.type === "essay"
                                ? "essay"
                                : q.type === "problem_solving"
                                  ? "solution"
                                  : "answer"
                            } here...`}
                            onChange={(e) =>
                              handleAnswerChange(q.id, e.target.value)
                            }
                            value={studentAnswers[q.id] || ""}
                            rows={
                              q.type === "essay"
                                ? 6
                                : q.type === "problem_solving"
                                  ? 8
                                  : 4
                            }
                            className="answer-textarea"
                          />
                        ) : null}

                        {q.type === "true_false" ? (
                          <div className="true-false-options">
                            <label className="tf-option">
                              <input
                                type="radio"
                                name={`question-${q.id}`}
                                value="true"
                                onChange={(e) =>
                                  handleAnswerChange(q.id, e.target.value)
                                }
                                checked={studentAnswers[q.id] === "true"}
                              />
                              <span className="tf-label">True</span>
                            </label>
                            <label className="tf-option">
                              <input
                                type="radio"
                                name={`question-${q.id}`}
                                value="false"
                                onChange={(e) =>
                                  handleAnswerChange(q.id, e.target.value)
                                }
                                checked={studentAnswers[q.id] === "false"}
                              />
                              <span className="tf-label">False</span>
                            </label>
                          </div>
                        ) : null}
                      </div>

                      {enhancedExplanations[q.id] ? (
                        <div className="enhanced-explanation-preview card-inner">
                          <h5>AI Explanation</h5>
                          <p>{enhancedExplanations[q.id]}</p>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="assignment-actions">
                  <button
                    onClick={submitAssignment}
                    className="btn btn-primary"
                    type="button"
                  >
                    Submit for Grading
                  </button>
                  <button
                    onClick={generatePDFReport}
                    disabled={loading}
                    className="btn btn-secondary"
                    type="button"
                  >
                    {loading ? "Generating..." : "Generate PDF Report"}
                  </button>
                  <button
                    onClick={() => deleteAssignment(currentAssignment.id)}
                    className="btn btn-outline danger"
                    type="button"
                  >
                    Delete
                  </button>
                </div>

                {gradingResults ? (
                  <div className="grading-results card-inner">
                    <h4>Grading Results</h4>

                    <div className="score-breakdown">
                      <div className="score-summary">
                        <div className="score-circle-large">
                          {gradingResults.overall_score}%
                        </div>
                        <div className="score-details">
                          <h5>Score: {gradingResults.overall_score}%</h5>
                          <p className="performance-feedback">
                            {gradingResults.feedback}
                          </p>
                          <p>
                            <strong>{gradingResults.total_correct}</strong> out
                            of <strong>{gradingResults.total_questions}</strong>{" "}
                            correct
                          </p>
                          {gradingResults.grading_method ===
                          "local_fallback" ? (
                            <p className="grading-method badge slate">
                              Local grading used
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="questions-breakdown">
                        <h5>Question Details</h5>
                        {gradingResults.graded_questions?.map((q, index) => (
                          <div
                            key={q.id || index}
                            className={`graded-question ${q.is_correct ? "correct" : "incorrect"}`}
                          >
                            <div className="question-result-header">
                              <span className="question-number">
                                Q{index + 1}
                              </span>
                              <span
                                className={`result-status ${q.is_correct ? "correct" : "incorrect"}`}
                              >
                                {q.is_correct ? "Correct" : "Incorrect"} -{" "}
                                {q.score}/{q.max_score} pts
                              </span>
                            </div>
                            {q.feedback ? (
                              <p className="question-feedback">{q.feedback}</p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          {/* Right column */}
          <div className="right-col sidebar-section">
            {/* API Health */}
            {apiHealth ? (
              <div
                className={`card api-health ${apiHealth.status === "healthy" ? "health-good" : "health-bad"}`}
              >
                <span>API Status: {apiHealth.status}</span>
                {apiHealth.message ? <span> - {apiHealth.message}</span> : null}
              </div>
            ) : null}

            {/* Quick Actions */}
            <section className="quick-actions" aria-label="Quick Actions">
              <h3>Quick Actions</h3>
              <div className="action-buttons">
                <label
                  htmlFor="assignment-upload"
                  className="action-btn upload-btn"
                >
                  <input
                    type="file"
                    id="assignment-upload"
                    onChange={handleFileUpload}
                    accept=".pdf,.doc,.docx,.txt"
                    style={{ display: "none" }}
                  />
                  <span>Upload File</span>
                </label>

                <button
                  onClick={generatePDFReport}
                  className="action-btn"
                  disabled={loading}
                  type="button"
                >
                  <span>PDF Report</span>
                </button>

                <button
                  onClick={() => setShowCalculator((s) => !s)}
                  className="action-btn"
                  type="button"
                >
                  <span>Calculator</span>
                </button>

                <button
                  onClick={resetAssignment}
                  className="action-btn"
                  type="button"
                >
                  <span>New Assignment</span>
                </button>
              </div>
            </section>

            {/* Saved Assignments (grid) */}
            <section
              className="upcoming-section"
              aria-label="Saved Assignments"
            >
              <h3>Your Assignments ({filteredAssignments.length})</h3>

              {filteredAssignments.length === 0 ? (
                <div className="state-empty">
                  <p>No assignments.</p>
                </div>
              ) : (
                <div className="assignment-grid">
                  {filteredAssignments.map((a) => (
                    <div key={a._id || a.id} className="card assignment-card">
                      <h4>{a.title || "Untitled"}</h4>

                      <div className="assignment-meta">
                        <span className="badge slate">Topic: {a.topic}</span>
                        <span className="badge cyan">{a.subject}</span>
                        <span className="badge amber">{a.difficulty}</span>
                        <span className="badge purple">{a.curriculum}</span>
                        <span className="badge gold">
                          {getAssignmentTypeDisplay(a.assignment_type)}
                        </span>
                        <span className="badge mint">
                          Q: {a.questions?.length || 0}
                        </span>
                      </div>

                      {a.confidence < 0.7 ? (
                        <p className="confidence-indicator badge amber">
                          Confidence: {Math.round(a.confidence * 100)}%
                        </p>
                      ) : null}

                      <div className="card-actions">
                        <button
                          onClick={() => setCurrentAssignment(a)}
                          className="btn btn-small btn-primary"
                          type="button"
                        >
                          View
                        </button>
                        <button
                          onClick={generatePDFReport}
                          className="btn btn-small btn-secondary"
                          type="button"
                        >
                          PDF
                        </button>
                        <button
                          onClick={() => deleteAssignment(a.id)}
                          className="btn btn-small btn-outline danger"
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Table View */}
            <div className="dash-card mt-3">
              <h3 className="dash-card-title">Table View</h3>
              <div className="table-responsive mt-2">
                <table className="table table-dark table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Subject</th>
                      <th>Due</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssignments.map((a) => (
                      <tr key={`t_${a._id || a.id}`}>
                        <td>{a.title || "Untitled"}</td>
                        <td>{a.subject || "—"}</td>
                        <td>
                          {a.due_date
                            ? new Date(a.due_date).toLocaleDateString()
                            : "—"}
                        </td>
                        <td>{a.status || "—"}</td>
                      </tr>
                    ))}
                    {filteredAssignments.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-muted py-4">
                          No assignments
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Calculator */}
        {showCalculator ? (
          <div
            className="calculator-window card"
            style={{ left: calculatorPosition.x, top: calculatorPosition.y }}
            role="dialog"
            aria-label="Calculator"
          >
            <div
              className="calculator-header"
              onMouseDown={onCalculatorMouseDown}
              style={{ cursor: "grab" }}
            >
              <span>Casio Calculator</span>
              <button
                className="close-calculator"
                onClick={() => setShowCalculator(false)}
                aria-label="Close calculator"
                type="button"
              >
                ×
              </button>
            </div>
            <div className="calculator-body">
              <Casio />
            </div>
          </div>
        ) : null}

        {/* Loading overlay */}
        {loading ? (
          <div className="loading-overlay">
            <div className="loading-spinner" />
            <p>Loading...</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
