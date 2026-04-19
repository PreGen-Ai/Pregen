import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import "../../styles/dashboard.css";
import "../../styles/PracticeLab.css";
import Casio from "../../casio";
import api from "../../../services/api/api";
import { useAuthContext } from "../../../context/AuthContext";

const apiService = {
  generatePractice: (data, config) => api.ai.generateAssignment(data, config),
  validatePractice: (data, config) => api.ai.validateAssignment(data, config),
  uploadPracticeFile: (formData, config) =>
    api.ai.uploadAssignmentFile(formData, config),
  savePracticeReport: (data, config) =>
    api.ai.saveAssignmentReport(data, config),
  gradePractice: (data, config) => api.ai.gradeAssignment(data, config),
  getPracticeById: (practiceId, config) =>
    api.ai.getAssignmentById(practiceId, config),
  getAllPractices: (config) => api.ai.listAssignments(undefined, config),
  getPracticesHealth: (config) => api.ai.getAssignmentsHealth(config),
  generatePDF: ({ html, filename }, config) =>
    api.documents.exportPdf({ html, filename }, config),
  generateEnhancedExplanations: (data, config) =>
    api.ai.generateEnhancedExplanations(data, config),
};

// ==================== Utilities ====================
const safeFileName = (s = "practice") =>
  String(s)
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_");

const normalizeText = (str = "") =>
  String(str).replace(/\s+/g, " ").replace(/\n+/g, " ").trim();

const asCourses = (value) => {
  if (Array.isArray(value?.courses)) return value.courses;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value)) return value;
  return [];
};

const asPractices = (value) => {
  if (Array.isArray(value?.assignments)) return value.assignments;
  if (Array.isArray(value?.data?.assignments)) return value.data.assignments;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value)) return value;
  return [];
};

const getPracticeStorage = () => {
  try {
    return window.localStorage;
  } catch (error) {
    return null;
  }
};

export const readStoredPractices = () => {
  const storage = getPracticeStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem("ai_practices");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to read stored practices:", error);
    return [];
  }
};

export const mergePractices = (apiPractices = [], storedPractices = []) => {
  const merged = new Map();

  [...storedPractices, ...apiPractices].forEach((practice, index) => {
    if (!practice || typeof practice !== "object") return;

    const key = String(
      practice.id ||
        practice.report_id ||
        `${practice.topic || "practice"}-${practice.generated_at || index}`,
    );

    merged.set(key, {
      ...(merged.get(key) || {}),
      ...practice,
    });
  });

  return Array.from(merged.values()).sort((a, b) => {
    const aTime = new Date(a?.generated_at || 0).getTime();
    const bTime = new Date(b?.generated_at || 0).getTime();
    return bTime - aTime;
  });
};

