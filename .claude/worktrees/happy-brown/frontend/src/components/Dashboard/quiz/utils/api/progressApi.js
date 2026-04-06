// utils/api/progressApi.js
import api from "./apiConfig";
import { handleApiError, ApiError } from "../errorHandler";

/**
 * 🧭 PROGRESS API MODULE (Model-A aligned, fault-tolerant)
 * FastAPI → reports/progress
 * Node backend → analytics/*
 */
export const progressApi = {
  /*───────────────────────────────────────────────────────────
   📈 1) STUDENT PROGRESS (FastAPI)
   POST /api/reports/progress
  ───────────────────────────────────────────────────────────*/
  getStudentProgress: async (studentId, params = {}) => {
    try {
      if (!studentId)
        throw new ApiError("Student ID is required", "VALIDATION_ERROR");

      const payload = {
        student_id: studentId,
        days: params.days || 30,
      };

      const response = await api.post(`/api/reports/progress`, payload, {
        timeout: 45000,
      });

      return normalizeProgressData(response.data, studentId, params);
    } catch (error) {
      throw handleApiError(error, `fetching progress for student ${studentId}`);
    }
  },

  /*───────────────────────────────────────────────────────────
   📉 2) WEAK AREAS (Node Backend)
   GET /analytics/students/:id/weak-areas
  ───────────────────────────────────────────────────────────*/
  getWeakAreas: async (studentId, params = {}) => {
    try {
      if (!studentId)
        throw new ApiError("Student ID is required", "VALIDATION_ERROR");

      const res = await api.get(`/analytics/students/${studentId}/weak-areas`, {
        params: {
          threshold: params.threshold || 60,
          min_questions: params.min_questions || 5,
          limit: params.limit || 10,
        },
        timeout: 30000,
      });

      const list = res.data.weak_areas || res.data || [];

      return list.map((area) => ({
        category: area.category || area.topic || "Unknown",
        score: area.score || 0,
        total_questions: area.total_questions || 0,
        correct_answers: area.correct_answers || 0,
        improvement_needed: (params.threshold || 60) - (area.score || 0),
        trend: calculateTrend(area.trend),
        last_attempted: area.last_attempted || null,
        recommendation:
          area.recommendation || `Focus more on ${area.category || area.topic}`,
      }));
    } catch (error) {
      throw handleApiError(
        error,
        `fetching weak areas for student ${studentId}`
      );
    }
  },

  /*───────────────────────────────────────────────────────────
   🕒 3) TIMELINE PROGRESS (Node Backend)
   GET /analytics/students/:id/timeline
  ───────────────────────────────────────────────────────────*/
  getProgressTimeline: async (studentId, params = {}) => {
    try {
      if (!studentId)
        throw new ApiError("Student ID is required", "VALIDATION_ERROR");

      const res = await api.get(`/analytics/students/${studentId}/timeline`, {
        params: {
          period: params.period || "monthly",
          data_points: params.data_points || 12,
          include_metrics: true,
        },
        timeout: 30000,
      });

      const timeline = res.data.timeline || res.data || [];

      return timeline.map((p) => ({
        period: p.period || p.date || p.week || p.month,
        average_score: Number(p.average_score || 0),
        quizzes_taken: Number(p.quizzes_taken || 0),
        total_questions: Number(p.total_questions || 0),
        correct_answers: Number(p.correct_answers || 0),
        total_time: Number(p.total_time || 0),
        improvement: Number(p.improvement || 0),
        trend: calculateTrend(p.trend || p.score_trend),
      }));
    } catch (error) {
      throw handleApiError(error, `fetching timeline for ${studentId}`);
    }
  },

  /*───────────────────────────────────────────────────────────
   🤖 4) AI Learning Recommendations (Node Backend)
   GET /analytics/students/:id/recommendations
  ───────────────────────────────────────────────────────────*/
  getLearningRecommendations: async (studentId, params = {}) => {
    try {
      if (!studentId)
        throw new ApiError("Student ID is required", "VALIDATION_ERROR");

      const res = await api.get(
        `/analytics/students/${studentId}/recommendations`,
        {
          params: {
            limit: params.limit || 5,
            include_resources: true,
            focus: params.focus || "weak_areas",
          },
          timeout: 30000,
        }
      );

      const recs = res.data.recommendations || res.data || [];

      return recs.map((r) => ({
        id: r.id || `rec_${Math.random().toString(36).slice(2)}`,
        type: r.type || "study_focus",
        priority: r.priority || "medium",
        title: r.title || r.message || "Recommended topic",
        description: r.description || "",
        category: r.category || "General",
        estimated_time: r.estimated_time || "15–30 min",
        resources: r.resources || [],
        confidence: r.confidence || 0.75,
        created_at: r.created_at || new Date().toISOString(),
      }));
    } catch (error) {
      throw handleApiError(error, "fetching recommendations");
    }
  },

  /*───────────────────────────────────────────────────────────
   ⚖️ 5) Performance Comparison
   GET /analytics/students/:id/comparison
  ───────────────────────────────────────────────────────────*/
  getPerformanceComparison: async (studentId, params = {}) => {
    try {
      if (!studentId)
        throw new ApiError("Student ID is required", "VALIDATION_ERROR");

      const res = await api.get(`/analytics/students/${studentId}/comparison`, {
        params: {
          comparison_type: params.comparison_type || "self",
          period: params.period || "monthly",
          include_metrics: true,
        },
        timeout: 30000,
      });

      return {
        student_id: studentId,
        comparison_type: params.comparison_type || "self",
        period: params.period || "monthly",
        student_performance: res.data.student_performance || {},
        comparison_data: res.data.comparison_data || {},
        insights: res.data.insights || [],
        recommendations: res.data.recommendations || [],
      };
    } catch (error) {
      throw handleApiError(error, `fetching comparison`);
    }
  },

  /*───────────────────────────────────────────────────────────
   🛠 6) Update progress (Node backend)
   POST /analytics/students/:id/progress
  ───────────────────────────────────────────────────────────*/
  updateStudentProgress: async (studentId, progressData) => {
    try {
      if (!studentId)
        throw new ApiError("Student ID is required", "VALIDATION_ERROR");

      const res = await api.post(
        `/analytics/students/${studentId}/progress`,
        progressData,
        { timeout: 20000 }
      );

      return res.data;
    } catch (error) {
      throw handleApiError(error, "updating progress");
    }
  },
};

/*───────────────────────────────────────────────────────────
 🧩 HELPERS (SAFE)
───────────────────────────────────────────────────────────*/
const normalizeProgressData = (data, studentId, params) => {
  const progressList = Array.isArray(data.progress)
    ? data.progress
    : data.progress_data || [];

  const result = {
    student_id: studentId,
    progress: progressList.map((day) => ({
      date: day.date,
      average_score: Number(day.average_score || 0),
      total_assignments: Number(day.total_assignments || 0),
      quizzes_taken: Number(day.quizzes_taken || day.total_assignments || 0),
      total_questions: Number(day.total_questions || 0),
      correct_answers: Number(day.correct_answers || 0),
      performance_level: day.performance_level || "unknown",
    })),
    generated_at: data.generated_at || new Date().toISOString(),
  };

  return result;
};

const calculateTrend = (value) =>
  typeof value === "string"
    ? value
    : value > 0
    ? "improving"
    : value < 0
    ? "declining"
    : "stable";

export default progressApi;
