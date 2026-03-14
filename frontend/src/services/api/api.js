// src/services/api/api.js
// One API module for the whole app
// Uses ONE axios source of truth: ./http

import { apiClient, aiClient, pdfClient, normalizeApiError } from "./http";
import axios from "axios";

/**
 * Admin base paths
 */
const ADMIN_BASE = "/api/admin";
const ADMIN_SYSTEM_BASE = "/api/admin/system";

/**
 * Remove empty params so you don’t send q="", role="", status=""
 */
function cleanParams(params) {
  if (!params || typeof params !== "object") return undefined;

  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;

    if (typeof v === "string") {
      const s = v.trim();
      if (!s) continue;
      out[k] = s;
      continue;
    }

    out[k] = v;
  }

  return Object.keys(out).length ? out : undefined;
}

/**
 * Fix legacy admin path usage
 * /api/admin/super/... -> /api/admin/system/super/...
 */
function fixLegacyPath(path) {
  const p = String(path || "");
  return p.replace(/^\/api\/admin\/super\b/, `${ADMIN_SYSTEM_BASE}/super`);
}

/**
 * Normalize role casing for backend enums
 */
function upper(v) {
  return v === undefined || v === null ? v : String(v).toUpperCase();
}
function unwrapItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}
/**
 * Helper: unwrap axios response + normalize backend errors
 */
async function safe(promise) {
  try {
    const res = await promise;
    return res.data;
  } catch (err) {
    throw new Error(normalizeApiError(err));
  }
}

/**
 * Helper: download a blob
 */
async function safeBlob(promise) {
  try {
    const res = await promise;
    return res.data;
  } catch (err) {
    throw new Error(normalizeApiError(err));
  }
}

/**
 * Optional legacy helpers for pages that still do "apiGet('/api/...')"
 * These also auto-fix legacy /api/admin/super paths
 */
export const apiGet = (path, config = {}) =>
  safe(apiClient.get(fixLegacyPath(path), config));

export const apiPost = (path, body, config = {}) =>
  safe(apiClient.post(fixLegacyPath(path), body, config));

export const apiPut = (path, body, config = {}) =>
  safe(apiClient.put(fixLegacyPath(path), body, config));

export const apiPatch = (path, body, config = {}) =>
  safe(apiClient.patch(fixLegacyPath(path), body, config));

export const apiDelete = (path, config = {}) =>
  safe(apiClient.delete(fixLegacyPath(path), config));