const compactText = (value, max = 1800) => {
  const text = normalizeText(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

/** Strip HTML gateway error pages and return a clean user-facing message */
const sanitizeApiError = (msg, fallback = "AI service temporarily unavailable. Please try again shortly.") => {
  if (!msg) return fallback;
  const s = String(msg).trimStart();
  if (s.startsWith("<!") || /^<html[\s>]/i.test(s)) return fallback;
  if (s.length > 300) return s.slice(0, 300) + "…";
  return s;
};

// ==================== Main PracticeLab Component ====================
export default function PracticeLab() {
  const { user } = useAuthContext();
  // ---------- Mobile detection and tab state ----------
  const [mobileTab, setMobileTab] = useState("practice");
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 991px)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 991px)");
    const onChange = (e) => setIsMobile(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  // ---------- State ----------
  const [practices, setPractices] = useState(() => readStoredPractices());
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState("");
  const [gradeLevel, setGradeLevel] = useState("high school");
  const [subject, setSubject] = useState("General");
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState("medium");
  const [questionType, setQuestionType] = useState("multiple_choice");
  const [practiceType, setPracticeType] = useState("practice");
  const [curriculum, setCurriculum] = useState("IGCSE");
  const [examFocus, setExamFocus] = useState("practice");
  const [currentPractice, setCurrentPractice] = useState(null);
  const [studentAnswers, setStudentAnswers] = useState({});
  const [gradingResults, setGradingResults] = useState(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [calculatorPosition, setCalculatorPosition] = useState({
    x: 100,
    y: 100,
  });
  const [enhancedExplanations, setEnhancedExplanations] = useState({});
  const [studyMode, setStudyMode] = useState("general");
  const [mistakeExplanations, setMistakeExplanations] = useState({});
  const [explainMistakeLoading, setExplainMistakeLoading] = useState({});
  const [alertMessage, setAlertMessage] = useState("");
  const [apiHealth, setApiHealth] = useState(null);
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [courseModules, setCourseModules] = useState([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [warming, setWarming] = useState(false);
  const [warmingCountdown, setWarmingCountdown] = useState(0);

  // Refs
  const dragRef = useRef({ dragging: false, offsetX: 0, offsetY: 0 });
  const abortRef = useRef(null);
  const warmingTimerRef = useRef(null);

  const selectedCourse = useMemo(
    () => courses.find((course) => course._id === selectedCourseId) || null,
    [courses, selectedCourseId],
  );

  const materialOptions = useMemo(
    () =>
      (courseModules || []).flatMap((module) =>
        (module.items || []).map((item) => ({
          ...item,
          moduleTitle: module.title || "Module",
        })),
      ),
    [courseModules],
  );

  const selectedMaterial = useMemo(
    () =>
      materialOptions.find((item) => String(item._id) === String(selectedMaterialId)) ||
      null,
    [materialOptions, selectedMaterialId],
  );

  // ---------- Initial Load ----------
  useEffect(() => {
    let live = true;
    (async () => {
      await loadPractices(live);
      await checkApiHealth(live);
      await loadCourseContext(live);
    })();
    return () => {
      live = false;
      if (abortRef.current) abortRef.current.abort();
      if (warmingTimerRef.current) clearInterval(warmingTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkApiHealth = async (live = true) => {
    try {
      const health = await apiService.getPracticesHealth();
      if (live) setApiHealth(health);
    } catch (error) {
      console.warn("API health check failed:", error);
      if (live)
        setApiHealth({ status: "unavailable", message: "Service unavailable" });
    }
  };

  const loadPractices = async (live = true) => {
    const storedPractices = readStoredPractices();
    if (live && storedPractices.length) {
      setPractices((current) => mergePractices(current, storedPractices));
    }

    try {
      const apiPractices = await apiService.getAllPractices();
      const mergedPractices = mergePractices(
        asPractices(apiPractices),
        storedPractices,
      );
      if (live) setPractices(mergedPractices);

      const storage = getPracticeStorage();
      if (storage) {
        storage.setItem("ai_practices", JSON.stringify(mergedPractices));
      }
    } catch (error) {
      console.warn(
        "Failed to load practices from API, using localStorage:",
        error,
      );
      if (live) setPractices(storedPractices);
    }
  };

  const loadCourseContext = async (live = true) => {
    try {
      const response = await api.courses.getAllCourses({ limit: 100 });
      const nextCourses = asCourses(response);
      if (!live) return;
      setCourses(nextCourses);
      setSelectedCourseId((current) => {
        if (!current) return "";
        return nextCourses.some((course) => course._id === current) ? current : "";
      });
    } catch (error) {
      console.warn("Failed to load course context for practice lab:", error);
      if (live) setCourses([]);
    }
  };

  const loadCourseMaterials = useCallback(async (courseId, live = true) => {
    if (!courseId) {
      if (live) {
        setCourseModules([]);
        setSelectedMaterialId("");
      }
      return;
    }

    try {
      const response = await api.lessons.listCourseLessons(courseId);
      const modules = Array.isArray(response?.modules) ? response.modules : [];
      if (!live) return;
      setCourseModules(modules);
      setSelectedMaterialId((current) => {
        if (!current) return "";
        const exists = modules.some((module) =>
          (module.items || []).some(
            (item) => String(item._id) === String(current),
          ),
        );
        return exists ? current : "";
      });
    } catch (error) {
      console.warn("Failed to load lesson context for practice lab:", error);
      if (live) {
        setCourseModules([]);
        setSelectedMaterialId("");
      }
    }
  }, []);

  useEffect(() => {
    let live = true;
    loadCourseMaterials(selectedCourseId, live);
    return () => {
      live = false;
    };
  }, [selectedCourseId, loadCourseMaterials]);

  const buildStudyContext = useCallback(() => {
    const parts = [];

    if (selectedCourse?.title) parts.push(`Course: ${selectedCourse.title}`);
    if (selectedMaterial?.moduleTitle) {
      parts.push(`Module: ${selectedMaterial.moduleTitle}`);
    }
    if (selectedMaterial?.title) parts.push(`Material: ${selectedMaterial.title}`);
    if (selectedMaterial?.description) {
      parts.push(`Description: ${selectedMaterial.description}`);
    }
    if (selectedMaterial?.textContent) {
      parts.push(`Lesson text: ${compactText(selectedMaterial.textContent)}`);
    }
    if (selectedMaterial?.url) {
      parts.push(`Reference URL: ${selectedMaterial.url}`);
    }

    return compactText(parts.join("\n"), 2200);
  }, [selectedCourse, selectedMaterial]);

  // ---------- Enhanced Explanations ----------
  const generateEnhancedExplanationsForPractice = async () => {
    if (!currentPractice || !gradingResults) {
      setAlertMessage("⚠️ Please complete and grade the practice first");
      return {};
    }

    try {
      const explanationRequests = currentPractice.questions.map(
        (question, index) => {
          const gradedQuestion = gradingResults.graded_questions?.find(
            (q) => q.id === question.id || q.id === String(index + 1),
          );

          return {
            question_data: {
              question: question.question,
              topic: currentPractice.topic,
              type: question.type,
              options: question.options || [],
              correct_answer: question.correct_answer || question.solution,
              context: `Subject: ${currentPractice.subject}, Grade Level: ${currentPractice.grade_level}`,
            },
            student_answer:
              gradedQuestion?.student_answer || studentAnswers[question.id],
            subject: currentPractice.subject,
            curriculum: curriculum,
            grade_level: currentPractice.grade_level,
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
      response.forEach((exp, index) => {
        const questionId =
          currentPractice.questions[index]?.id || `q${index + 1}`;
        explanations[questionId] = exp.explanation;
      });

      setEnhancedExplanations(explanations);
      setAlertMessage("✅ Enhanced explanations generated!");
      return explanations;
    } catch (error) {
      console.error("Enhanced explanation generation failed:", error);
      setAlertMessage("❌ Failed to generate enhanced explanations");
      return {};
    }
  };

  // ---------- Save Report ----------
  const savePracticeReport = useCallback(
    async (practice) => {
      if (!practice || practice.questions.length === 0) return null;

      try {
        const reportData = {
          assignment: {
            ...practice,
            student_answers: studentAnswers,
            grading_results: gradingResults,
          },
          student_id: user?._id ? String(user._id) : "unknown_student",
          workspace_id:
            practice.courseId ||
            selectedCourseId ||
            practice.workspaceId ||
            undefined,
          assignment_title: practice.title,
        };

        const result = await apiService.savePracticeReport(reportData);
        if (result?.success) {
          console.log(
            `✅ Practice saved as report! Report ID: ${result.report_id}`,
          );
          return result.report_id;
        }
        return null;
      } catch (err) {
        console.error("Failed to save practice report:", err);
        return null;
      }
    },
    [gradingResults, selectedCourseId, studentAnswers, user?._id],
  );

  // ---------- PDF Generation (with preview) ----------
  const generatePDFReport = async () => {
    if (!currentPractice || currentPractice.questions.length === 0) {
      setAlertMessage("⚠️ Please generate and complete a practice first");
      return;
    }

    setLoading(true);
    setAlertMessage("");

    try {
      let explanations = enhancedExplanations;
      if (Object.keys(enhancedExplanations).length === 0) {
        explanations = await generateEnhancedExplanationsForPractice();
      }

      const questionsWithExplanations = currentPractice.questions.map(
        (question, index) => ({
          ...question,
          id: question.id || `q${index + 1}`,
          enhanced_explanation:
            explanations[question.id] || question.explanation,
          userAnswer: studentAnswers[question.id] || "Not answered",
          isCorrect:
            gradingResults?.graded_questions?.find((q) => q.id === question.id)
              ?.is_correct || false,
          max_score: question.points || 1,
          overall_score:
            gradingResults?.graded_questions?.find((q) => q.id === question.id)
              ?.score || 0,
        }),
      );

      const overallScore = gradingResults?.overall_score || 0;

      // Full detailed PDF content (from original)
      const pdfContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Practice Report - ${normalizeText(currentPractice.topic)}</title>
  <style>
    /* ===== FULL STYLES FROM ORIGINAL ===== */
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
    .score-circle{width:110px;height:110px;border-radius:50%;background:${overallScore >= 70 ? "#27ae60" : overallScore >= 50 ? "#f39c12" : "#e74c3c"};display:flex;align-items:center;justify-content:center;margin:0 auto 12px;color:#fff;font-size:1.8em;font-weight:800}
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
  <!-- Logo (optional, replace with absolute URL if needed) -->
  <!-- <img src="../../../assets/logo.jpg" class="page-logo" alt="Logo"> -->

  <div class="cover-page">
    <!-- <img src="../../../assets/Chat.png" class="cover-image" alt="Cover"> -->
    <h1 class="cover-title">Practice Report</h1>
    <p class="cover-subtitle">${normalizeText(currentPractice.topic)} — ${normalizeText(
      currentPractice.subject,
    )}</p>

    <div class="cover-details">
      <div class="cover-info-grid">
        <div><div class="cover-info-label">Student</div><div class="cover-info-value">Student 01</div></div>
        <div><div class="cover-info-label">Curriculum</div><div class="cover-info-value">${normalizeText(
          currentPractice.curriculum,
        )}</div></div>
        <div><div class="cover-info-label">Grade Level</div><div class="cover-info-value">${normalizeText(
          currentPractice.grade_level,
        )}</div></div>
        <div><div class="cover-info-label">Difficulty</div><div class="cover-info-value">${normalizeText(
          currentPractice.difficulty,
        )}</div></div>
        <div><div class="cover-info-label">Practice Type</div><div class="cover-info-value">${normalizeText(
          currentPractice.assignment_type,
        )}</div></div>
        <div><div class="cover-info-label">Date Generated</div><div class="cover-info-value">${new Date().toLocaleDateString()}</div></div>
      </div>
    </div>
  </div>

  <div class="content-page">
    <div class="header">
      <h1>Performance Analysis</h1>
      <h2>Detailed breakdown of your practice results</h2>
    </div>

    <div class="score-section">
      <div class="score-circle"><span>${overallScore}%</span></div>
      <div style="font-size:1.15em;font-weight:800;margin:10px 0">${normalizeText(
        gradingResults?.feedback ||
          (overallScore >= 80
            ? "Excellent work."
            : overallScore >= 60
              ? "Good progress."
              : "Keep practicing."),
      )}</div>

      <div class="stats-grid">
        <div class="stat-item"><div class="stat-value">${gradingResults?.total_correct || 0}/${
          currentPractice.questions.length
        }</div><div class="stat-label">Correct Answers</div></div>
        <div class="stat-item"><div class="stat-value">${currentPractice.total_points}</div><div class="stat-label">Total Points</div></div>
        <div class="stat-item"><div class="stat-value">${normalizeText(
          currentPractice.difficulty,
        )}</div><div class="stat-label">Difficulty</div></div>
      </div>
      ${
        Object.keys(explanations || {}).length > 0
          ? `<div style="margin-top:12px;color:#27ae60;font-weight:800;">Includes AI-Enhanced Explanations</div>`
          : ""
      }
    </div>

    ${
      currentPractice.instructions
        ? `<div class="explanation"><strong>Instructions</strong><div>${normalizeText(
            currentPractice.instructions,
          )}</div></div>`
        : ""
    }

    ${
      currentPractice.learning_objectives?.length
        ? `<div class="explanation"><strong>Learning Objectives</strong><ul style="margin-top:8px;margin-left:16px">${currentPractice.learning_objectives
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
        const typeLabel = (question.type || "")
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
                      ${isCorrectOpt ? " ✅" : ""}
                      ${isUserOpt && !isCorrectOpt ? " ❌" : ""}
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
      Report generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()} • AI Practice Lab
    </div>
  </div>
</body>
</html>`;

      // Preview in new tab
      const preview = window.open("", "_blank");
      if (preview) {
        preview.document.open();
        preview.document.write(pdfContent);
        preview.document.close();
      }

      // Generate PDF — try server first, fall back to client-side jspdf/html2canvas
      const filename = `Practice_Report_${safeFileName(currentPractice.topic)}.pdf`;
      let downloaded = false;

      try {
        const serverRes = await apiService.generatePDF({ html: pdfContent, filename });
        if (serverRes) {
          const blob = serverRes instanceof Blob ? serverRes : new Blob([serverRes], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
          downloaded = true;
        }
      } catch (serverErr) {
        const isFallback = serverErr?.response?.data?.fallbackToBrowser || serverErr?.status === 503;
        console.warn("Server PDF unavailable, using client fallback:", serverErr?.message);
        if (!isFallback) console.error("Server PDF error detail:", serverErr);
      }

      if (!downloaded) {
        // Client-side fallback using html2canvas + jspdf
        const { default: jsPDF } = await import("jspdf");
        const { default: html2canvas } = await import("html2canvas");

        const container = document.createElement("div");
        container.style.cssText = "position:fixed;left:-9999px;top:0;width:800px;background:#fff;";
        container.innerHTML = pdfContent;
        document.body.appendChild(container);

        try {
          const canvas = await html2canvas(container, { scale: 1.5, useCORS: true });
          const imgData = canvas.toDataURL("image/png");
          const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
          const pageWidth = pdf.internal.pageSize.getWidth();
          const imgWidth = pageWidth;
          const imgHeight = (canvas.height * pageWidth) / canvas.width;
          let y = 0;
          const pageHeight = pdf.internal.pageSize.getHeight();
          while (y < imgHeight) {
            pdf.addImage(imgData, "PNG", 0, -y, imgWidth, imgHeight);
            y += pageHeight;
            if (y < imgHeight) pdf.addPage();
          }
          pdf.save(filename);
          downloaded = true;
        } finally {
          document.body.removeChild(container);
        }
      }

      setAlertMessage(downloaded ? "✅ PDF report generated and downloaded!" : "❌ Failed to generate PDF report");
    } catch (error) {
      console.error("❌ PDF generation error:", error);
      setAlertMessage("❌ Failed to generate PDF report");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Generate Practice ----------
  const generatePractice = async () => {
    if (!topic.trim()) {
      setAlertMessage("⚠️ Please enter a topic for the practice.");
      return;
    }

    setLoading(true);
    setAlertMessage("");

    try {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const requestedTopic = topic.split(",")[0].trim();
      const requestedSubject = subject || "General";
      const requestedGradeLevel = gradeLevel || "high school";
      const requestedCurriculum = curriculum || "IGCSE";
      const studyContext = buildStudyContext();
      const scopedInstructions = [
        `Primary requested topic: ${requestedTopic}.`,
        `Primary requested subject: ${requestedSubject}.`,
        "Treat the requested topic and subject as authoritative.",
        "Do not replace the requested topic with the selected course or lesson context.",
        "Generate student-safe study practice only.",
        selectedCourse?.title
          ? `Use ${selectedCourse.title} only as supporting context for examples and terminology.`
          : "",
        selectedMaterial?.title
          ? `Use the selected lesson material only when it supports the requested topic: ${selectedMaterial.title}.`
          : "",
        studyContext ? `Source context:\n${studyContext}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const practiceData = {
        topic: requestedTopic,
        grade_level: requestedGradeLevel,
        subject: requestedSubject,
        num_questions: numQuestions,
        language: "English",
        question_type: questionType,
        difficulty,
        assignment_type: practiceType,
        curriculum: requestedCurriculum,
        exam_focus: examFocus,
        instructions: scopedInstructions,
        course_context: studyContext,
        learning_objectives: [
          requestedTopic ? `Practice the requested topic: ${requestedTopic}` : "",
          selectedMaterial?.title
            ? `Review the key ideas in ${selectedMaterial.title}`
            : "",
          selectedCourse?.title
            ? `Practice concepts from ${selectedCourse.title}`
            : "",
        ].filter(Boolean),
        total_points: 100,
        estimated_time: "",
      };

      const response = await apiService.generatePractice(practiceData, {
        signal: controller.signal,
      });

      if (!response?.success) {
        throw new Error(response?.message || "Practice generation failed");
      }

      const practice = response.data || response.assignment || {};
      const practiceQuestions = practice.assignment || practice.questions || [];

      const formattedQuestions = practiceQuestions.map((item, idx) => ({
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

      const newPractice = {
        id: practice.id || `practice-${Date.now()}`,
        title: `Practice: ${practice.topic || topic}`,
        topic: practice.topic || topic,
        subject:
          practice.subject ||
          requestedSubject ||
          selectedCourse?.subject?.name ||
          selectedCourse?.subjectName ||
          subject,
        grade_level:
          practice.grade_level ||
          requestedGradeLevel ||
          selectedCourse?.gradeLevel ||
          selectedCourse?.level ||
          gradeLevel,
        difficulty: practice.difficulty || difficulty,
        assignment_type: practice.assignment_type || practiceType,
        curriculum:
          practice.curriculum || requestedCurriculum || selectedCourse?.curriculum || curriculum,
        questions: formattedQuestions,
        total_points: practice.total_points || 100,
        estimated_time: practice.estimated_time || "",
        instructions: practice.instructions || scopedInstructions,
        learning_objectives:
          practice.learning_objectives ||
          [
            selectedMaterial?.title
              ? `Review the key ideas in ${selectedMaterial.title}`
              : "",
          ].filter(Boolean),
        confidence:
          typeof practice.confidence === "number" ? practice.confidence : 1.0,
        generated_at: new Date().toISOString(),
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        exam_focus: examFocus,
        courseId: selectedCourseId || null,
        courseTitle: selectedCourse?.title || "",
        materialId: selectedMaterial?._id || "",
        materialTitle: selectedMaterial?.title || "",
      };

      const reportId = await savePracticeReport(newPractice);
      if (reportId) newPractice.report_id = reportId;

      const updated = [...practices, newPractice];
      setPractices(updated);
      const storage = getPracticeStorage();
      if (storage) {
        storage.setItem("ai_practices", JSON.stringify(updated));
      }

      setCurrentPractice(newPractice);
      setStudentAnswers({});
      setGradingResults(null);
      setEnhancedExplanations({});
      setMistakeExplanations({});
      setExplainMistakeLoading({});

      setAlertMessage(
        newPractice.confidence < 0.7
          ? "⚠️ Practice generated with lower confidence - some questions may need review"
          : "✅ Practice generated successfully!",
      );

      if (isMobile) setMobileTab("practice");
    } catch (err) {
      console.error("❌ Practice generation failed:", err);
      const status = err?.status || err?.response?.status;
      if (status === 422) {
        setAlertMessage("❌ Invalid request format. Please check your inputs.");
      } else if (status === 500) {
        setAlertMessage("❌ Server error. Please try again later.");
      } else if (status === 502 || status === 503) {
        // Render free-tier cold start — service is waking up, auto-retry
        setAlertMessage("");
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
            generatePractice();
          }
        }, 1000);
      } else if (String(err?.message || "").includes("timeout")) {
        setAlertMessage("❌ Request timeout. Please check your connection.");
      } else {
        setAlertMessage(`❌ Failed to generate practice: ${sanitizeApiError(err.message)}`);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const resetPractice = () => {
    setCurrentPractice(null);
    setStudentAnswers({});
    setGradingResults(null);
    setEnhancedExplanations({});
    setMistakeExplanations({});
    setExplainMistakeLoading({});
    setTopic("");
    setAlertMessage("🔄 Starting new practice...");
    if (isMobile) setMobileTab("practice");
  };

  // ---------- Explain Mistake ----------
  const handleExplainMistake = async (gradedQ, question) => {
    const qId = question.id;
    setExplainMistakeLoading((prev) => ({ ...prev, [qId]: true }));
    try {
      const result = await api.ai.explainMistake({
        question_text: question.question,
        correct_answer: question.correct_answer || question.expected_answer || "",
        student_answer: studentAnswers[qId] || gradedQ.student_answer || "",
        question_type: question.type,
        subject: currentPractice.subject,
        grade_level: currentPractice.grade_level,
        explanation: question.explanation || "",
      });
      setMistakeExplanations((prev) => ({ ...prev, [qId]: result }));
    } catch (err) {
      console.error("Explain mistake failed:", err);
      setAlertMessage("❌ Could not explain mistake. Please try again.");
    } finally {
      setExplainMistakeLoading((prev) => ({ ...prev, [qId]: false }));
    }
  };

  // ---------- File Upload ----------
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append(
      "workspace_id",
      currentPractice?.courseId || selectedCourseId || "practices",
    );
    if (currentPractice) formData.append("assignment_id", currentPractice.id);

    try {
      setLoading(true);
      await apiService.uploadPracticeFile(formData);
      setAlertMessage("✅ File uploaded successfully!");
    } catch (error) {
      console.error("File upload failed:", error);
      setAlertMessage("❌ File upload failed");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Answer Handling ----------
  const handleAnswerChange = (questionId, answer) => {
    setStudentAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  // ---------- Smart Answer Comparison (from original) ----------
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

    if (qType === "true_false") {
      const userBool = user.startsWith("t") ? "true" : "false";
      const correctBool = correct.startsWith("t") ? "true" : "false";
      return userBool === correctBool;
    }

    // short_answer / essay / problem_solving
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

    return user === correct;
  };

  // ---------- Local Grading Fallback ----------
  const gradePracticeLocally = () => {
    if (!currentPractice) return null;

    let totalScore = 0;
    let maxPossible = 0;

    const gradedQuestions = currentPractice.questions.map((q) => {
      const userAnswer = studentAnswers[q.id] || "";
      const correctAnswer = q.correct_answer || "";
      const isCorrect = compareAnswers(userAnswer, correctAnswer, q.type);
      const score = isCorrect ? q.points || 1 : 0;

      totalScore += score;
      maxPossible += q.points || 1;

      return {
        id: q.id,
        is_correct: isCorrect,
        score,
        max_score: q.points || 1,
        feedback: isCorrect
          ? "Correct!"
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
      total_questions: currentPractice.questions.length,
      feedback:
        overallScore >= 80
          ? "Excellent work!"
          : overallScore >= 60
            ? "Good job!"
            : "Keep practicing!",
      grading_method: "local_fallback",
    };
  };

  // ---------- Submit for Grading ----------
  const submitPractice = async () => {
    if (!currentPractice) return;

    try {
      setLoading(true);
      setAlertMessage("");

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const gradingResponse = await apiService.gradePractice(
        { assignment: currentPractice, student_answers: studentAnswers },
        { signal: controller.signal },
      );

      const results =
        gradingResponse.grading_results ||
        gradingResponse.data ||
        gradingResponse;

      setGradingResults(results);
      await savePracticeReport(currentPractice);
      setAlertMessage("✅ Practice graded successfully!");
      if (isMobile) setMobileTab("results");
    } catch (err) {
      console.error("❌ Error grading practice:", err);
      const local = gradePracticeLocally();
      setGradingResults(local);
      setAlertMessage("⚠️ Used local grading (AI service unavailable)");
      if (isMobile) setMobileTab("results");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  // ---------- Delete Practice ----------
  const deletePractice = (practiceId) => {
    const updated = practices.filter((p) => p.id !== practiceId);
    setPractices(updated);
    const storage = getPracticeStorage();
    if (storage) {
      storage.setItem("ai_practices", JSON.stringify(updated));
    }

    if (currentPractice?.id === practiceId) {
      setCurrentPractice(null);
      setStudentAnswers({});
      setGradingResults(null);
      setEnhancedExplanations({});
      setAlertMessage("🗑️ Practice deleted");
    }
  };

  // ---------- Display Helpers ----------
  const getQuestionTypeDisplay = (type) => {
    const types = {
      multiple_choice: "Multiple Choice",
      essay: "Essay",
      true_false: "True/False",
      short_answer: "Short Answer",
      problem_solving: "Problem Solving",
      mixed: "Mixed Types",
    };
    return types[type] || type?.replace("_", " ").toUpperCase() || "Question";
  };

  const getPracticeTypeDisplay = (type) => {
    const types = {
      homework: "Homework",
      classwork: "Classwork",
      worksheet: "Worksheet",
      project: "Project",
      assessment: "Assessment",
      practice: "Practice",
    };
    return types[type] || type || "Practice";
  };

  // ---------- Calculator Drag ----------
  const onCalculatorMouseDown = (e) => {
    dragRef.current.dragging = true;
    dragRef.current.offsetX = e.clientX - calculatorPosition.x;
    dragRef.current.offsetY = e.clientY - calculatorPosition.y;
  };

  const onWindowMouseMove = useCallback((e) => {
    if (!dragRef.current.dragging) return;
    setCalculatorPosition({
      x: e.clientX - dragRef.current.offsetX,
      y: e.clientY - dragRef.current.offsetY,
    });
  }, []);

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

  // ---------- KPI Calculations (placeholders) ----------
  const totalPractices = practices.length;
  const streak = 5;
  const weakConcepts = 3;
  const nextPractice = practices.length > 0 ? practices[0].topic : "None";

  // ---------- Mobile Panel Visibility ----------
  const showPracticePanel = !isMobile || mobileTab === "practice";
  const showLibraryPanel = !isMobile || mobileTab === "library";
  const showResultsPanel = !isMobile || mobileTab === "results";

  // ---------- Mobile Tabs ----------
  const tabs = (
    <div className="d-flex gap-2 flex-wrap">
      <button
        className={`btn btn-sm ${mobileTab === "practice" ? "btn-primary" : "btn-outline-light"}`}
        onClick={() => setMobileTab("practice")}
      >
        Practice
      </button>
      <button
        className={`btn btn-sm ${mobileTab === "library" ? "btn-primary" : "btn-outline-light"}`}
        onClick={() => setMobileTab("library")}
      >
        Library
      </button>
      <button
        className={`btn btn-sm ${mobileTab === "results" ? "btn-primary" : "btn-outline-light"}`}
        onClick={() => setMobileTab("results")}
      >
        Results
      </button>
    </div>
  );

  return (
    <div className="practice-lab-page">
      {/* Header with title, subtitle and mobile tabs */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h2>Practice Lab</h2>
          <p className="text-muted">
            Generate, solve, grade, and export — optimized for mobile and
            desktop.
          </p>
        </div>
        {isMobile && tabs}
      </div>

      <div className="dash-card" style={{ padding: 0 }}>
        <div className="dashboard-container">
          {/* KPI Tiles */}
          <div className="stats-grid">
            <div className="stat-card accent-cyan">
              <span className="stat-icon accent-cyan">📋</span>
              <div className="stat-content">
                <h3>Total Practices</h3>
                <p>{totalPractices}</p>
              </div>
            </div>
            <div className="stat-card accent-gold">
              <span className="stat-icon accent-gold">🔥</span>
              <div className="stat-content">
                <h3>Current Streak</h3>
                <p>{streak} days</p>
              </div>
            </div>
            <div className="stat-card accent-amber">
              <span className="stat-icon accent-amber">⚠️</span>
              <div className="stat-content">
                <h3>Weak Concepts</h3>
                <p>{weakConcepts}</p>
              </div>
            </div>
            <div className="stat-card accent-mint">
              <span className="stat-icon accent-mint">🎯</span>
              <div className="stat-content">
                <h3>Next Practice</h3>
                <p>{nextPractice}</p>
              </div>
            </div>
          </div>

          {/* Alert */}
          {alertMessage && (
            <div
              className={`alert ${
                alertMessage.includes("❌") || alertMessage.includes("⚠️")
                  ? "alert-warning"
                  : "alert-success"
              }`}
            >
              {alertMessage}
            </div>
          )}

          {/* Warmup / cold-start retry banner */}
          {warming && (
            <div
              className="alert alert-warning d-flex align-items-center gap-2 flex-wrap"
              role="status"
            >
              <span
                className="spinner-border spinner-border-sm flex-shrink-0"
                aria-hidden="true"
              />
              <span className="flex-grow-1">
                ⏳ AI service is warming up (Render free tier)&hellip; auto-retrying
                in&nbsp;<strong>{warmingCountdown}s</strong>
              </span>
              <button
                className="btn btn-sm btn-outline-warning ms-auto"
                onClick={() => {
                  if (warmingTimerRef.current) {
                    clearInterval(warmingTimerRef.current);
                    warmingTimerRef.current = null;
                  }
                  setWarming(false);
                  generatePractice();
                }}
              >
                Retry Now
              </button>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => {
                  if (warmingTimerRef.current) {
                    clearInterval(warmingTimerRef.current);
                    warmingTimerRef.current = null;
                  }
                  setWarming(false);
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Main Content */}
          <div className="dashboard-content">
            {/* Left Column: Practice (Generator + Current) */}
            {showPracticePanel && (
              <div className="left-col">
                {/* Generate Practice Card */}
                <section
                  className="feature-section"
                  aria-label="Generate Practice"
                >
                  <h3>Generate New Practice</h3>
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
                        <label>
                          Course context
                          {!selectedCourseId && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: "0.75em",
                                color: "var(--warm-amber,#F59E0B)",
                                fontWeight: 600,
                              }}
                            >
                              — recommended for scoped practice
                            </span>
                          )}
                        </label>
                        <select
                          value={selectedCourseId}
                          onChange={(e) => setSelectedCourseId(e.target.value)}
                          style={
                            !selectedCourseId
                              ? { borderColor: "var(--warm-amber,#F59E0B)" }
                              : {}
                          }
                        >
                          <option value="">No specific course</option>
                          {courses.map((course) => (
                            <option key={course._id} value={course._id}>
                              {course.title}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="control-group">
                        <label>Lesson material</label>
                        <select
                          value={selectedMaterialId}
                          onChange={(e) => setSelectedMaterialId(e.target.value)}
                          disabled={!selectedCourseId || !materialOptions.length}
                        >
                          <option value="">General course practice</option>
                          {materialOptions.map((item) => (
                            <option key={item._id} value={item._id}>
                              {item.moduleTitle}: {item.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="card-inner" style={{ marginTop: 12 }}>
                      <h5 className="mb-1">Study scope</h5>
                      {selectedMaterial ? (
                        <p className="mb-0">
                          Practice anchored to{" "}
                          <strong>{selectedMaterial.title}</strong>
                          {selectedCourse?.title ? ` in ${selectedCourse.title}` : ""}.
                        </p>
                      ) : selectedCourse ? (
                        <p className="mb-0">
                          Practice aligned to{" "}
                          <strong>{selectedCourse.title}</strong>.
                        </p>
                      ) : (
                        <p className="mb-0" style={{ color: "var(--warm-amber,#F59E0B)" }}>
                          No course selected — practice will be general and not scoped to your curriculum.
                          Select a course above for focused practice.
                        </p>
                      )}
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
                          value={practiceType}
                          onChange={(e) => setPracticeType(e.target.value)}
                        >
                          <option value="practice">Practice</option>
                          <option value="worksheet">Worksheet</option>
                          <option value="assessment">Assessment</option>
                          <option value="project">Project</option>
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
                          <option value="multiple_choice">
                            Multiple Choice
                          </option>
                          <option value="essay">Essay</option>
                          <option value="short_answer">Short Answer</option>
                          <option value="true_false">True/False</option>
                          <option value="problem_solving">
                            Problem Solving
                          </option>
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
                      <div className="control-group">
                        <label>Study Mode</label>
                        <select
                          value={studyMode}
                          onChange={(e) => setStudyMode(e.target.value)}
                        >
                          <option value="general">General</option>
                          <option value="explain_simply">Explain Simply</option>
                          <option value="explain_deeply">Explain Deeply</option>
                          <option value="give_example">Give Example</option>
                          <option value="quiz_me">Quiz Me</option>
                          <option value="summarize">Summarize</option>
                        </select>
                      </div>
                    </div>

                    <div className="action-buttons">
                      <button
                        onClick={generatePractice}
                        disabled={loading}
                        className="btn btn-primary generate-btn"
                      >
                        {loading ? "Generating..." : "Generate Practice"}
                      </button>
                      {currentPractice &&
                        currentPractice.questions?.length > 0 && (
                          <button
                            onClick={resetPractice}
                            className="btn btn-secondary"
                          >
                            New Practice
                          </button>
                        )}
                    </div>
                  </div>
                </section>

                {/* Current Practice */}
                {currentPractice && (
                  <section
                    className="feature-section"
                    aria-label="Current Practice"
                  >
                    <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-2">
                      <h3 className="mb-0">Current Practice</h3>
                      <span
                        style={{
                          background: "var(--warm-amber,#F59E0B)",
                          color: "#1a1a1a",
                          fontSize: "0.75em",
                          padding: "0.3em 0.7em",
                          borderRadius: 99,
                          fontWeight: 600,
                          display: "inline-block",
                        }}
                      >
                        AI Generated
                      </span>
                    </div>
                    <div className="assignment-header">
                      <h4>{currentPractice.title}</h4>
                      <div className="assignment-meta">
                        {currentPractice.report_id && (
                          <span className="badge slate">
                            Report: {currentPractice.report_id}
                          </span>
                        )}
                        {currentPractice.confidence < 0.7 && (
                          <span className="badge amber">
                            Confidence:{" "}
                            {Math.round(currentPractice.confidence * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="assignment-meta-list">
                      {currentPractice.courseTitle && (
                        <span className="badge slate">
                          Course: {currentPractice.courseTitle}
                        </span>
                      )}
                      {currentPractice.materialTitle && (
                        <span className="badge cyan">
                          Material: {currentPractice.materialTitle}
                        </span>
                      )}
                      <span className="badge mint">
                        {currentPractice.subject}
                      </span>
                      <span className="badge slate">
                        {currentPractice.grade_level}
                      </span>
                      <span className="badge amber">
                        {currentPractice.difficulty}
                      </span>
                      <span className="badge cyan">
                        {currentPractice.curriculum}
                      </span>
                      <span className="badge purple">
                        {getPracticeTypeDisplay(
                          currentPractice.assignment_type,
                        )}
                      </span>
                      <span className="badge gold">
                        Points: {currentPractice.total_points}
                      </span>
                      {currentPractice.estimated_time && (
                        <span className="badge slate">
                          ⏱️ {currentPractice.estimated_time}
                        </span>
                      )}
                      <span className="badge mint">
                        Confidence:{" "}
                        {Math.round(currentPractice.confidence * 100)}%
                      </span>
                    </div>

                    {currentPractice.instructions && (
                      <div className="assignment-instructions card-inner">
                        <h5>Instructions</h5>
                        <p>{currentPractice.instructions}</p>
                      </div>
                    )}

                    {currentPractice.learning_objectives?.length > 0 && (
                      <div className="learning-objectives card-inner">
                        <h5>Learning Objectives</h5>
                        <ul>
                          {currentPractice.learning_objectives.map(
                            (obj, idx) => (
                              <li key={idx}>{obj}</li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}

                    <div className="questions-section">
                      {currentPractice.questions.map((q, index) => (
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

                            {q.type === "multiple_choice" &&
                              q.options?.length > 0 && (
                                <div className="options">
                                  {q.options.map((option, optIndex) => {
                                    const letter = String.fromCharCode(
                                      65 + optIndex,
                                    );
                                    return (
                                      <label key={optIndex} className="option">
                                        <input
                                          type="radio"
                                          name={`question-${q.id}`}
                                          value={letter}
                                          onChange={(e) =>
                                            handleAnswerChange(
                                              q.id,
                                              e.target.value,
                                            )
                                          }
                                          checked={
                                            studentAnswers[q.id] === letter
                                          }
                                        />
                                        <span className="option-letter">
                                          {letter}
                                        </span>
                                        <span className="option-text">
                                          {option}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}

                            {(q.type === "essay" ||
                              q.type === "short_answer" ||
                              q.type === "problem_solving") && (
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
                            )}

                            {q.type === "true_false" && (
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
                            )}
                          </div>

                          {enhancedExplanations[q.id] && (
                            <div className="enhanced-explanation-preview card-inner">
                              <h5>AI Explanation</h5>
                              <p>{enhancedExplanations[q.id]}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="assignment-actions">
                      <button
                        onClick={submitPractice}
                        className="btn btn-primary"
                      >
                        Submit for Grading
                      </button>
                      <button
                        onClick={generatePDFReport}
                        disabled={loading}
                        className="btn btn-secondary"
                      >
                        {loading ? "Generating..." : "Generate PDF Report"}
                      </button>
                      <button
                        onClick={() => deletePractice(currentPractice.id)}
                        className="btn btn-outline danger"
                      >
                        Delete
                      </button>
                    </div>

                    {gradingResults && (
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
                                <strong>{gradingResults.total_correct}</strong>{" "}
                                out of{" "}
                                <strong>
                                  {gradingResults.total_questions}
                                </strong>{" "}
                                correct
                              </p>
                              {gradingResults.grading_method ===
                                "local_fallback" && (
                                <p className="grading-method badge slate">
                                  Local Grading Used
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="questions-breakdown">
                            <h5>Question Details</h5>
                            {gradingResults.graded_questions?.map(
                              (q, index) => (
                                <div
                                  key={q.id}
                                  className={`graded-question ${q.is_correct ? "correct" : "incorrect"}`}
                                >
                                  <div className="question-result-header">
                                    <span className="question-number">
                                      Q{index + 1}
                                    </span>
                                    <span
                                      className={`result-status ${
                                        q.is_correct ? "correct" : "incorrect"
                                      }`}
                                    >
                                      {q.is_correct ? "Correct" : "Incorrect"} -{" "}
                                      {q.score}/{q.max_score} pts
                                    </span>
                                  </div>
                                  {q.feedback && (
                                    <p className="question-feedback">
                                      {q.feedback}
                                    </p>
                                  )}
                                  {!q.is_correct && (() => {
                                    const origQ = currentPractice.questions.find(
                                      (oq) => oq.id === q.id,
                                    );
                                    const exp = mistakeExplanations[q.id];
                                    const loadingExp = explainMistakeLoading[q.id];
                                    return (
                                      <div style={{ marginTop: 8 }}>
                                        {!exp && (
                                          <button
                                            className="btn btn-sm btn-outline-secondary"
                                            style={{ fontSize: "0.8em" }}
                                            disabled={loadingExp}
                                            onClick={() =>
                                              handleExplainMistake(q, origQ)
                                            }
                                          >
                                            {loadingExp
                                              ? "Explaining…"
                                              : "Explain My Mistake"}
                                          </button>
                                        )}
                                        {exp && (
                                          <div
                                            className="card-inner"
                                            style={{
                                              marginTop: 8,
                                              borderLeft:
                                                "3px solid var(--accent-cyan,#06B6D4)",
                                              paddingLeft: 10,
                                            }}
                                          >
                                            <div
                                              style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                marginBottom: 4,
                                              }}
                                            >
                                              <strong
                                                style={{ fontSize: "0.85em" }}
                                              >
                                                Mistake Explained
                                              </strong>
                                              <button
                                                className="btn btn-sm"
                                                style={{
                                                  fontSize: "0.7em",
                                                  padding: "1px 6px",
                                                }}
                                                onClick={() =>
                                                  setMistakeExplanations(
                                                    (prev) => {
                                                      const next = {
                                                        ...prev,
                                                      };
                                                      delete next[q.id];
                                                      return next;
                                                    },
                                                  )
                                                }
                                              >
                                                ✕
                                              </button>
                                            </div>
                                            {exp.what_was_wrong && (
                                              <p
                                                style={{
                                                  fontSize: "0.82em",
                                                  marginBottom: 4,
                                                }}
                                              >
                                                <strong>What was wrong:</strong>{" "}
                                                {exp.what_was_wrong}
                                              </p>
                                            )}
                                            {exp.why_it_was_wrong && (
                                              <p
                                                style={{
                                                  fontSize: "0.82em",
                                                  marginBottom: 4,
                                                }}
                                              >
                                                <strong>Why it was wrong:</strong>{" "}
                                                {exp.why_it_was_wrong}
                                              </p>
                                            )}
                                            {exp.how_to_fix && (
                                              <p
                                                style={{
                                                  fontSize: "0.82em",
                                                  marginBottom: 4,
                                                }}
                                              >
                                                <strong>How to fix:</strong>{" "}
                                                {exp.how_to_fix}
                                              </p>
                                            )}
                                            {exp.practice_question && (
                                              <p
                                                style={{
                                                  fontSize: "0.82em",
                                                  marginBottom: 0,
                                                  fontStyle: "italic",
                                                }}
                                              >
                                                <strong>Try this:</strong>{" "}
                                                {exp.practice_question}
                                              </p>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}

            {/* Right Column: Library & Results */}
            {(showLibraryPanel || showResultsPanel) && (
              <div className="right-col sidebar-section">
                {/* API Health */}
                {apiHealth && (
                  <div
                    className={`card api-health ${
                      apiHealth.status === "healthy"
                        ? "health-good"
                        : "health-bad"
                    }`}
                  >
                    <span>API Status: {apiHealth.status}</span>
                    {apiHealth.message && (
                      <span> - {sanitizeApiError(apiHealth.message, "Service unavailable")}</span>
                    )}
                  </div>
                )}

                {/* Quick Actions (Library only) */}
                {showLibraryPanel && (
                  <section className="quick-actions" aria-label="Quick Actions">
                    <h3>Quick Actions</h3>
                    <div className="action-buttons">
                      <label
                        htmlFor="practice-upload"
                        className="action-btn upload-btn"
                      >
                        <input
                          type="file"
                          id="practice-upload"
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
                      >
                        <span>PDF Report</span>
                      </button>
                      <button
                        onClick={() => setShowCalculator((s) => !s)}
                        className="action-btn"
                      >
                        <span>Calculator</span>
                      </button>
                      <button onClick={resetPractice} className="action-btn">
                        <span>New Practice</span>
                      </button>
                    </div>
                  </section>
                )}

                {/* Saved Practices (Library) */}
                {showLibraryPanel && (
                  <section
                    className="upcoming-section"
                    aria-label="Saved Practices"
                  >
                    <h3>Your Practices ({practices.length})</h3>
                    {practices.length === 0 ? (
                      <div className="state-empty">
                        <p>No practices yet. Generate one on the left.</p>
                      </div>
                    ) : (
                      <div className="assignment-grid">
                        {practices.map((practice) => (
                          <div
                            key={practice.id}
                            className="card assignment-card"
                          >
                            <h4>{practice.title}</h4>
                            <div className="assignment-meta">
                              {practice.courseTitle ? (
                                <span className="badge slate">
                                  Course: {practice.courseTitle}
                                </span>
                              ) : null}
                              {practice.materialTitle ? (
                                <span className="badge cyan">
                                  Material: {practice.materialTitle}
                                </span>
                              ) : null}
                              <span className="badge slate">
                                Topic: {practice.topic}
                              </span>
                              <span className="badge cyan">
                                {practice.subject}
                              </span>
                              <span className="badge amber">
                                {practice.difficulty}
                              </span>
                              <span className="badge purple">
                                {practice.curriculum}
                              </span>
                              <span className="badge gold">
                                {getPracticeTypeDisplay(
                                  practice.assignment_type,
                                )}
                              </span>
                              <span className="badge mint">
                                Q: {practice.questions?.length || 0}
                              </span>
                            </div>

                            {practice.confidence < 0.7 && (
                              <p className="confidence-indicator badge amber">
                                {Math.round(practice.confidence * 100)}%
                                Confidence
                              </p>
                            )}

                            <div className="card-actions">
                              <button
                                onClick={() => {
                                  setCurrentPractice(practice);
                                  setAlertMessage("");
                                  if (isMobile) setMobileTab("practice");
                                }}
                                className="btn btn-small btn-primary"
                              >
                                View
                              </button>
                              <button
                                onClick={() => {
                                  setCurrentPractice(practice);
                                  setTimeout(() => generatePDFReport(), 0);
                                }}
                                className="btn btn-small btn-secondary"
                                disabled={loading}
                              >
                                PDF
                              </button>
                              <button
                                onClick={() => deletePractice(practice.id)}
                                className="btn btn-small btn-outline danger"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {/* Results Panel */}
                {showResultsPanel && (
                  <section className="feature-section" aria-label="Results">
                    <h3>Results</h3>
                    {!gradingResults ? (
                      <div className="state-empty">
                        <p>No results yet. Submit a practice for grading.</p>
                      </div>
                    ) : (
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
                                <strong>{gradingResults.total_correct}</strong>{" "}
                                out of{" "}
                                <strong>
                                  {gradingResults.total_questions}
                                </strong>{" "}
                                correct
                              </p>
                              {gradingResults.grading_method ===
                                "local_fallback" && (
                                <p className="grading-method badge slate">
                                  Local Grading Used
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="questions-breakdown">
                            <h5>Question Details</h5>
                            {gradingResults.graded_questions?.map((q, idx) => (
                              <div
                                key={q.id}
                                className={`graded-question ${q.is_correct ? "correct" : "incorrect"}`}
                              >
                                <div className="question-result-header">
                                  <span className="question-number">
                                    Q{idx + 1}
                                  </span>
                                  <span
                                    className={`result-status ${
                                      q.is_correct ? "correct" : "incorrect"
                                    }`}
                                  >
                                    {q.is_correct ? "Correct" : "Incorrect"} -{" "}
                                    {q.score}/{q.max_score} pts
                                  </span>
                                </div>
                                {q.feedback && (
                                  <p className="question-feedback">
                                    {q.feedback}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </div>

          {/* Draggable Calculator */}
          {showCalculator && (
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
                >
                  ✖
                </button>
              </div>
              <div className="calculator-body">
                <Casio />
              </div>
            </div>
          )}

          {/* Loading Overlay */}
          {loading && (
            <div className="loading-overlay">
              <div className="loading-spinner"></div>
              <p>Loading...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
