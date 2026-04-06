// utils/quizStats.js
// ------------------------------------------------------------
// MODEL-A BACKEND ALIGNED VERSION (FINAL)
// ------------------------------------------------------------

// ============================================================
// 🔐 STABLE HASH (must match QuizContent & QuestionCard)
// ============================================================
const generateStableHash = (str = "") => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36).substring(0, 8);
};

// ============================================================
// 🎨 COLORS & FORMATTERS
// ============================================================
export const getScoreColor = (v) => {
  if (v >= 80) return "#10b981"; // green
  if (v >= 60) return "#f59e0b"; // amber
  return "#ef4444"; // red
};

export const formatDuration = (seconds = 0) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}h ${m}m ${s}s`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
};

export const badgesFromPerformance = ({
  scorePct,
  correctCount,
  total,
  timeSpent,
}) => {
  const out = [];
  if (scorePct >= 90)
    out.push({ id: "gold", label: "Gold Performer", emoji: "🏆" });
  if (scorePct >= 75)
    out.push({ id: "sharp", label: "Sharp Thinker", emoji: "🧠" });
  if (correctCount === total && total > 0)
    out.push({ id: "perfect", label: "Perfect Score", emoji: "✨" });
  if (timeSpent && scorePct >= 70)
    out.push({ id: "speedster", label: "Speedster", emoji: "⚡" });
  if (total >= 10)
    out.push({ id: "endurance", label: "Endurance", emoji: "💪" });
  if (!out.length)
    out.push({ id: "starter", label: "On the Board", emoji: "🎯" });
  return out;
};

// ============================================================
// 🧠 TYPE-SAFE NORMALIZERS
// Matches backend enums EXACTLY
// ============================================================
const normalizeType = (t) => {
  if (!t) return "multiple_choice";
  const v = t.toString().trim().toLowerCase().replace(" ", "_");
  if (["multiple_choice", "essay", "short_answer", "true_false"].includes(v))
    return v === "short_answer" ? "essay" : v; // short_answer → essay bucket
  return "multiple_choice";
};

const normalizeDifficulty = (d) => {
  if (!d) return "medium";
  return d.toString().trim().toLowerCase();
};

// ============================================================
// 🔍 CORE: normalizeQuizData()
// Robust, backend-aligned, safe
// ============================================================
export const normalizeQuizData = (rawQuiz) => {
  if (!rawQuiz) return [];

  let questions = [];

  // Accept direct array
  if (Array.isArray(rawQuiz)) questions = rawQuiz;
  // Accept { questions: [...] }
  else if (Array.isArray(rawQuiz.questions)) questions = rawQuiz.questions;
  // Accept { graded_questions: [...] }
  else if (Array.isArray(rawQuiz.graded_questions))
    questions = rawQuiz.graded_questions;
  // Accept nested report: report_data.question_analysis
  else if (
    rawQuiz?.report_data?.question_analysis &&
    Array.isArray(rawQuiz.report_data.question_analysis)
  ) {
    questions = rawQuiz.report_data.question_analysis;
  }

  // Fallback: find largest array in object
  else if (typeof rawQuiz === "object") {
    const arrays = Object.values(rawQuiz).filter((x) => Array.isArray(x));
    if (arrays.length > 0) {
      questions = arrays.reduce(
        (largest, current) =>
          current.length > largest.length ? current : largest,
        []
      );
    }
  }

  // ===== FINAL NORMALIZATION =====
  return questions.map((q, i) => {
    const text = q.question || q.text || q.prompt || `Question ${i + 1}`;

    const normalizedId =
      q._normalizedId ||
      q.id ||
      q.question_id ||
      `q_${generateStableHash(text)}_${i + 1}`;

    const type = normalizeType(q.type);
    const difficulty = normalizeDifficulty(q.difficulty);

    const maxScore = q.max_score ?? q.maxScore ?? 1;

    // Backend scoring fields
    const rawScore = q.overall_score ?? q.score ?? 0; // backend uses "score"

    const correctAnswer =
      q.correctAnswer || q.correct_answer || q.answer || null;

    // Explanation & feedback
    const explanation = q.explanation || q.feedback || null;

    return {
      ...q,

      id: String(normalizedId),
      _normalizedId: String(normalizedId),

      question: text,
      type,
      difficulty,

      max_score: maxScore,
      overall_score: rawScore,

      correctAnswer,
      explanation,

      category: q.category || q.topic || "General",
    };
  });
};

// ============================================================
// ✔ BACKEND-ALIGNED CORRECTNESS LOGIC
// ============================================================
export const isQuestionCorrect = (q) => {
  const type = normalizeType(q.type);

  // ----- Essay / Short-Answer -----
  if (type === "essay") {
    // Model-A backend rule:
    // score = matched facts
    // max_score = total facts
    // correct only if full marks
    return q.overall_score >= (q.max_score ?? 1);
  }

  // ----- MCQ / True-False -----
  // Backend sets:
  // score = 1 or 0
  // max_score = 1
  if (typeof q.overall_score === "number" && typeof q.max_score === "number") {
    return q.overall_score === q.max_score;
  }

  // Fallback safety
  return q.isCorrect ?? false;
};

// ============================================================
// 📊 CATEGORY STATS
// ============================================================
export const buildCategoryStats = (quiz) => {
  const map = {};

  quiz.forEach((q, i) => {
    const cat = q.category || "General";
    if (!map[cat]) map[cat] = { total: 0, correct: 0, items: [] };

    const correct = isQuestionCorrect(q);

    map[cat].total += 1;
    if (correct) map[cat].correct += 1;

    map[cat].items.push({
      index: i + 1,
      id: q.id,
      correct,
    });
  });

  return Object.entries(map).map(([category, v]) => ({
    category,
    total: v.total,
    correct: v.correct,
    score: v.total ? Math.round((v.correct / v.total) * 100) : 0,
    items: v.items,
  }));
};

// ============================================================
// 📊 DIFFICULTY STATS
// ============================================================
export const buildDifficultyStats = (quiz) => {
  const diffs = ["easy", "medium", "hard"];

  return diffs.map((d) => {
    const list = quiz.filter((q) => normalizeDifficulty(q.difficulty) === d);

    const total = list.length;
    const correct = list.filter(isQuestionCorrect).length;

    return {
      difficulty: d.toUpperCase(),
      total,
      correct,
      score: total ? Math.round((correct / total) * 100) : 0,
    };
  });
};

// ============================================================
// 📈 SCORE SERIES (Q1, Q2, Q3…)
// ============================================================
export const buildScoreSeries = (quiz) =>
  quiz.map((q, i) => ({
    name: `Q${i + 1}`,
    pct: q.max_score ? Math.round((q.overall_score / q.max_score) * 100) : 0,
  }));

// ============================================================
// 🧩 TYPE DISTRIBUTION FOR CHARTS
// ============================================================
export const buildTypeDistribution = (quiz) => {
  const map = {};

  quiz.forEach((q) => {
    const t = normalizeType(q.type);
    map[t] = (map[t] || 0) + 1;
  });

  const COLORS = [
    "#10b981",
    "#6366f1",
    "#f59e0b",
    "#ef4444",
    "#22c55e",
    "#06b6d4",
  ];

  return Object.entries(map).map(([type, value], i) => ({
    type,
    value,
    fill: COLORS[i % COLORS.length],
  }));
};

// ============================================================
// 🔥 HEATMAP GRID (Backend-accurate correctness)
// ============================================================
export const buildHeatmapGrid = (cats, totalQuestions) => {
  const rows = cats.map((c) => c.category);
  const cols = Array.from({ length: totalQuestions }, (_, i) => i + 1);

  const cells = [];

  rows.forEach((row) => {
    const cat = cats.find((c) => c.category === row);
    const byIndex = {};
    cat.items.forEach((it) => (byIndex[it.index] = it));

    cols.forEach((col) => {
      const item = byIndex[col];
      const value = item ? (item.correct ? 1 : 0) : -1;
      cells.push({ r: row, c: col, v: value });
    });
  });

  return { rows, cols, cells };
};

// ============================================================
// 🎯 GET USER ANSWER
// ============================================================
export const getAnswerForQuestion = (q, id, user, essay) => {
  const type = normalizeType(q.type);
  return type === "essay" ? essay[id] : user[id];
};
