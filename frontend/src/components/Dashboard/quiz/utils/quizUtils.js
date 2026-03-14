// utils/quizUtils.js

/**
 * QUIZ UTILITY FUNCTIONS
 * A comprehensive collection of helper functions for quiz operations
 */

// ==================== TIME & FORMATTING UTILITIES ====================

/**
 * Format seconds into human-readable time string
 * @param {number} seconds - Time in seconds
 * @param {boolean} includeHours - Whether to include hours in output
 * @returns {string} Formatted time string
 */
export const formatTime = (seconds, includeHours = false) => {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "00:00";
  if (!seconds && seconds !== 0) return "00:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (includeHours || hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
};

/**
 * Format time for display with units
 * @param {number} seconds - Time in seconds
 * @returns {string} Human-readable time with units
 */
export const formatTimeWithUnits = (seconds) => {
  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? "s" : ""}`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) {
      return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (minutes === 0) {
      return `${hours} hour${hours !== 1 ? "s" : ""}`;
    }
    return `${hours}h ${minutes}m`;
  }
};

/**
 * Calculate average time per question
 * @param {number} totalTime - Total time spent in seconds
 * @param {number} questionCount - Number of questions
 * @returns {string} Average time per question
 */
export const calculateAverageTimePerQuestion = (totalTime, questionCount) => {
  if (!questionCount || questionCount === 0) return "0s";
  const averageSeconds = Math.round(totalTime / questionCount);
  return formatTimeWithUnits(averageSeconds);
};

/**
 * Calculate efficiency score (points per minute)
 * @param {number} score - Total points earned
 * @param {number} timeSpent - Time spent in seconds
 * @returns {number} Efficiency score
 */
export const calculateEfficiencyScore = (score, timeSpent) => {
  if (!timeSpent || timeSpent === 0) return 0;
  const minutes = timeSpent / 60;
  return Math.round((score / minutes) * 100) / 100; // Round to 2 decimal places
};

// ==================== SCORE & PERFORMANCE UTILITIES ====================

/**
 * Normalize raw score to percentage
 * @param {number} rawScore - Raw score from backend
 * @param {number} totalPossible - Total possible points
 * @returns {number} Normalized percentage (0-100)
 */
export const normalizeScore = (rawScore, totalPossible) => {
  if (!totalPossible || totalPossible === 0) return 0;
  return Math.round((rawScore / totalPossible) * 100);
};

/**
 * Get performance message based on score
 * @param {number} score - Percentage score (0-100)
 * @returns {Object} Performance message and metadata
 */
export const getPerformanceMessage = (score) => {
  const performanceData = [
    {
      threshold: 90,
      message: "🎉 Outstanding!",
      emoji: "🏆",
      color: "#10b981",
      level: "excellent",
    },
    {
      threshold: 80,
      message: "👍 Excellent Work!",
      emoji: "⭐",
      color: "#22c55e",
      level: "great",
    },
    {
      threshold: 70,
      message: "💪 Great Job!",
      emoji: "✨",
      color: "#84cc16",
      level: "good",
    },
    {
      threshold: 60,
      message: "📚 Good Effort!",
      emoji: "📖",
      color: "#eab308",
      level: "average",
    },
    {
      threshold: 50,
      message: "🔍 Keep Practicing!",
      emoji: "🎯",
      color: "#f97316",
      level: "needs_improvement",
    },
    {
      threshold: 0,
      message: "📖 Room for Improvement",
      emoji: "💪",
      color: "#ef4444",
      level: "poor",
    },
  ];

  const performance =
    performanceData.find((p) => score >= p.threshold) ||
    performanceData[performanceData.length - 1];

  return {
    ...performance,
    score,
    description: getPerformanceDescription(score),
  };
};

/**
 * Get detailed performance description
 * @param {number} score - Percentage score
 * @returns {string} Detailed description
 */
const getPerformanceDescription = (score) => {
  if (score >= 90)
    return "You've demonstrated exceptional understanding of the material!";
  if (score >= 80) return "Strong performance showing solid grasp of concepts!";
  if (score >= 70) return "Good understanding with some areas for refinement!";
  if (score >= 60) return "Solid foundation with room for growth!";
  if (score >= 50) return "Keep practicing to improve your understanding!";
  return "Review the material and try again - you'll get better!";
};

/**
 * Calculate score color based on percentage
 * @param {number} score - Percentage score (0-100)
 * @returns {string} CSS color value
 */
export const getScoreColor = (score) => {
  if (score >= 80) return "#10b981"; // Green
  if (score >= 60) return "#f59e0b"; // Amber
  return "#ef4444"; // Red
};

/**
 * Calculate improvement percentage
 * @param {number} currentScore - Current average score
 * @param {number} previousScore - Previous average score
 * @returns {number} Improvement percentage (can be negative)
 */
export const calculateImprovement = (currentScore, previousScore) => {
  if (!previousScore || previousScore === 0) return 0;
  return Math.round((currentScore - previousScore) * 100) / 100;
};

/**
 * Calculate streak based on consecutive improvements
 * @param {Array} scores - Array of recent scores
 * @param {number} minImprovement - Minimum improvement to count as streak
 * @returns {number} Current streak count
 */
export const calculateStreak = (scores, minImprovement = 0) => {
  if (scores.length < 2) return 0;

  let streak = 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] >= scores[i - 1] + minImprovement) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
};

// ==================== QUESTION & ANSWER UTILITIES ====================

/**
 * Validate if all questions are answered
 * @param {Array} quiz - Array of quiz questions
 * @param {Object} userAnswers - User's multiple choice answers
 * @param {Object} essayAnswers - User's essay answers
 * @returns {boolean} Whether all questions are answered
 */
export const allQuestionsAnswered = (quiz, userAnswers, essayAnswers) => {
  return quiz.every((question) => {
    switch (question.type) {
      case "multiple_choice":
      case "true_false":
        return (
          userAnswers[question.id] !== undefined &&
          userAnswers[question.id] !== null &&
          userAnswers[question.id] !== ""
        );
      case "essay":
        return essayAnswers[question.id]?.trim().length > 0;
      default:
        return true; // Other question types
    }
  });
};

/**
 * Count answered questions
 * @param {Array} quiz - Array of quiz questions
 * @param {Object} userAnswers - User's multiple choice answers
 * @param {Object} essayAnswers - User's essay answers
 * @returns {number} Number of answered questions
 */
export const countAnsweredQuestions = (quiz, userAnswers, essayAnswers) => {
  return quiz.reduce((count, question) => {
    switch (question.type) {
      case "multiple_choice":
      case "true_false":
        if (
          userAnswers[question.id] !== undefined &&
          userAnswers[question.id] !== null &&
          userAnswers[question.id] !== ""
        ) {
          return count + 1;
        }
        return count;
      case "essay":
        if (essayAnswers[question.id]?.trim().length > 0) {
          return count + 1;
        }
        return count;
      default:
        return count;
    }
  }, 0);
};

/**
 * Calculate progress percentage
 * @param {Array} quiz - Array of quiz questions
 * @param {Object} userAnswers - User's multiple choice answers
 * @param {Object} essayAnswers - User's essay answers
 * @returns {number} Progress percentage (0-100)
 */
export const calculateProgressPercentage = (
  quiz,
  userAnswers,
  essayAnswers
) => {
  if (!quiz.length) return 0;
  const answered = countAnsweredQuestions(quiz, userAnswers, essayAnswers);
  return Math.round((answered / quiz.length) * 100);
};

/**
 * Get option letter from index (0 -> 'A', 1 -> 'B', etc.)
 * @param {number} index - Option index
 * @returns {string} Option letter
 */
export const getOptionLetter = (index) => {
  return String.fromCharCode(65 + index); // 65 = 'A' in ASCII
};

/**
 * Get option index from letter ('A' -> 0, 'B' -> 1, etc.)
 * @param {string} letter - Option letter
 * @returns {number} Option index
 */
export const getOptionIndex = (letter) => {
  if (!letter) return -1;
  return letter.charCodeAt(0) - 65; // 65 = 'A' in ASCII
};

/**
 * Validate essay word count
 * @param {string} text - Essay text
 * @param {number} minWords - Minimum word count
 * @param {number} maxWords - Maximum word count
 * @returns {Object} Validation result
 */
export const validateEssayWordCount = (text, minWords = 50, maxWords = 500) => {
  const words = text.trim() ? text.trim().split(/\s+/) : [];
  const wordCount = words.length;
  const charCount = text.length;

  return {
    wordCount,
    charCount,
    isValid: wordCount >= minWords && wordCount <= maxWords,
    isTooShort: wordCount < minWords,
    isTooLong: wordCount > maxWords,
    minWords,
    maxWords,
    wordsRemaining: Math.max(0, minWords - wordCount),
    wordsOver: Math.max(0, wordCount - maxWords),
  };
};

/**
 * Calculate reading time for text
 * @param {string} text - Text to calculate reading time for
 * @param {number} wordsPerMinute - Average reading speed (default: 200)
 * @returns {number} Reading time in minutes
 */
export const calculateReadingTime = (text, wordsPerMinute = 200) => {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
};

// ==================== QUIZ GENERATION & FORMATTING UTILITIES ====================

/**
 * Format quiz data from API response
 * @param {Array|Object} apiResponse - Raw API response
 * @param {string} questionType - Type of questions
 * @returns {Array} Formatted quiz questions
 */
export const formatQuizData = (
  apiResponse,
  questionType = "multiple_choice"
) => {
  const rawQuiz =
    apiResponse.quiz || apiResponse.questions || apiResponse || [];

  if (!Array.isArray(rawQuiz)) {
    console.warn("Invalid quiz data format:", rawQuiz);
    return [];
  }

  return rawQuiz.map((item, index) => {
    const baseQuestion = {
      id: item.id || index + 1, // Preserve backend ID if available
      question: item.question || `Question ${index + 1}`,
      explanation: item.explanation || "No explanation provided.",
      type: item.type || questionType,
      difficulty: item.difficulty || "medium",
      category: item.category || "General",
      max_score: item.max_score || (item.type === "essay" ? 10 : 1),
      userAnswer: null,
      isCorrect: false,
      overall_score: 0,
    };

    // Handle different question types
    if (item.type === "essay" || questionType === "essay") {
      return {
        ...baseQuestion,
        type: "essay",
        correctAnswer:
          item.expected_answer ||
          item.correct_answer ||
          item.answer ||
          "Essay question",
        solution_steps: item.solution_steps || [], // Backend compatible field
        rubric_points:
          item.rubric_points ||
          generateDefaultRubricPoints(item.max_score || 10),
        min_words: item.min_words || 50,
        max_words: item.max_words || 500,
      };
    } else if (item.type === "true_false") {
      return {
        ...baseQuestion,
        type: "true_false",
        options: ["True", "False"],
        correctAnswer: item.answer || item.correct_answer || "True",
      };
    } else {
      // Multiple choice or other types
      return {
        ...baseQuestion,
        type: item.type || "multiple_choice",
        options: item.options || generateDefaultOptions(),
        correctAnswer: item.answer || item.correct_answer || "A",
      };
    }
  });
};

/**
 * Generate default options for multiple choice questions
 * @returns {Array} Default options
 */
const generateDefaultOptions = () => {
  return ["Option A", "Option B", "Option C", "Option D"];
};

/**
 * Generate default rubric points for essay questions
 * @param {number} maxScore - Maximum score for the question
 * @returns {Array} Default rubric points
 */
const generateDefaultRubricPoints = (maxScore) => {
  const pointsPerCriterion = Math.max(1, Math.floor(maxScore / 4));

  return [
    `Clear thesis statement (${pointsPerCriterion} points)`,
    `Supporting evidence and examples (${pointsPerCriterion} points)`,
    `Logical structure and organization (${pointsPerCriterion} points)`,
    `Grammar, spelling, and clarity (${pointsPerCriterion} points)`,
  ];
};

/**
 * Shuffle array (Fisher-Yates algorithm)
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
 */
export const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

/**
 * Shuffle quiz options (for multiple choice questions)
 * @param {Array} quiz - Quiz questions
 * @returns {Array} Quiz with shuffled options
 */
export const shuffleQuizOptions = (quiz) => {
  return quiz.map((question) => {
    if (question.type === "multiple_choice" && question.options) {
      // Store the correct answer VALUE before shuffling
      const correctIndex = getOptionIndex(question.correctAnswer);
      const correctValue = question.options[correctIndex];

      const shuffledOptions = shuffleArray(question.options);

      // Find new position of correct value
      const newCorrectIndex = shuffledOptions.indexOf(correctValue);
      const newCorrectAnswer = getOptionLetter(newCorrectIndex);

      return {
        ...question,
        options: shuffledOptions,
        correctAnswer:
          newCorrectIndex >= 0 ? newCorrectAnswer : question.correctAnswer,
      };
    }
    return question;
  });
};

/**
 * Convert frontend quiz format to backend grading format
 * @param {Array} frontendQuiz - Frontend quiz questions
 * @returns {Array} Backend-compatible quiz format
 */
export const convertToBackendFormat = (frontendQuiz) => {
  return frontendQuiz.map((question) => {
    const baseQuestion = {
      id: question.id.toString(), // Ensure string ID for backend
      question: question.question,
      type: question.type,
    };

    if (question.type === "multiple_choice" || question.type === "true_false") {
      return {
        ...baseQuestion,
        answer: question.correctAnswer, // Backend expects 'answer' field
        options: question.options,
      };
    } else if (question.type === "essay") {
      return {
        ...baseQuestion,
        expected_answer: question.correctAnswer, // Backend field name
        solution_steps: question.solution_steps || [], // Map to backend field
      };
    }

    return baseQuestion;
  });
};

// ==================== DIFFICULTY & CATEGORY UTILITIES ====================

/**
 * Get difficulty color
 * @param {string} difficulty - Difficulty level
 * @returns {string} CSS color value
 */
export const getDifficultyColor = (difficulty) => {
  const colors = {
    easy: "#10b981",
    medium: "#f59e0b",
    hard: "#ef4444",
    expert: "#7c3aed",
  };
  return colors[difficulty?.toLowerCase()] || "#6b7280";
};

/**
 * Get difficulty icon
 * @param {string} difficulty - Difficulty level
 * @returns {string} Emoji icon
 */
export const getDifficultyIcon = (difficulty) => {
  const icons = {
    easy: "🌱",
    medium: "💪",
    hard: "🔥",
    expert: "🚀",
  };
  return icons[difficulty?.toLowerCase()] || "❓";
};

/**
 * Calculate category performance
 * @param {Array} quiz - Quiz questions with results
 * @returns {Object} Category performance data
 */
export const calculateCategoryPerformance = (quiz) => {
  const categories = {};

  quiz.forEach((question) => {
    const category = question.category || "General";
    if (!categories[category]) {
      categories[category] = {
        total: 0,
        correct: 0,
        score: 0,
        totalTime: 0,
        averageTime: 0,
      };
    }

    categories[category].total++;
    if (question.isCorrect) {
      categories[category].correct++;
    }

    // Avoid division by zero
    if (categories[category].total > 0) {
      categories[category].score = Math.round(
        (categories[category].correct / categories[category].total) * 100
      );
    } else {
      categories[category].score = 0;
    }
  });

  return categories;
};

/**
 * Get weak areas from category performance
 * @param {Object} categoryPerformance - Category performance data
 * @param {number} threshold - Score threshold for weak areas (default: 60)
 * @returns {Array} Weak areas sorted by performance
 */
export const getWeakAreas = (categoryPerformance, threshold = 60) => {
  return Object.entries(categoryPerformance)
    .filter(([_, data]) => data.score < threshold)
    .map(([category, data]) => ({
      category,
      score: data.score,
      totalQuestions: data.total,
      correctAnswers: data.correct,
      improvementNeeded: threshold - data.score,
    }))
    .sort((a, b) => a.score - b.score);
};

// ==================== STORAGE & PERSISTENCE UTILITIES ====================

/**
 * Save quiz progress to localStorage
 * @param {Object} progress - Quiz progress data
 */
export const saveQuizProgress = (progress) => {
  try {
    const progressData = {
      ...progress,
      timestamp: Date.now(),
      version: "1.1", // Updated version for new format
    };
    localStorage.setItem("quizProgress", JSON.stringify(progressData));
  } catch (error) {
    console.error("Error saving quiz progress:", error);
    // Handle quota exceeded errors gracefully
    if (error.name === "QuotaExceededError") {
      console.warn("LocalStorage quota exceeded, clearing old data");
      clearQuizStorage();
    }
  }
};

/**
 * Load quiz progress from localStorage
 * @returns {Object|null} Saved progress or null
 */
export const loadQuizProgress = () => {
  try {
    const saved = localStorage.getItem("quizProgress");
    if (saved) {
      const progress = JSON.parse(saved);
      // Check if progress is recent (within 2 hours)
      if (Date.now() - progress.timestamp < 2 * 60 * 60 * 1000) {
        return progress;
      } else {
        // Clear expired progress
        localStorage.removeItem("quizProgress");
      }
    }
  } catch (error) {
    console.error("Error loading quiz progress:", error);
  }
  return null;
};

/**
 * Save analytics to localStorage
 * @param {Object} analytics - Analytics data
 */
export const saveAnalyticsToStorage = (analytics) => {
  try {
    localStorage.setItem("quizAnalytics", JSON.stringify(analytics));
  } catch (error) {
    console.error("Error saving analytics:", error);
    if (error.name === "QuotaExceededError") {
      console.warn("LocalStorage quota exceeded");
    }
  }
};

/**
 * Load analytics from localStorage
 * @returns {Object} Analytics data
 */
export const loadAnalyticsFromStorage = () => {
  try {
    const saved = localStorage.getItem("quizAnalytics");
    return saved ? JSON.parse(saved) : getDefaultAnalytics();
  } catch (error) {
    console.error("Error loading analytics:", error);
    return getDefaultAnalytics();
  }
};

/**
 * Get default analytics structure
 * @returns {Object} Default analytics data
 */
const getDefaultAnalytics = () => ({
  totalQuizzes: 0,
  averageScore: 0,
  bestScore: 0,
  worstScore: 100,
  totalQuestions: 0,
  correctAnswers: 0,
  totalTimeSpent: 0,
  topicsAttempted: [],
  improvement: 0,
  streak: 0,
  lastActivity: null,
});

/**
 * Clear all quiz-related data from storage
 */
export const clearQuizStorage = () => {
  try {
    localStorage.removeItem("quizProgress");
    localStorage.removeItem("quizAnalytics");
  } catch (error) {
    console.error("Error clearing quiz storage:", error);
  }
};

// ==================== EXPORT & IMPORT UTILITIES ====================

/**
 * Export quiz data to JSON file
 * @param {Object} data - Data to export
 * @param {string} filename - Export filename
 */
export const exportToJSON = (data, filename = "quiz-data") => {
  try {
    const exportData = {
      ...data,
      exported_at: new Date().toISOString(),
      version: "1.1",
      source: "AI Quiz Generator",
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error("Error exporting data:", error);
    return false;
  }
};

/**
 * Import quiz data from JSON file
 * @param {File} file - JSON file to import
 * @returns {Promise<Object>} Imported data
 */
export const importFromJSON = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);

        // Validate imported data structure
        if (!isValidQuizData(data)) {
          reject(new Error("Invalid quiz data format"));
          return;
        }

        resolve(data);
      } catch (error) {
        reject(new Error("Error parsing JSON file"));
      }
    };

    reader.onerror = () => {
      reject(new Error("Error reading file"));
    };

    reader.readAsText(file);
  });
};

/**
 * Validate imported quiz data structure
 * @param {Object} data - Data to validate
 * @returns {boolean} Whether data is valid
 */
const isValidQuizData = (data) => {
  if (!data) return false;

  // Check for required quiz structure
  const hasValidQuiz =
    Array.isArray(data.quiz) &&
    data.quiz.every((q) => q && typeof q.question === "string" && q.type);

  const hasValidQuestions =
    Array.isArray(data.questions) &&
    data.questions.every((q) => q && typeof q.question === "string" && q.type);

  return (
    hasValidQuiz ||
    hasValidQuestions ||
    (data.settings && typeof data.settings === "object")
  );
};

// ==================== VALIDATION UTILITIES ====================

/**
 * Validate quiz settings
 * @param {Object} settings - Quiz settings to validate
 * @returns {Object} Validation result
 */
export const validateQuizSettings = (settings) => {
  const errors = {};

  if (!settings.topic?.trim()) {
    errors.topic = "Topic is required";
  } else if (settings.topic.length < 2) {
    errors.topic = "Topic must be at least 2 characters long";
  } else if (settings.topic.length > 100) {
    errors.topic = "Topic must not exceed 100 characters";
  }

  if (!settings.numQuestions || settings.numQuestions < 1) {
    errors.numQuestions = "Number of questions must be at least 1";
  } else if (settings.numQuestions > 50) {
    errors.numQuestions = "Number of questions cannot exceed 50";
  }

  if (!settings.subject?.trim()) {
    errors.subject = "Subject is required";
  }

  // Validate question types
  if (settings.questionTypes) {
    const validTypes = ["multiple_choice", "true_false", "essay"];
    const invalidTypes = settings.questionTypes.filter(
      (type) => !validTypes.includes(type)
    );
    if (invalidTypes.length > 0) {
      errors.questionTypes = `Invalid question types: ${invalidTypes.join(
        ", "
      )}`;
    }
  }

  // Validate difficulty
  if (settings.difficulty) {
    const validDifficulties = ["easy", "medium", "hard", "expert"];
    if (!validDifficulties.includes(settings.difficulty)) {
      errors.difficulty = `Difficulty must be one of: ${validDifficulties.join(
        ", "
      )}`;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Sanitize user input for safety
 * @param {string} input - User input to sanitize
 * @returns {string} Sanitized input
 */
export const sanitizeInput = (input) => {
  if (typeof input !== "string") return "";

  return input
    .trim()
    .replace(/[<>"'`]/g, "") // Remove dangerous characters to prevent HTML/JS injection
    .replace(/[^\w\s.,!?-]/g, "") // Remove special characters except basic punctuation
    .substring(0, 1000); // Limit length
};

