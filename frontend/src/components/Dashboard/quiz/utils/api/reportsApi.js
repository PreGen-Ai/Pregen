// utils/api/reportsApi.js

import api from "./apiConfig";
import { handleApiError, ApiError } from "../errorHandler";

export const reportsApi = {
  /**
   * ---------------------------------------------------
   * 📄 Download PDF for a stored report
   * GET /api/download-report/{report_id}
   * Backend returns: PDF via GridFS
   * ---------------------------------------------------
   */
  downloadPDF: async (reportId) => {
    try {
      if (!reportId)
        throw new ApiError("Missing report ID", "VALIDATION_ERROR");

      const res = await api.get(`/api/download-report/${reportId}`, {
        responseType: "blob",
        timeout: 60000,
      });

      return res.data;
    } catch (error) {
      throw handleApiError(error, "downloading PDF report");
    }
  },

  /**
   * ---------------------------------------------------
   * 📊 Fetch JSON report metadata
   * GET /api/report/{report_id}
   * ---------------------------------------------------
   */
  downloadJSON: async (reportId) => {
    try {
      if (!reportId)
        throw new ApiError("Missing report ID", "VALIDATION_ERROR");

      const res = await api.get(`/api/report/${reportId}`, {
        timeout: 30000,
      });

      return res.data;
    } catch (error) {
      throw handleApiError(error, "downloading JSON report");
    }
  },

  /**
   * ---------------------------------------------------
   * 📦 ZIP download (PDF + JSON) if backend provides it
   * GET /api/reports/download/{report_id}
   * ---------------------------------------------------
   */
  downloadZIP: async (reportId) => {
    try {
      if (!reportId)
        throw new ApiError("Missing report ID", "VALIDATION_ERROR");

      const res = await api.get(`/api/reports/download/${reportId}`, {
        responseType: "blob",
        timeout: 60000,
      });

      return res.data;
    } catch (error) {
      throw handleApiError(error, "downloading ZIP bundle");
    }
  },

  /**
   * ---------------------------------------------------
   * 🟢 Report status check
   * GET /api/reports/status/{report_id}
   * ---------------------------------------------------
   */
  checkStatus: async (reportId) => {
    try {
      if (!reportId)
        throw new ApiError("Missing report ID", "VALIDATION_ERROR");

      const res = await api.get(`/api/reports/status/${reportId}`);
      return res.data;
    } catch (error) {
      throw handleApiError(error, "checking report status");
    }
  },

  /**
   * ---------------------------------------------------
   * 👩‍🎓 Student report list
   * POST /api/reports/student
   * Body: { student_id, limit }
   * ---------------------------------------------------
   */
  getStudentReports: async (studentId, params = {}) => {
    try {
      if (!studentId)
        throw new ApiError("Student ID is required", "VALIDATION_ERROR");

      const payload = {
        student_id: studentId,
        limit: params.limit || 10,
      };

      const res = await api.post(`/api/reports/student`, payload);
      return res.data;
    } catch (error) {
      throw handleApiError(error, `fetching reports for ${studentId}`);
    }
  },

  /**
   * ---------------------------------------------------
   * 📈 Student progress analytics
   * POST /api/reports/progress
   * Body: { student_id, days }
   * ---------------------------------------------------
   */
  getStudentProgress: async (studentId, days = 30) => {
    try {
      if (!studentId)
        throw new ApiError("Student ID is required", "VALIDATION_ERROR");

      const payload = { student_id: studentId, days };

      const res = await api.post(`/api/reports/progress`, payload);
      return res.data;
    } catch (error) {
      throw handleApiError(error, `fetching progress for ${studentId}`);
    }
  },

  /**
   * ---------------------------------------------------
   * 🧭 Dashboard summary
   * GET /api/reports/dashboard/{user_identifier}
   * ---------------------------------------------------
   */
  getDashboard: async (userIdentifier) => {
    try {
      if (!userIdentifier)
        throw new ApiError("User identifier is required", "VALIDATION_ERROR");

      const res = await api.get(`/api/reports/dashboard/${userIdentifier}`);
      return res.data;
    } catch (error) {
      throw handleApiError(error, `fetching dashboard for ${userIdentifier}`);
    }
  },
};

export default reportsApi;
