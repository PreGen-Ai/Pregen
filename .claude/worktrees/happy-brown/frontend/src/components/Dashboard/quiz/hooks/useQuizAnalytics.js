import { useState, useEffect, useCallback } from "react";
import { handleApiError } from "../utils/errorHandler";
import { quizApi } from "../utils/api/quizApi";
import { reportsApi } from "../utils/api/reportsApi";
import { progressApi } from "../utils/api/progressApi";
import { analyticsApi } from "../utils/api/analyticsApi";

const useQuizAnalytics = (studentId = "student_01") => {
  // ────────────────────────────────
  // 📊 Core Analytics State
  // ────────────────────────────────
  const [analytics, setAnalytics] = useState({
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

  // Student Progress Data
  const [studentProgress, setStudentProgress] = useState({
    improvement: 0,
    progress_data: [],
    weak_areas: [],
    strong_areas: [],
    weekly_trend: [],
    monthly_comparison: null,
  });

  // Performance Metrics
  const [performanceMetrics, setPerformanceMetrics] = useState({
    accuracy_rate: 0,
    efficiency_score: 0,
    average_time_per_question: 0,
    category_breakdown: {},
    difficulty_performance: {},
    time_distribution: {},
  });

  // Dashboard Data
  const [dashboardData, setDashboardData] = useState({
    summary: {},
    recent_reports: [],
    weak_concepts: [],
    progress_timeline: [],
    recommendations: [],
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Cache for performance
  const [cache, setCache] = useState({
    analytics: null,
    progress: null,
    dashboard: null,
    timestamp: null,
  });

  // ────────────────────────────────
  // ⚡ Cache Validation
  // ────────────────────────────────
  const isCacheValid = useCallback(() => {
    if (!cache.timestamp) return false;
    return Date.now() - cache.timestamp < 5 * 60 * 1000; // 5 minutes
  }, [cache.timestamp]);

  // ────────────────────────────────
  // 📈 Load Student Progress
  // ────────────────────────────────
  const loadStudentProgress = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh && isCacheValid() && cache.progress) {
        setStudentProgress(cache.progress);
        return cache.progress;
      }

      setLoading(true);
      setError(null);

      try {
        // ✅ Corrected params object
        const response = await progressApi.getStudentProgress(studentId, {
          days: 30,
        });

        const progressData = {
          improvement: response.improvement || 0,
          progress_data: response.progress_data || generateMockProgressData(),
          weak_areas: response.weak_areas || [],
          strong_areas: response.strong_areas || [],
          weekly_trend: response.weekly_trend || generateWeeklyTrend(),
          monthly_comparison: response.monthly_comparison || null,
        };

        setStudentProgress(progressData);
        setCache((prev) => ({
          ...prev,
          progress: progressData,
          timestamp: Date.now(),
        }));

        return progressData;
      } catch (err) {
        const errorMessage = handleApiError(err, "loading student progress");
        setError(errorMessage);
        const mockProgress = generateMockProgressData();
        setStudentProgress(mockProgress);
        return mockProgress;
      } finally {
        setLoading(false);
      }
    },
    [studentId, isCacheValid, cache]
  );


  // ────────────────────────────────
  // 📊 Load Comprehensive Analytics
  // ────────────────────────────────
  const loadAnalytics = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh && isCacheValid() && cache.analytics) {
        setAnalytics(cache.analytics);
        return cache.analytics;
      }

      setLoading(true);
      setError(null);

      try {
        // Try to get from reports API first
        const reportsResponse = await reportsApi.getStudentReports(studentId);
        const analyticsData = await calculateComprehensiveAnalytics(
          reportsResponse.reports || []
        );

        // Fetch deep insights via analyticsApi (from code 2)
        const deepData = await analyticsApi.getStudentAnalytics(studentId);
        const merged = { ...analyticsData, deepInsights: deepData };

        setAnalytics(merged);
        setLastUpdated(new Date());

        // Update cache
        setCache((prev) => ({
          ...prev,
          analytics: merged,
          timestamp: Date.now(),
        }));

        return merged;
      } catch (err) {
        const errorMessage = handleApiError(err, "loading analytics");
        setError(errorMessage);

        // Fallback to localStorage analytics
        const savedAnalytics = loadAnalyticsFromStorage();
        setAnalytics(savedAnalytics);
        return savedAnalytics;
      } finally {
        setLoading(false);
      }
    },
    [studentId, isCacheValid, cache]
  );

  // ────────────────────────────────
  // 🧭 Load Dashboard Data
  // ────────────────────────────────
  const loadDashboardData = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh && isCacheValid() && cache.dashboard) {
        setDashboardData(cache.dashboard);
        return cache.dashboard;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await reportsApi.getDashboard(studentId);

        setDashboardData(response);

        // Update cache
        setCache((prev) => ({
          ...prev,
          dashboard: response,
          timestamp: Date.now(),
        }));

        return response;
      } catch (err) {
        const errorMessage = handleApiError(err, "loading dashboard");
        setError(errorMessage);

        // Fallback data
        const fallbackDashboard = generateFallbackDashboard();
        setDashboardData(fallbackDashboard);
        return fallbackDashboard;
      } finally {
        setLoading(false);
      }
    },
    [studentId, isCacheValid, cache]
  );

  // ────────────────────────────────
  // 🧠 Update Analytics on New Quiz
  // ────────────────────────────────
  const updateAnalytics = useCallback(
    (newScore, topic, timeSpent = 0, quizLength = 0) => {
      setAnalytics((prev) => {
        const totalQuizzes = prev.totalQuizzes + 1;
        const averageScore = Math.round(
          (prev.averageScore * prev.totalQuizzes + newScore) / totalQuizzes
        );

        const bestScore = Math.max(prev.bestScore, newScore);
        const worstScore = Math.min(prev.worstScore, newScore);

        const totalQuestions = prev.totalQuestions + quizLength;
        const correctAnswers =
          prev.correctAnswers + Math.round((newScore / 100) * quizLength);

        const totalTimeSpent = prev.totalTimeSpent + timeSpent;

        const topicsAttempted = [...new Set([...prev.topicsAttempted, topic])];

        // Calculate improvement (simple: compare with previous average)
        const improvement = newScore - prev.averageScore;

        // Update streak (consecutive quizzes with improvement or maintained high score)
        const streak = calculateNewStreak(prev, newScore);

        const updatedAnalytics = {
          ...prev,
          totalQuizzes,
          averageScore,
          bestScore,
          worstScore,
          totalQuestions,
          correctAnswers,
          totalTimeSpent,
          topicsAttempted,
          improvement: improvement > 0 ? improvement : 0,
          streak,
          lastActivity: new Date().toISOString(),
        };

        // Save to localStorage
        saveAnalyticsToStorage(updatedAnalytics);

        return updatedAnalytics;
      });

      // Update performance metrics
      updatePerformanceMetrics(newScore, timeSpent, quizLength);
    },
    []
  );

  // ────────────────────────────────
  // 📈 Update Performance Metrics
  // ────────────────────────────────
  const updatePerformanceMetrics = useCallback(
    (score, timeSpent, quizLength) => {
      setPerformanceMetrics((prev) => {
        const accuracy_rate = Math.round(
          ((analytics.correctAnswers + (score / 100) * quizLength) /
            (analytics.totalQuestions + quizLength)) *
            100
        );

        const efficiency_score = Math.round(
          (score / Math.max(timeSpent / 60, 1)) * 10
        ); // Score per minute

        const average_time_per_question = Math.round(
          (analytics.totalTimeSpent + timeSpent) /
            (analytics.totalQuestions + quizLength)
        );

        return {
          ...prev,
          accuracy_rate,
          efficiency_score,
          average_time_per_question,
        };
      });
    },
    [analytics]
  );

  // ────────────────────────────────
  // 🎯 Calculate Category Performance
  // ────────────────────────────────
  const calculateCategoryPerformance = useCallback((quizResults) => {
    const categoryBreakdown = {};

    quizResults.forEach((question) => {
      const category = question.category || "General";
      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = {
          total: 0,
          correct: 0,
          score: 0,
          total_time: 0,
        };
      }

      categoryBreakdown[category].total++;
      if (question.isCorrect) {
        categoryBreakdown[category].correct++;
      }
      categoryBreakdown[category].score = Math.round(
        (categoryBreakdown[category].correct /
          categoryBreakdown[category].total) *
          100
      );
    });

    setPerformanceMetrics((prev) => ({
      ...prev,
      category_breakdown: categoryBreakdown,
    }));

    return categoryBreakdown;
  }, []);

  // ────────────────────────────────
  // 🔍 Get Weak Areas
  // ────────────────────────────────
  const getWeakAreas = useCallback(
    (threshold = 60) => {
      const weakAreas = [];

      Object.entries(performanceMetrics.category_breakdown).forEach(
        ([category, data]) => {
          if (data.score < threshold) {
            weakAreas.push({
              category,
              score: data.score,
              total_questions: data.total,
              improvement_needed: threshold - data.score,
            });
          }
        }
      );

      return weakAreas.sort((a, b) => a.score - b.score);
    },
    [performanceMetrics.category_breakdown]
  );

  // ────────────────────────────────
  // 💡 Get Study Recommendations
  // ────────────────────────────────
  const getStudyRecommendations = useCallback(() => {
    const weakAreas = getWeakAreas();
    const recommendations = [];

    if (weakAreas.length > 0) {
      recommendations.push({
        type: "weak_areas",
        priority: "high",
        message: `Focus on ${weakAreas[0].category} (${weakAreas[0].score}% score)`,
        action: "practice_weak_topics",
      });
    }

    if (performanceMetrics.efficiency_score < 50) {
      recommendations.push({
        type: "time_management",
        priority: "medium",
        message: "Improve time management - practice timed quizzes",
        action: "timed_practice",
      });
    }

    if (analytics.streak >= 3) {
      recommendations.push({
        type: "momentum",
        priority: "low",
        message: "Great streak! Maintain consistency",
        action: "continue_current_pace",
      });
    }

    // Add general recommendations
    if (recommendations.length === 0) {
      recommendations.push({
        type: "maintenance",
        priority: "low",
        message: "Solid performance! Try more challenging topics",
        action: "advanced_topics",
      });
    }

    return recommendations;
  }, [getWeakAreas, performanceMetrics.efficiency_score, analytics.streak]);

  // ────────────────────────────────
  // 🏥 Quiz System Health Check
  // ────────────────────────────────
  const checkQuizHealth = useCallback(async () => {
    try {
      const health = await quizApi.checkHealth();
      console.info("✅ Quiz service health:", health.status || "OK");
      return health;
    } catch (err) {
      console.warn("⚠️ Quiz service unreachable:", err.message);
      return { status: "unreachable" };
    }
  }, []);

  // ────────────────────────────────
  // 🔁 Refresh & Initial Load
  // ────────────────────────────────
  const refreshAllData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadAnalytics(true),
        loadStudentProgress(true),
        loadDashboardData(true),
      ]);
    } catch (err) {
      setError(handleApiError(err, "refreshing all data"));
    } finally {
      setLoading(false);
    }
  }, [loadAnalytics, loadStudentProgress, loadDashboardData]);

  // ────────────────────────────────
  // 📤 Export Analytics Data
  // ────────────────────────────────
  const exportAnalyticsData = useCallback(() => {
    const exportData = {
      analytics,
      studentProgress,
      performanceMetrics,
      dashboardData,
      exported_at: new Date().toISOString(),
      student_id: studentId,
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `analytics-${studentId}-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [
    analytics,
    studentProgress,
    performanceMetrics,
    dashboardData,
    studentId,
  ]);

  // ────────────────────────────────
  // 🔄 Reset Analytics
  // ────────────────────────────────
  const resetAnalytics = useCallback(() => {
    const defaultAnalytics = {
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
    };

    setAnalytics(defaultAnalytics);
    setStudentProgress({
      improvement: 0,
      progress_data: [],
      weak_areas: [],
      strong_areas: [],
      weekly_trend: [],
      monthly_comparison: null,
    });
    setPerformanceMetrics({
      accuracy_rate: 0,
      efficiency_score: 0,
      average_time_per_question: 0,
      category_breakdown: {},
      difficulty_performance: {},
      time_distribution: {},
    });

    localStorage.removeItem("quizAnalytics");
    localStorage.removeItem("studentProgress");

    setCache({
      analytics: null,
      progress: null,
      dashboard: null,
      timestamp: null,
    });
  }, []);

  // ────────────────────────────────
  // 🔄 Initial Data Load
  // ────────────────────────────────
  useEffect(() => {
    const loadInitialData = async () => {
      await loadAnalytics();
      await loadStudentProgress();
      await loadDashboardData();
      await checkQuizHealth();
    };

    loadInitialData();
  }, [loadAnalytics, loadStudentProgress, loadDashboardData, checkQuizHealth]);

  // ────────────────────────────────
  // 🧮 Calculate Comprehensive Analytics
  // ────────────────────────────────
  const calculateComprehensiveAnalytics = async (reports) => {
    if (!reports || reports.length === 0) {
      return loadAnalyticsFromStorage();
    }

    let totalQuizzes = reports.length;
    let totalScore = 0;
    let bestScore = 0;
    let worstScore = 100;
    let totalQuestions = 0;
    let correctAnswers = 0;
    let totalTimeSpent = 0;
    const topicsAttempted = new Set();

    reports.forEach((report) => {
      const score = report.overall_score || 0;
      totalScore += score;
      bestScore = Math.max(bestScore, score);
      worstScore = Math.min(worstScore, score);

      totalQuestions += report.total_questions || 0;
      correctAnswers += report.correct_answers || 0;
      totalTimeSpent += report.time_spent || 0;

      if (report.topic) {
        topicsAttempted.add(report.topic);
      }
    });

    const averageScore = Math.round(totalScore / totalQuizzes);
    const improvement = calculateImprovementTrend(reports);

    return {
      totalQuizzes,
      averageScore,
      bestScore,
      worstScore,
      totalQuestions,
      correctAnswers,
      totalTimeSpent,
      topicsAttempted: Array.from(topicsAttempted),
      improvement,
      streak: calculateCurrentStreak(reports),
      lastActivity: reports[0]?.timestamp || new Date().toISOString(),
    };
  };

  // ────────────────────────────────
  // 🧭 Return
  // ────────────────────────────────
  return {
    // State
    analytics,
    studentProgress,
    performanceMetrics,
    dashboardData,
    loading,
    error,
    lastUpdated,

    // Actions
    updateAnalytics,
    loadStudentProgress,
    loadAnalytics,
    loadDashboardData,
    refreshAllData,
    calculateCategoryPerformance,
    getWeakAreas,
    getStudyRecommendations,
    exportAnalyticsData,
    resetAnalytics,
    checkQuizHealth,

    // Derived data
    accuracyRate: performanceMetrics.accuracy_rate,
    efficiencyScore: performanceMetrics.efficiency_score,
    averageTimePerQuestion: performanceMetrics.average_time_per_question,
    weakAreas: getWeakAreas(),
    studyRecommendations: getStudyRecommendations(),

    // Status
    hasData: analytics.totalQuizzes > 0,
    isLoading: loading,
    lastUpdate: lastUpdated,
  };
};

// ────────────────────────────────
// 📚 Helper Functions
// ────────────────────────────────
const calculateNewStreak = (prevAnalytics, newScore) => {
  if (newScore >= prevAnalytics.averageScore) {
    return prevAnalytics.streak + 1;
  } else {
    return 0;
  }
};

const calculateImprovementTrend = (reports) => {
  if (reports.length < 2) return 0;

  const recentScores = reports.slice(0, 5).map((r) => r.overall_score || 0);
  const olderScores = reports.slice(-5).map((r) => r.overall_score || 0);

  const recentAvg =
    recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
  const olderAvg = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;

  return Math.round(recentAvg - olderAvg);
};

const calculateCurrentStreak = (reports) => {
  if (reports.length < 2) return 1;

  let streak = 1;
  for (let i = 1; i < reports.length; i++) {
    if (
      (reports[i - 1].overall_score || 0) <= (reports[i].overall_score || 0)
    ) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
};

const loadAnalyticsFromStorage = () => {
  try {
    const saved = localStorage.getItem("quizAnalytics");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error("Error loading analytics from storage:", error);
  }

  return {
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
  };
};

const saveAnalyticsToStorage = (analytics) => {
  try {
    localStorage.setItem("quizAnalytics", JSON.stringify(analytics));
  } catch (error) {
    console.error("Error saving analytics to storage:", error);
  }
};

const generateMockProgressData = () => {
  return Array.from({ length: 7 }, (_, i) => ({
    date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString(),
    average_score: Math.floor(Math.random() * 30) + 60,
    quizzes_taken: Math.floor(Math.random() * 3) + 1,
    total_questions: Math.floor(Math.random() * 20) + 10,
    correct_answers: Math.floor(Math.random() * 15) + 8,
  }));
};

const generateWeeklyTrend = () => {
  return Array.from({ length: 4 }, (_, i) => ({
    week: i + 1,
    average_score: Math.floor(Math.random() * 25) + 65,
    quizzes_taken: Math.floor(Math.random() * 5) + 2,
    improvement: Math.floor(Math.random() * 10) - 2,
  }));
};

const generateFallbackDashboard = () => ({
  summary: {
    total_quizzes: 0,
    average_score: 0,
    best_score: 0,
    total_learning_time: 0,
  },
  recent_reports: [],
  weak_concepts: [],
  progress_timeline: [],
  recommendations: [
    {
      type: "get_started",
      message: "Complete your first quiz to see analytics",
      action: "take_first_quiz",
    },
  ],
});

export default useQuizAnalytics;