// ==================== MOCK DATA GENERATORS (for development) ====================

/**
 * Generate mock quiz data for testing
 * @param {number} count - Number of questions to generate
 * @param {string} type - Question type
 * @returns {Array} Mock quiz questions
 */
export const generateMockQuiz = (count = 5, type = "multiple_choice") => {
  const questions = [];

  for (let i = 1; i <= count; i++) {
    if (type === "essay") {
      questions.push({
        id: i,
        question: `Mock Essay Question ${i} about the specified topic?`,
        type: "essay",
        difficulty: i % 3 === 0 ? "hard" : i % 2 === 0 ? "medium" : "easy",
        category: "General",
        max_score: 10,
        expected_answer:
          "This is a sample model answer for the essay question.",
        solution_steps: [
          "Address the main topic clearly",
          "Provide supporting evidence",
          "Use proper structure and organization",
          "Check grammar and spelling",
        ],
        rubric_points: [
          "Clear thesis statement (2.5 points)",
          "Supporting evidence (2.5 points)",
          "Logical structure (2.5 points)",
          "Grammar and spelling (2.5 points)",
        ],
        min_words: 50,
        max_words: 500,
      });
    } else if (type === "true_false") {
      questions.push({
        id: i,
        question: `Mock True/False Question ${i}?`,
        type: "true_false",
        difficulty: i % 3 === 0 ? "hard" : i % 2 === 0 ? "medium" : "easy",
        category: "General",
        max_score: 1,
        options: ["True", "False"],
        correctAnswer: i % 2 === 0 ? "True" : "False",
        explanation: `This is the explanation for question ${i}`,
      });
    } else {
      questions.push({
        id: i,
        question: `Mock Multiple Choice Question ${i}?`,
        type: "multiple_choice",
        difficulty: i % 3 === 0 ? "hard" : i % 2 === 0 ? "medium" : "easy",
        category: "General",
        max_score: 1,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: "A",
        explanation: `This is the explanation for question ${i}`,
      });
    }
  }

  return questions;
};

