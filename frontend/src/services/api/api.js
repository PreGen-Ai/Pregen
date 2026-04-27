// src/services/api/api.js
// One API module for the whole app
// Uses ONE axios source of truth: ./http

import { apiClient, pdfClient, normalizeApiError } from "./http";

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

function isFormDataValue(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}

function normalizeReportId(value, prefixes = []) {
  let normalized = String(value || "").trim();

  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  return normalized.replace(/^\/+/, "");
}
/**
 * Helper: unwrap axios response + normalize backend errors
 */
async function safe(promise) {
  try {
    const res = await promise;
    return res.data;
  } catch (err) {
    if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") {
      throw err;
    }
    const apiErr = new Error(normalizeApiError(err));
    // Preserve the HTTP status code as a property so catch blocks can branch on it
    const httpStatus = err?.response?.status;
    if (httpStatus) apiErr.status = httpStatus;
    throw apiErr;
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
    if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") {
      throw err;
    }
    const apiErr = new Error(normalizeApiError(err));
    const httpStatus = err?.response?.status;
    if (httpStatus) apiErr.status = httpStatus;
    throw apiErr;
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
    getAllCourses: (params = {}, config = {}) =>
      safe(
        apiClient.get("/api/courses", {
          ...config,
          params: cleanParams(params),
        }),
      ),

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

  lessons: {
    listCourseLessons: (courseId, config = {}) =>
      safe(apiClient.get(`/api/lessons/courses/${courseId}`, config)),
    createModule: (courseId, payload, config = {}) =>
      safe(apiClient.post(`/api/lessons/courses/${courseId}/modules`, payload, config)),
    updateModule: (moduleId, payload, config = {}) =>
      safe(apiClient.patch(`/api/lessons/modules/${moduleId}`, payload, config)),
    deleteModule: (moduleId, config = {}) =>
      safe(apiClient.delete(`/api/lessons/modules/${moduleId}`, config)),
    createContent: (moduleId, formData, config = {}) =>
      safe(
        apiClient.post(`/api/lessons/modules/${moduleId}/content`, formData, {
          ...config,
          headers: {
            ...(config.headers || {}),
            "Content-Type": "multipart/form-data",
          },
        }),
      ),
    updateContent: (contentId, payload, config = {}) =>
      safe(apiClient.patch(`/api/lessons/content/${contentId}`, payload, config)),
    deleteContent: (contentId, config = {}) =>
      safe(apiClient.delete(`/api/lessons/content/${contentId}`, config)),
  },

  announcements: {
    list: (params, config = {}) =>
      safe(
        apiClient.get("/api/announcements", {
          ...config,
          params: cleanParams(params),
        }),
      ),
    create: (payload, config = {}) =>
      safe(apiClient.post("/api/announcements", payload, config)),
    update: (id, payload, config = {}) =>
      safe(apiClient.patch(`/api/announcements/${id}`, payload, config)),
    delete: (id, config = {}) =>
      safe(apiClient.delete(`/api/announcements/${id}`, config)),
  },

  gradebook: {
    list: (params, config = {}) =>
      safe(
        apiClient.get("/api/gradebook", {
          ...config,
          params: cleanParams(params),
        }),
      ),
    getSubmission: (submissionId, config = {}) =>
      safe(apiClient.get(`/api/gradebook/submissions/${submissionId}`, config)),
    getQuizAttempt: (attemptId, config = {}) =>
      safe(apiClient.get(`/api/gradebook/quiz-attempts/${attemptId}`, config)),
    reviewSubmission: (submissionId, payload, config = {}) =>
      safe(
        apiClient.patch(
          `/api/gradebook/submissions/${submissionId}/review`,
          payload,
          config,
        ),
      ),
    approveSubmission: (submissionId, payload, config = {}) =>
      safe(
        apiClient.patch(
          `/api/gradebook/submissions/${submissionId}/approve`,
          payload,
          config,
        ),
      ),
    reviewQuizAttempt: (attemptId, payload, config = {}) =>
      safe(
        apiClient.patch(
          `/api/gradebook/quiz-attempts/${attemptId}/review`,
          payload,
          config,
        ),
      ),
    approveQuizAttempt: (attemptId, payload, config = {}) =>
      safe(
        apiClient.patch(
          `/api/gradebook/quiz-attempts/${attemptId}/approve`,
          payload,
          config,
        ),
      ),
    updateSubmission: (submissionId, payload, config = {}) =>
      safe(
        apiClient.patch(
          `/api/gradebook/submissions/${submissionId}`,
          payload,
          config,
        ),
      ),
    updateQuizAttempt: (attemptId, payload, config = {}) =>
      safe(
        apiClient.patch(
          `/api/gradebook/quiz-attempts/${attemptId}`,
          payload,
          config,
        ),
      ),
    getMySubmission: (submissionId, config = {}) =>
      safe(apiClient.get(`/api/gradebook/my/submissions/${submissionId}`, config)),
    getMyQuizAttempt: (attemptId, config = {}) =>
      safe(apiClient.get(`/api/gradebook/my/quiz-attempts/${attemptId}`, config)),
  },

  teachers: {
    /**
     * GET /api/teachers/courses
     * Returns all courses the teacher (or admin) can access.
     * Used by the gradebook course-filter dropdown.
     */
    getCourses: (config = {}) =>
      safe(apiClient.get("/api/teachers/courses", config)),

    getDashboard: (params, config = {}) =>
      safe(
        apiClient.get("/api/teachers/dashboard", {
          ...config,
          params: cleanParams(params),
        }),
      ),
    getContent: (params, config = {}) =>
      safe(
        apiClient.get("/api/teachers/content", {
          ...config,
          params: cleanParams(params),
        }),
      ),
    getCourseRoster: (courseId, config = {}) =>
      safe(apiClient.get(`/api/teachers/courses/${courseId}/roster`, config)),
    listAssignments: (params, config = {}) =>
      safe(
        apiClient.get("/api/teachers/assignments", {
          ...config,
          params: cleanParams(params),
        }),
      ),
    createAssignment: (payload, config = {}) =>
      safe(apiClient.post("/api/teachers/assignments", payload, config)),
    updateAssignment: (assignmentId, payload, config = {}) =>
      safe(
        apiClient.patch(
          `/api/teachers/assignments/${assignmentId}`,
          payload,
          config,
        ),
      ),
    getAssignmentSubmissions: (assignmentId, params, config = {}) =>
      safe(
        apiClient.get(`/api/teachers/assignments/${assignmentId}/submissions`, {
          ...config,
          params: cleanParams(params),
        }),
      ),
    getAssignmentSubmission: (submissionId, config = {}) =>
      safe(
        apiClient.get(
          `/api/teachers/assignments/submissions/${submissionId}`,
          config,
        ),
      ),
    updateAssignmentSubmission: (submissionId, payload, config = {}) =>
      safe(
        apiClient.patch(
          `/api/teachers/assignments/submissions/${submissionId}`,
          payload,
          config,
        ),
      ),
    approveAssignmentSubmission: (submissionId, payload, config = {}) =>
      safe(
        apiClient.post(
          `/api/teachers/assignments/submissions/${submissionId}/approve`,
          payload,
          config,
        ),
      ),
    listQuizzes: (params, config = {}) =>
      safe(
        apiClient.get("/api/teachers/quizzes", {
          ...config,
          params: cleanParams(params),
        }),
      ),
    createQuiz: (payload, config = {}) =>
      safe(apiClient.post("/api/teachers/quizzes", payload, config)),
    updateQuiz: (quizId, payload, config = {}) =>
      safe(apiClient.patch(`/api/teachers/quizzes/${quizId}`, payload, config)),
    getQuizResults: (quizId, params, config = {}) =>
      safe(
        apiClient.get(`/api/teachers/quizzes/${quizId}/results`, {
          ...config,
          params: cleanParams(params),
        }),
      ),
    getQuizAttempt: (attemptId, config = {}) =>
      safe(apiClient.get(`/api/teachers/quizzes/attempts/${attemptId}`, config)),
    updateQuizAttempt: (attemptId, payload, config = {}) =>
      safe(
        apiClient.patch(
          `/api/teachers/quizzes/attempts/${attemptId}`,
          payload,
          config,
        ),
      ),
    approveQuizAttempt: (attemptId, payload, config = {}) =>
      safe(
        apiClient.post(
          `/api/teachers/quizzes/attempts/${attemptId}/approve`,
          payload,
          config,
        ),
      ),
  },

  students: {
    listAssignments: (params, config = {}) =>
      safe(
        apiClient.get("/api/students/assignments", {
          ...config,
          params: cleanParams(params),
        }),
      ),
    submitAssignment: (formData, config = {}) =>
      safe(
        apiClient.post("/api/students/assignments/submit", formData, {
          ...config,
          headers: {
            ...(config.headers || {}),
            "Content-Type": "multipart/form-data",
          },
        }),
      ),
    listQuizzes: (params, config = {}) =>
      safe(
        apiClient.get("/api/students/quizzes", {
          ...config,
          params: cleanParams(params),
        }),
      ),
  },

  quizzes: {
    listAssignedForStudent: (config = {}) =>
      safe(apiClient.get("/api/quizzes/student/my", config)),
    getAssignedContent: (assignmentId, config = {}) =>
      safe(apiClient.get(`/api/quizzes/assignments/${assignmentId}/content`, config)),
    startAssignedQuiz: (assignmentId, payload = {}, config = {}) =>
      safe(
        apiClient.post(
          `/api/quizzes/assignments/${assignmentId}/start`,
          payload,
          config,
        ),
      ),
    saveAttemptAnswers: (attemptId, payload, config = {}) =>
      safe(
        apiClient.patch(`/api/quizzes/attempts/${attemptId}/answers`, payload, config),
      ),
    submitAttempt: (attemptId, payload, config = {}) =>
      safe(
        apiClient.post(`/api/quizzes/attempts/${attemptId}/submit`, payload, config),
      ),
  },
  // These were using unauthenticated raw axios and some pointed at non-existent
  // routes (/super/ai-usage). All four now use apiClient (auth included) and
  // point at the canonical /api/admin/system/super/ai-requests paths.
  getSuperAiUsage: (params) =>
    safe(apiClient.get(`${ADMIN_SYSTEM_BASE}/super/ai-requests`, { params: cleanParams(params) })),

  getSuperAiUsageSummary: (params) =>
    safe(apiClient.get(`${ADMIN_SYSTEM_BASE}/super/ai-requests/summary`, { params: cleanParams(params) })),

  getSuperAiRequests: (params) =>
    safe(apiClient.get(`${ADMIN_SYSTEM_BASE}/super/ai-requests`, { params: cleanParams(params) })),

  getSuperAiRequestsSummary: (params) =>
    safe(apiClient.get(`${ADMIN_SYSTEM_BASE}/super/ai-requests/summary`, { params: cleanParams(params) })),
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

    exportPdf: async (payload, config = {}) => {
      try {
        const res = await apiClient.post(
          "/api/documents/export-pdf",
          payload,
          {
            ...config,
            responseType: "blob",
            headers: {
              ...(config.headers || {}),
              "Content-Type": "application/json",
              Accept: "application/pdf",
            },
          },
        );
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
    resetAiSettings: (config = {}) =>
      safe(apiClient.delete(`${ADMIN_BASE}/ai/settings`, config)),

    // Canonical Node -> FastAPI bridge
    // Quiz gen and assignment gen use extended timeouts: the AI quality-gate
    // loop can take 30-60s; the default 25s apiClient timeout kills the request.
    generateQuiz: (payload, config = {}) =>
      safe(apiClient.post("/api/ai/quiz/generate", payload, { timeout: 90000, ...config })),
    gradeQuiz: (payload, config = {}) =>
      safe(apiClient.post("/api/ai/grade-quiz", payload, config)),
    gradeQuestion: (payload, config = {}) =>
      safe(apiClient.post("/api/ai/grade-question", payload, config)),
    getGradingHealth: (config = {}) =>
      safe(apiClient.get("/api/ai/grade/health", config)),

    generateAssignment: (payload, config = {}) =>
      safe(apiClient.post("/api/ai/assignments/generate", payload, { timeout: 90000, ...config })),
    validateAssignment: (payload, config = {}) =>
      safe(apiClient.post("/api/ai/assignments/validate", payload, config)),
    uploadAssignmentFile: (formData, config = {}) =>
      safe(
        apiClient.post("/api/ai/assignments/upload", formData, {
          ...config,
          headers: { "Content-Type": "multipart/form-data" },
        }),
      ),
    saveAssignmentReport: (payload, config = {}) =>
      safe(apiClient.post("/api/ai/assignments/report", payload, config)),
    gradeAssignment: (payload, config = {}) =>
      safe(apiClient.post("/api/ai/assignments/grade", payload, config)),
    getAssignmentById: (assignmentId, config = {}) =>
      safe(apiClient.get(`/api/ai/assignments/${assignmentId}`, config)),
    listAssignments: (params, config = {}) =>
      safe(
        apiClient.get("/api/ai/assignments", {
          ...config,
          params: cleanParams(params),
        }),
      ),
    getAssignmentsHealth: (config = {}) =>
      safe(apiClient.get("/api/ai/assignments/health", config)),

    startTutorSession: (sessionId, payload = {}, config = {}) =>
      safe(
        apiClient.post(
          `/api/ai/tutor/session/${encodeURIComponent(sessionId)}`,
          payload,
          config,
        ),
      ),
    uploadTutorMaterial: (sessionId, formData, config = {}) =>
      safe(
        apiClient.post(
          `/api/ai/tutor/material/${encodeURIComponent(sessionId)}`,
          formData,
          {
            ...config,
            headers: { "Content-Type": "multipart/form-data" },
          },
        ),
      ),
    tutorChat: (payload, config = {}) =>
      safe(
        apiClient.post("/api/ai/tutor/chat", payload, {
          ...config,
          headers: isFormDataValue(payload)
            ? { "Content-Type": "multipart/form-data" }
            : undefined,
        }),
      ),

    generateExplanation: (payload, config = {}) =>
      safe(apiClient.post("/api/ai/learning/explanation", payload, config)),
    generateEnhancedExplanations: (payload, config = {}) =>
      safe(
        apiClient.post("/api/ai/learning/explanations/batch", payload, config),
      ),

    downloadReportPdf: async (reportIdOrPath) => {
      const reportId = normalizeReportId(reportIdOrPath, [
        "/api/reports/pdf/",
        "/api/download-report/",
      ]);

      try {
        const res = await apiClient.get(`/api/ai/reports/pdf/${reportId}`, {
          responseType: "blob",
        });
        return res.data;
      } catch (err) {
        throw new Error(normalizeApiError(err));
      }
    },
    downloadReportJson: (reportIdOrPath) => {
      const reportId = normalizeReportId(reportIdOrPath, [
        "/api/reports/json/",
        "/api/report/",
      ]);
      return safe(apiClient.get(`/api/ai/reports/json/${reportId}`));
    },
    downloadReportZip: async (reportIdOrPath) => {
      const reportId = normalizeReportId(reportIdOrPath, [
        "/api/reports/download/",
      ]);

      try {
        const res = await apiClient.get(`/api/ai/reports/download/${reportId}`, {
          responseType: "blob",
        });
        return res.data;
      } catch (err) {
        throw new Error(normalizeApiError(err));
      }
    },
    getReportStatus: (reportId) =>
      safe(apiClient.get(`/api/ai/reports/status/${reportId}`)),
    getStudentReports: (studentId, params = {}) =>
      safe(
        apiClient.post("/api/ai/reports/student", {
          student_id: studentId,
          limit: params.limit,
        }),
      ),
    getStudentProgress: (studentId, days = 30) =>
      safe(
        apiClient.post("/api/ai/reports/progress", {
          student_id: studentId,
          days,
        }),
      ),
    getReportDashboard: (userIdentifier) =>
      safe(
        apiClient.get(
          `/api/ai/reports/dashboard/${encodeURIComponent(userIdentifier)}`,
        ),
      ),

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

    // -------------------------------------------------------
    // Commit 20: Teacher copilot tools
    // -------------------------------------------------------
    /** Rewrite a question: easier|harder|more_conceptual|more_applied|arabic|english */
    rewriteQuestion: (payload, config) =>
      safe(apiClient.post("/api/ai/teacher/rewrite-question", payload, config)),

    /** Generate 3 MCQ distractors for a question */
    generateDistractors: (payload, config) =>
      safe(apiClient.post("/api/ai/teacher/distractors", payload, config)),

    /** Draft teacher feedback for a student submission (teacher reviews before sending) */
    draftFeedback: (payload, config) =>
      safe(apiClient.post("/api/ai/teacher/draft-feedback", payload, config)),

    /** Draft or rewrite an announcement: draft_from_context|rewrite_tone|simplify|shorten|translate */
    draftAnnouncement: (payload, config) =>
      safe(apiClient.post("/api/ai/teacher/announcement-draft", payload, config)),

    /** Transform lesson text: summary|flashcards|key_concepts|revision_sheet|glossary|homework_draft */
    lessonSummary: (payload, config) =>
      safe(apiClient.post("/api/ai/teacher/lesson-summary", payload, config)),

    /** Explain a student's mistake after quiz/assignment. Available to students too. */
    explainMistake: (payload, config) =>
      safe(apiClient.post("/api/ai/teacher/explain-mistake", payload, config)),
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
    createUser: (payload, config = {}) => {
      const body = { ...(payload || {}) };
      if (body.role) body.role = upper(body.role);
      return safe(apiClient.post(`${ADMIN_BASE}/users/create`, body, config));
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

    assignSubject: (classId, subjectId, config = {}) =>
      safe(
        apiClient.post(
          `${ADMIN_BASE}/classes/${classId}/assign-subject`,
          { subjectId },
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
    unenrollStudents: (classId, studentIds, config = {}) =>
      safe(
        apiClient.delete(`${ADMIN_BASE}/classes/${classId}/unenroll`, {
          ...config,
          data: { studentIds },
        }),
      ),

    // Subjects
    listSubjects: (params, config = {}) =>
      safe(
        apiClient.get(`${ADMIN_BASE}/subjects`, {
          ...config,
          params: cleanParams(params),
        }),
      ),
    createSubject: (payload, config = {}) =>
      safe(apiClient.post(`${ADMIN_BASE}/subjects`, payload, config)),
    updateSubject: (id, payload, config = {}) =>
      safe(apiClient.put(`${ADMIN_BASE}/subjects/${id}`, payload, config)),
    deleteSubject: (id, config = {}) =>
      safe(apiClient.delete(`${ADMIN_BASE}/subjects/${id}`, config)),

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
    resetAiSettings: (config = {}) =>
      safe(apiClient.delete(`${ADMIN_BASE}/ai/settings`, config)),

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

    listSystemUsers: (params, config = {}) =>
      safe(
        apiClient.get(`${ADMIN_SYSTEM_BASE}/users`, {
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
