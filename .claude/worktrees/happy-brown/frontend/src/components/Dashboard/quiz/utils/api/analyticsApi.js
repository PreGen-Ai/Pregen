import api from "./apiConfig";
import { handleApiError, ApiError } from "../errorHandler";

/**
 * 📊 ANALYTICS API MODULE — FINAL (Model-A Safe)
 * ---------------------------------------------------------
 * All analytics routes automatically route → Node backend.
 * DO NOT manually use NODE_API_BASE.
 * ---------------------------------------------------------
 */

export const analyticsApi = {
  /*───────────────────────────────────────────────────────────
   👑 1) ADMIN — Platform-wide user stats
  ───────────────────────────────────────────────────────────*/
  getUserAnalytics: async () => {
    try {
      const response = await api.get(`/analytics/users`, { timeout: 15000 });
      const d = response.data || {};

      return {
        total_users: d.totalUsers || d.total_users || 0,
        total_students: d.totalStudents || d.total_students || 0,
        total_teachers: d.totalTeachers || d.total_teachers || 0,
        total_admins: d.totalAdmins || d.total_admins || 0,
      };
    } catch (error) {
      throw handleApiError(error, "fetching user analytics");
    }
  },

  /*───────────────────────────────────────────────────────────
   🧑‍🏫 2) ADMIN/TEACHER — Workspace Performance Summary
  ───────────────────────────────────────────────────────────*/
  getWorkspaceAnalytics: async () => {
    try {
      const response = await api.get(`/analytics/workspaces`, {
        timeout: 20000,
      });

      const arr = Array.isArray(response.data) ? response.data : [];

      return arr.map((w) => ({
        name: w._id || w.name || "Unnamed Workspace",
        avg_progress: w.avgProgress || w.avg_progress || 0,
        total_students: w.totalStudents || w.total_students || 0,
      }));
    } catch (error) {
      throw handleApiError(error, "fetching workspace analytics");
    }
  },

  /*───────────────────────────────────────────────────────────
   📊 3) Quiz Score Distribution Analytics
   ───────────────────────────────────────────────────────────*/
  getQuizPerformance: async () => {
    try {
      const res = await api.get(`/analytics/quiz-performance`, {
        timeout: 20000,
      });

      const arr = Array.isArray(res.data) ? res.data : [];
      return arr.map((q) => ({
        range: q._id || q.range || "Unknown",
        count: q.count || 0,
      }));
    } catch (error) {
      throw handleApiError(error, "fetching quiz performance analytics");
    }
  },

  /*───────────────────────────────────────────────────────────
   🎓 4) Student — High-level performance summary
  ───────────────────────────────────────────────────────────*/
  getStudentPerformance: async (studentId) => {
    try {
      if (!studentId) throw new ApiError("Student ID is required");

      const res = await api.get(
        `/analytics/students/${studentId}/performance`,
        { timeout: 15000 }
      );

      const d = res.data || {};
      return {
        average_score: d.averageScore || d.avg_score || 0,
        total_quizzes: d.totalQuizzes || 0,
        total_submissions: d.totalSubmissions || 0,
        improvement: d.improvement || 0,
      };
    } catch (error) {
      throw handleApiError(
        error,
        `fetching performance for student ${studentId}`
      );
    }
  },

  /*───────────────────────────────────────────────────────────
   🧩 5) Student — Weak Areas
   ───────────────────────────────────────────────────────────*/
  getWeakAreas: async (studentId) => {
    try {
      const res = await api.get(`/analytics/students/${studentId}/weak-areas`, {
        timeout: 12000,
      });

      const arr = res.data?.weak_areas || [];
      return arr.map((w) => ({
        subject: w.category || w.subject || "Unknown",
        score: w.score || 0,
        recommendation: w.recommendation || "Review this topic",
      }));
    } catch (error) {
      throw handleApiError(error, `fetching weak areas for ${studentId}`);
    }
  },

  /*───────────────────────────────────────────────────────────
   📈 6) Student — Timeline Progress (weekly/monthly)
   ───────────────────────────────────────────────────────────*/
  getTimeline: async (studentId) => {
    try {
      const res = await api.get(`/analytics/students/${studentId}/timeline`, {
        timeout: 15000,
      });

      const arr = res.data?.timeline || [];

      return arr.map((t) => ({
        date: t.period || t.date || t.week || t.month || "N/A",
        average_score: t.average_score || t.score || 0,
        trend: t.trend || "neutral",
      }));
    } catch (error) {
      throw handleApiError(error, `fetching timeline for ${studentId}`);
    }
  },

  /*───────────────────────────────────────────────────────────
   💡 7) Student — AI Learning Recommendations
   ───────────────────────────────────────────────────────────*/
  getRecommendations: async (studentId) => {
    try {
      const res = await api.get(
        `/analytics/students/${studentId}/recommendations`,
        { timeout: 10000 }
      );

      const arr = res.data?.recommendations || [];
      return arr.map((r) => ({
        title: r.title || "General Advice",
        description: r.description || "",
        resources: r.resources || [],
      }));
    } catch (error) {
      throw handleApiError(error, `fetching recommendations for ${studentId}`);
    }
  },

  /*───────────────────────────────────────────────────────────
   🕒 8) Study Sessions (rolling 7 days)
   ───────────────────────────────────────────────────────────*/
  getSessions: async (studentId) => {
    try {
      const res = await api.get(`/analytics/students/${studentId}/sessions`, {
        timeout: 10000,
      });

      const arr = res.data?.sessions || [];
      return arr.map((s) => ({
        date: s.date || "N/A",
        duration: s.duration || 0,
        topics: s.topics || [],
        average_score: s.average_score || 0,
        efficiency: s.efficiency || 0,
      }));
    } catch (error) {
      throw handleApiError(error, `fetching sessions for ${studentId}`);
    }
  },

  /*───────────────────────────────────────────────────────────
   🧠 9) Full Analytics Bundle (parallel)
   ───────────────────────────────────────────────────────────*/
  getFullStudentAnalytics: async (studentId) => {
    try {
      const [performance, weakAreas, timeline, recommendations, sessions] =
        await Promise.all([
          analyticsApi.getStudentPerformance(studentId),
          analyticsApi.getWeakAreas(studentId),
          analyticsApi.getTimeline(studentId),
          analyticsApi.getRecommendations(studentId),
          analyticsApi.getSessions(studentId),
        ]);

      return { performance, weakAreas, timeline, recommendations, sessions };
    } catch (error) {
      throw handleApiError(error, "fetching full student analytics bundle");
    }
  },

  /*───────────────────────────────────────────────────────────
   🧾 10) Dashboard Progress Chart (Node backend)
   ───────────────────────────────────────────────────────────*/
  getProgress: async (studentId, days = 30) => {
    try {
      const res = await api.post(`/reports/progress`, {
        student_id: studentId,
        days,
      });

      return res.data?.progress_data || [];
    } catch (error) {
      throw handleApiError(
        error,
        `fetching dashboard progress for ${studentId}`
      );
    }
  },

  /*───────────────────────────────────────────────────────────
   📤 11) Export Analytics (JSON or CSV)
   ───────────────────────────────────────────────────────────*/
  exportAnalyticsData: async (studentId, params = {}) => {
    try {
      if (!studentId) throw new ApiError("Student ID is required");

      const config = {
        params: {
          format: params.format || "json",
          timeframe: params.timeframe || "all_time",
        },
        responseType: "blob",
        timeout: 60000,
        headers: {
          Accept: params.format === "csv" ? "text/csv" : "application/json",
        },
      };

      const res = await api.get(
        `/analytics/students/${studentId}/export`,
        config
      );

      const blob = new Blob([res.data], {
        type:
          params.format === "csv"
            ? "text/csv;charset=utf-8;"
            : "application/json",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.setAttribute(
        "download",
        `student_${studentId}_analytics.${params.format || "json"}`
      );

      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      return true;
    } catch (error) {
      throw handleApiError(error, `exporting analytics for ${studentId}`);
    }
  },

  /*───────────────────────────────────────────────────────────
   🔥 12) REQUIRED BY useQuizAnalytics.js — ADDED
   Student Analytics Root Object
   ───────────────────────────────────────────────────────────*/
  getStudentAnalytics: async (studentId) => {
    try {
      const res = await api.get(`/analytics/students/${studentId}`, {
        timeout: 15000,
      });
      return res.data || {};
    } catch (error) {
      throw handleApiError(error, "fetching student analytics root");
    }
  },

  getTopicAnalytics: async (studentId, topic) => {
    try {
      const res = await api.get(
        `/analytics/students/${studentId}/topics/${encodeURIComponent(topic)}`,
        { timeout: 12000 }
      );
      return res.data || {};
    } catch (error) {
      throw handleApiError(error, "fetching topic analytics");
    }
  },

  getDashboard: async (studentId) => {
    try {
      const res = await api.get(`/analytics/students/${studentId}/dashboard`, {
        timeout: 15000,
      });
      return res.data || {};
    } catch (error) {
      throw handleApiError(error, "fetching student dashboard analytics");
    }
  },
};

/*───────────────────────────────────────────────────────────
 🧮 Helper — Proficiency Levels
───────────────────────────────────────────────────────────*/
export const calculateProficiencyLevel = (score) => {
  if (score >= 90) return "expert";
  if (score >= 80) return "advanced";
  if (score >= 70) return "intermediate";
  if (score >= 60) return "beginner";
  return "novice";
};

export default analyticsApi;