/**
 * Generate mock progress data
 * @param {number} days - Number of days to generate data for
 * @returns {Array} Mock progress data
 */
export const generateMockProgressData = (days = 7) => {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - i));

    return {
      date: date.toISOString().split("T")[0],
      average_score: Math.floor(Math.random() * 30) + 60,
      quizzes_taken: Math.floor(Math.random() * 3) + 1,
      total_questions: Math.floor(Math.random() * 20) + 10,
      correct_answers: Math.floor(Math.random() * 15) + 8,
    };
  });
};

// ==================== EXPORT ALL UTILITIES ====================

export default {
  // Time & Formatting
  formatTime,
  formatTimeWithUnits,
  calculateAverageTimePerQuestion,
  calculateEfficiencyScore,

  // Score & Performance
  normalizeScore,
  getPerformanceMessage,
  getScoreColor,
  calculateImprovement,
  calculateStreak,

  // Question & Answer
  allQuestionsAnswered,
  countAnsweredQuestions,
  calculateProgressPercentage,
  getOptionLetter,
  getOptionIndex,
  validateEssayWordCount,
  calculateReadingTime,

  // Quiz Generation & Formatting
  formatQuizData,
  shuffleArray,
  shuffleQuizOptions,
  convertToBackendFormat,

  // Difficulty & Category
  getDifficultyColor,
  getDifficultyIcon,
  calculateCategoryPerformance,
  getWeakAreas,

  // Storage & Persistence
  saveQuizProgress,
  loadQuizProgress,
  saveAnalyticsToStorage,
  loadAnalyticsFromStorage,
  clearQuizStorage,

  // Export & Import
  exportToJSON,
  importFromJSON,

  // Validation
  validateQuizSettings,
  sanitizeInput,

  // Mock Data
  generateMockQuiz,
  generateMockProgressData,
};