export const api = {
  // =======================================================
  // USERS
  // =======================================================
  users: {
    signup: (payload) => safe(apiClient.post("/api/users/signup", payload)),
    login: (payload) => safe(apiClient.post("/api/users/login", payload)),
    logout: () => safe(apiClient.post("/api/users/logout")),
    checkAuth: () => safe(apiClient.get("/api/users/checkAuth")),

    getMyProfile: () => safe(apiClient.get("/api/users/profile")),

    updateProfile: (userId, updates) => {
      const isFormData =
        typeof FormData !== "undefined" && updates instanceof FormData;

      return safe(
        apiClient.put(`/api/users/profile/${userId}`, updates, {
          headers: isFormData
            ? { "Content-Type": "multipart/form-data" }
            : undefined,
        }),
      );
    },

    // Legacy admin endpoints you already use in pages
    getAllUsersAdmin: (params) =>
      safe(apiClient.get("/api/users/users", { params: cleanParams(params) })),
    getUserById: (userId) =>
      safe(apiClient.get(`/api/users/users/id/${userId}`)),
    getUserByCode: (code) =>
      safe(apiClient.get(`/api/users/users/code/${code}`)),
    adminUpdateUser: (id, payload) =>
      safe(apiClient.put(`/api/users/admin/update-user/${id}`, payload)),
    superAdminUpdateRole: (id, payload) =>
      safe(apiClient.put(`/api/users/admin/update-role/${id}`, payload)),

    listAllUsersSuper: () => safe(apiClient.get("/api/users/all")),
    deleteUserSuper: (id) => safe(apiClient.delete(`/api/users/delete/${id}`)),
    restoreUser: (id) => safe(apiClient.put(`/api/users/restore/${id}`)),
    toggleBlock: (id) => safe(apiClient.put(`/api/users/toggle-block/${id}`)),
    dashboardPing: () => safe(apiClient.get("/api/users/dashboard")),
  },

  // =======================================================
  // COURSES (aligned with backend courseRoutes.js)
  // =======================================================
  courses: {
    getAllCourses: (params) =>
      safe(apiClient.get("/api/courses", { params: cleanParams(params) })),

    createCourse: (payload) => safe(apiClient.post("/api/courses", payload)),

    getCourseById: (courseId) =>
      safe(apiClient.get(`/api/courses/${courseId}`)),

    searchCourses: (params) =>
      safe(
        apiClient.get("/api/courses/search", { params: cleanParams(params) }),
      ),

    getCourseActivity: (courseId) =>
      safe(apiClient.get(`/api/courses/${courseId}/activity`)),

    setCourseArchived: (courseId, archived) =>
      safe(apiClient.patch(`/api/courses/${courseId}/archive`, { archived })),

    getCoursesByUser: (userId) =>
      safe(apiClient.get(`/api/courses/user/${userId}`)),

    deleteCourse: (id) => safe(apiClient.delete(`/api/courses/${id}`)),

    addActivityToSection: (courseId, sectionId, payload) =>
      safe(
        apiClient.post(
          `/api/courses/${courseId}/sections/${sectionId}/activities`,
          payload,
        ),
      ),

    assignToCourse: (courseId, assignmentData) =>
      safe(
        apiClient.post(`/api/courses/${courseId}/assignments`, assignmentData),
      ),

    submitAssignment: (courseId, assignmentId, formData) =>
      safe(
        apiClient.post(
          `/api/courses/${courseId}/assignments/${assignmentId}/submit`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } },
        ),
      ),
  },
  getSuperAiUsage: (params) =>
    axios.get("/api/admin/super/ai-usage", { params }).then((r) => r.data),

  getSuperAiUsageSummary: (params) =>
    axios
      .get("/api/admin/super/ai-usage/summary", { params })
      .then((r) => r.data),

  getSuperAiRequests: (params) =>
    axios.get("/api/admin/super/ai-requests", { params }).then((r) => r.data),

  getSuperAiRequestsSummary: (params) =>
    axios
      .get("/api/admin/super/ai-requests/summary", { params })
      .then((r) => r.data),
  // =======================================================
  // DOCUMENTS
  // =======================================================
  documents: {
    getDocumentsInCourse: (courseId) =>
      safe(apiClient.get(`/api/documents/course/${courseId}`)),

    searchDocuments: (params) =>
      safe(
        apiClient.get("/api/documents/search", { params: cleanParams(params) }),
      ),

    uploadDocument: (formData) =>
      safe(
        apiClient.post("/api/documents/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        }),
      ),

    softDeleteDocument: (id) =>
      safe(apiClient.put(`/api/documents/${id}/soft-delete`)),
    restoreDocument: (id) =>
      safe(apiClient.put(`/api/documents/${id}/restore`)),
    updateDocument: (id, payload) =>
      safe(apiClient.put(`/api/documents/${id}`, payload)),
    permanentlyDeleteDocument: (id) =>
      safe(apiClient.delete(`/api/documents/${id}/permanent-delete`)),

    bulkRestore: (payload) =>
      safe(apiClient.put("/api/documents/bulk-restore", payload)),
    bulkDelete: (payload) =>
      safe(apiClient.delete("/api/documents/bulk-delete", { data: payload })),

    downloadDocument: async (id) => {
      try {
        const res = await apiClient.get(`/api/documents/download/${id}`, {
          responseType: "blob",
        });
        return res.data;
      } catch (err) {
        throw new Error(normalizeApiError(err));
      }
    },

    previewDocument: (id) =>
      safe(apiClient.get(`/api/documents/preview/${id}`)),

    exportPdf: async (payload) => {
      try {
        const res = await apiClient.post("/api/documents/export-pdf", payload, {
          responseType: "blob",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/pdf",
          },
        });
        return res.data;
      } catch (err) {
        throw new Error(normalizeApiError(err));
      }
    },
  },

  // =======================================================
  // WORKSPACE COLLABORATORS
  // =======================================================
  collaborators: {
    fetchCollaborators: (workspaceId) =>
      safe(apiClient.get(`/api/workspaces/${workspaceId}/collaborators`)),

    addCollaborator: (workspaceId, userId, role) =>
      safe(
        apiClient.post(`/api/workspaces/${workspaceId}/add-collaborator`, {
          userId,
          role,
        }),
      ),

    removeCollaborator: (workspaceId, collaboratorId) =>
      safe(
        apiClient.delete(
          `/api/workspaces/${workspaceId}/remove-collaborator/${collaboratorId}`,
        ),
      ),

    updateCollaboratorRole: (workspaceId, collaboratorId, role) =>
      safe(
        apiClient.put(
          `/api/workspaces/${workspaceId}/change-role/${collaboratorId}`,
          { role },
        ),
      ),
  },

  // =======================================================
  // AI (Node + AI microservice)
  // =======================================================
  ai: {
    // Node: AI usage logging
    logUsage: (payload) => safe(apiClient.post("/api/ai-usage", payload)),
    listUsage: (params) =>
      safe(apiClient.get("/api/ai-usage", { params: cleanParams(params) })),
    getUsageSummary: (params) =>
      safe(
        apiClient.get("/api/ai-usage/summary", { params: cleanParams(params) }),
      ),
    getUsageById: (id) => safe(apiClient.get(`/api/ai-usage/${id}`)),
    deleteUsageById: (id) => safe(apiClient.delete(`/api/ai-usage/${id}`)),
    bulkDeleteUsage: (payload) =>
      safe(apiClient.delete("/api/ai-usage", { data: payload })),

    // Node: Admin AI settings (correct path)
    getAiSettings: (config = {}) =>
      safe(apiClient.get(`${ADMIN_BASE}/ai/settings`, config)),
    updateAiSettings: (payload, config = {}) =>
      safe(apiClient.put(`${ADMIN_BASE}/ai/settings`, payload, config)),

    // AI microservice
    generateQuiz: (payload) =>
      safe(aiClient.post("/api/quiz/generate", payload)),
    generateAssignment: (payload) =>
      safe(aiClient.post("/api/assignments/generate", payload)),
    validateAssignment: (payload) =>
      safe(aiClient.post("/api/assignments/validate", payload)),
    uploadAssignmentFile: (formData) =>
      safe(
        aiClient.post("/api/assignments/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        }),
      ),
    gradeAssignment: (payload) =>
      safe(aiClient.post("/api/assignments/grade", payload)),
    getAssignmentById: (assignmentId) =>
      safe(aiClient.get(`/api/assignments/${assignmentId}`)),
    listAssignments: () => safe(aiClient.get("/api/assignments")),

    // PDF export via pdfClient
    exportPdf: async (payload) => {
      try {
        const res = await pdfClient.post("/api/documents/export-pdf", payload, {
          responseType: "blob",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/pdf",
          },
        });
        return res.data;
      } catch (err) {
        throw new Error(normalizeApiError(err));
      }
    },

    // Optional endpoints
    getRecoverySuggestions: (deletedItems) =>
      safe(
        apiClient.post("/api/ai/recovery-suggestions", { items: deletedItems }),
      ),
    analyzeRecoveryPatterns: (recoveryHistory) =>
      safe(
        apiClient.post("/api/ai/analyze-patterns", {
          history: recoveryHistory,
        }),
      ),
    classifyDocument: (formData) =>
      safe(
        apiClient.post("/api/ai/classify-document", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        }),
      ),
    generateSmartTags: (documentData) =>
      safe(apiClient.post("/api/ai/generate-tags", documentData)),
    suggestCollaboratorRole: (collaboratorInfo) =>
      safe(apiClient.post("/api/ai/suggest-role", collaboratorInfo)),
    analyzeSentiment: (messages) =>
      safe(apiClient.post("/api/ai/sentiment", { messages })),
    detectAnomalies: (activityData) =>
      safe(apiClient.post("/api/ai/detect-anomalies", activityData)),
  },

  // =======================================================
  // ADMIN (merged from dashboard/api/adminApi.js)
  // =======================================================
  admin: {
    // Dashboard
    getDashboardMetrics: (config = {}) =>
      safe(apiClient.get(`${ADMIN_BASE}/dashboard/metrics`, config)),

    // Users
    listUsers: (params, config = {}) =>
      safe(
        apiClient.get(`${ADMIN_BASE}/users`, {
          ...config,
          params: cleanParams(params),
        }),
      ),

    inviteUser: (payload, config = {}) => {
      const body = { ...(payload || {}) };
      if (body.role) body.role = upper(body.role);
      return safe(apiClient.post(`${ADMIN_BASE}/users/invite`, body, config));
    },

    setUserStatus: (userId, enabled, config = {}) =>
      safe(
        apiClient.patch(
          `${ADMIN_BASE}/users/${userId}/status`,
          { enabled },
          config,
        ),
      ),

    setUserRole: (userId, role, config = {}) =>
      safe(
        apiClient.patch(
          `${ADMIN_BASE}/users/${userId}/role`,
          { role: upper(role) },
          config,
        ),
      ),

    resetUserPassword: (userId, config = {}) =>
      safe(
        apiClient.post(
          `${ADMIN_BASE}/users/${userId}/reset-password`,
          null,
          config,
        ),
      ),

    // Classes
    listClasses: (params, config = {}) =>
      safe(
        apiClient.get(`${ADMIN_BASE}/classes`, {
          ...config,
          params: cleanParams(params),
        }),
      ),

    createClass: (payload, config = {}) =>
      safe(apiClient.post(`${ADMIN_BASE}/classes`, payload, config)),

    assignTeacher: (classId, teacherId, config = {}) =>
      safe(
        apiClient.post(
          `${ADMIN_BASE}/classes/${classId}/assign-teacher`,
          { teacherId },
          config,
        ),
      ),

    enrollStudents: (classId, studentIds, config = {}) =>
      safe(
        apiClient.post(
          `${ADMIN_BASE}/classes/${classId}/enroll`,
          { studentIds },
          config,
        ),
      ),

    // Branding
    getBranding: (config = {}) =>
      safe(apiClient.get(`${ADMIN_BASE}/branding`, config)),

    updateBranding: (payload, config = {}) =>
      safe(apiClient.put(`${ADMIN_BASE}/branding`, payload, config)),

    uploadLogo: (file, config = {}) => {
      const form = new FormData();
      form.append("logo", file);

      return safe(
        apiClient.post(`${ADMIN_BASE}/branding/logo`, form, {
          ...config,
          headers: {
            ...(config.headers || {}),
            "Content-Type": "multipart/form-data",
          },
        }),
      );
    },

    // AI settings (duplicate access, kept for ergonomics)
    getAiSettings: (config = {}) =>
      safe(apiClient.get(`${ADMIN_BASE}/ai/settings`, config)),
    updateAiSettings: (payload, config = {}) =>
      safe(apiClient.put(`${ADMIN_BASE}/ai/settings`, payload, config)),

    // Analytics
    getAnalyticsSummary: (params, config = {}) =>
      safe(
        apiClient.get(`${ADMIN_BASE}/analytics/summary`, {
          ...config,
          params: cleanParams(params),
        }),
      ),

    exportAnalytics: (type, params, config = {}) =>
      safeBlob(
        apiClient.get(`${ADMIN_BASE}/analytics/export/${type}`, {
          ...config,
          params: cleanParams(params),
          responseType: "blob",
        }),
      ),

    // System routes
    merchantOverview: (config = {}) =>
      safe(apiClient.get(`${ADMIN_SYSTEM_BASE}/overview`, config)),

    merchantRecentLogs: (config = {}) =>
      safe(apiClient.get(`${ADMIN_SYSTEM_BASE}/logs/recent`, config)),

    superOverview: (config = {}) =>
      safe(apiClient.get(`${ADMIN_SYSTEM_BASE}/super/overview`, config)),

    listTenants: async (params, config = {}) => {
      const data = await safe(
        apiClient.get(`${ADMIN_SYSTEM_BASE}/super/tenants`, {
          ...config,
          params: cleanParams(params),
        }),
      );

      // always return a consistent shape for UI
      return {
        success: !!data?.success,
        items: unwrapItems(data),
        count:
          typeof data?.count === "number"
            ? data.count
            : unwrapItems(data).length,
      };
    },

    getTenant: (tenantId, config = {}) =>
      safe(
        apiClient.get(
          `${ADMIN_SYSTEM_BASE}/super/tenants/${encodeURIComponent(tenantId)}`,
          config,
        ),
      ),

    createTenant: (payload, config = {}) =>
      safe(
        apiClient.post(`${ADMIN_SYSTEM_BASE}/super/tenants`, payload, config),
      ),

    updateTenant: (tenantId, patch, config = {}) =>
      safe(
        apiClient.patch(
          `${ADMIN_SYSTEM_BASE}/super/tenants/${encodeURIComponent(tenantId)}`,
          patch,
          config,
        ),
      ),

    deleteTenant: (tenantId, config = {}) =>
      safe(
        apiClient.delete(
          `${ADMIN_SYSTEM_BASE}/super/tenants/${encodeURIComponent(tenantId)}`,
          config,
        ),
      ),

    getAICost: (params, config = {}) =>
      safe(
        apiClient.get(`${ADMIN_SYSTEM_BASE}/super/ai-cost`, {
          ...config,
          params: cleanParams(params),
        }),
      ),

    listFeatureFlags: (params, config = {}) =>
      safe(
        apiClient.get(`${ADMIN_SYSTEM_BASE}/super/feature-flags`, {
          ...config,
          params: cleanParams(params),
        }),
      ),

    listAuditLogs: (params, config = {}) =>
      safe(
        apiClient.get(`${ADMIN_SYSTEM_BASE}/super/logs`, {
          ...config,
          params: cleanParams(params),
        }),
      ),

    listAiRequests: (params, config = {}) =>
      safe(
        apiClient.get(`${ADMIN_SYSTEM_BASE}/super/ai-requests`, {
          ...config,
          params: cleanParams(params),
        }),
      ),

    getAiRequestsSummary: (params, config = {}) =>
      safe(
        apiClient.get(`${ADMIN_SYSTEM_BASE}/super/ai-requests/summary`, {
          ...config,
          params: cleanParams(params),
        }),
      ),

    listTenantUsers: (params, config = {}) =>
      safe(
        apiClient.get(`${ADMIN_SYSTEM_BASE}/users`, {
          ...config,
          params: cleanParams(params),
        }),
      ),

    createAdmin: (payload, config = {}) =>
      safe(apiClient.post(`${ADMIN_SYSTEM_BASE}/createAdmin`, payload, config)),

    promoteToAdmin: (userId, config = {}) =>
      safe(
        apiClient.put(`${ADMIN_SYSTEM_BASE}/promote/${userId}`, null, config),
      ),
  },
};

export default api;
