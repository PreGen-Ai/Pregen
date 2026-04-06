// AdminDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  Badge,
  Button,
  Card,
  Col,
  Container,
  Form,
  Row,
  Spinner,
  Table,
} from "react-bootstrap";

/**
 * AdminDashboard.jsx (React JSX)
 * - No api.js, all APIs are inside this file
 * - Auth: /api/users/checkAuth
 * - Role gate: admin + superadmin
 * - Includes and wires the API set you pasted
 *
 * ENV (optional):
 * - VITE_API_BASE_URL / REACT_APP_API_BASE_URL
 * - VITE_AI_BASE_URL / REACT_APP_AI_BASE_URL
 * - VITE_PDF_BASE_URL / REACT_APP_PDF_BASE_URL
 */

// ----------------------------- Base Paths -----------------------------
const ADMIN_BASE = "/api/admin";
const ADMIN_SYSTEM_BASE = "/api/admin/system";

// ----------------------------- Helpers from your api.js -----------------------------
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

function fixLegacyPath(path) {
  const p = String(path || "");
  return p.replace(/^\/api\/admin\/super\b/, `${ADMIN_SYSTEM_BASE}/super`);
}

function upper(v) {
  return v === undefined || v === null ? v : String(v).toUpperCase();
}

function normalizeApiErrorPayload(payload) {
  if (!payload) return "Request failed";
  if (typeof payload === "string") return payload;
  return (
    payload.error ||
    payload.message ||
    payload.detail ||
    payload.msg ||
    "Request failed"
  );
}

class AuthError extends Error {}
class ForbiddenError extends Error {}

// ----------------------------- Config -----------------------------
const TOKEN_STORAGE_KEY = "auth_token";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE_URL) ||
  "";

const AI_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_AI_BASE_URL) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_AI_BASE_URL) ||
  API_BASE;

const PDF_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_PDF_BASE_URL) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_PDF_BASE_URL) ||
  API_BASE;

function getToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function buildUrl(base, path, params) {
  const fixed = fixLegacyPath(path);
  const url = new URL(`${base || ""}${fixed}`, window.location.origin);

  const p = cleanParams(params);
  if (p) {
    Object.entries(p).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  }
  return url.toString().replace(window.location.origin, "");
}

async function requestJson(base, method, path, { params, body, headers } = {}) {
  const token = getToken();
  const h = new Headers(headers || {});
  h.set("Accept", "application/json");
  if (token) h.set("Authorization", `Bearer ${token}`);

  let reqBody = body;
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  if (!isFormData && body !== undefined && body !== null) {
    h.set("Content-Type", "application/json");
    reqBody = JSON.stringify(body);
  }

  const res = await fetch(buildUrl(base, path, params), {
    method,
    headers: h,
    body: reqBody,
    credentials: "include",
  });

  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 403) throw new ForbiddenError("Not authorized");

  const text = await res.text();
  const payload = text ? safeParseJson(text) : null;

  if (!res.ok) {
    throw new Error(normalizeApiErrorPayload(payload) || `HTTP ${res.status}`);
  }

  return payload ?? {};
}

async function requestBlob(base, method, path, { params, body, headers } = {}) {
  const token = getToken();
  const h = new Headers(headers || {});
  if (token) h.set("Authorization", `Bearer ${token}`);

  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;

  const res = await fetch(buildUrl(base, path, params), {
    method,
    headers: h,
    body: isFormData ? body : body,
    credentials: "include",
  });

  if (res.status === 401) throw new AuthError("Not authenticated");
  if (res.status === 403) throw new ForbiddenError("Not authorized");

  if (!res.ok) {
    let errPayload = null;
    try {
      errPayload = await res.json();
    } catch {}
    throw new Error(
      normalizeApiErrorPayload(errPayload) || `HTTP ${res.status}`
    );
  }

  return res.blob();
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Optional legacy helpers
const apiGet = (path, config = {}) =>
  requestJson(API_BASE, "GET", fixLegacyPath(path), {
    params: config.params,
    headers: config.headers,
  });

const apiPost = (path, body, config = {}) =>
  requestJson(API_BASE, "POST", fixLegacyPath(path), {
    body,
    params: config.params,
    headers: config.headers,
  });

const apiPut = (path, body, config = {}) =>
  requestJson(API_BASE, "PUT", fixLegacyPath(path), {
    body,
    params: config.params,
    headers: config.headers,
  });

const apiPatch = (path, body, config = {}) =>
  requestJson(API_BASE, "PATCH", fixLegacyPath(path), {
    body,
    params: config.params,
    headers: config.headers,
  });

const apiDelete = (path, config = {}) =>
  requestJson(API_BASE, "DELETE", fixLegacyPath(path), {
    params: config.params,
    headers: config.headers,
    body: config.data,
  });

// ----------------------------- Full API (wired into UI actions) -----------------------------
const api = {
  users: {
    signup: (payload) => apiPost("/api/users/signup", payload),
    login: (payload) => apiPost("/api/users/login", payload),
    logout: () => apiPost("/api/users/logout"),
    checkAuth: () => apiGet("/api/users/checkAuth"),

    getMyProfile: () => apiGet("/api/users/profile"),

    updateProfile: (userId, updates) => {
      const isFormData =
        typeof FormData !== "undefined" && updates instanceof FormData;

      return requestJson(API_BASE, "PUT", `/api/users/profile/${userId}`, {
        body: updates,
        headers: isFormData ? {} : undefined,
      });
    },

    // Legacy admin endpoints you already use in pages
    getAllUsersAdmin: (params) =>
      apiGet("/api/users/users", { params: cleanParams(params) }),
    getUserById: (userId) => apiGet(`/api/users/users/id/${userId}`),
    getUserByCode: (code) => apiGet(`/api/users/users/code/${code}`),
    adminUpdateUser: (id, payload) =>
      apiPut(`/api/users/admin/update-user/${id}`, payload),
    superAdminUpdateRole: (id, payload) =>
      apiPut(`/api/users/admin/update-role/${id}`, payload),

    listAllUsersSuper: () => apiGet("/api/users/all"),
    deleteUserSuper: (id) => apiDelete(`/api/users/delete/${id}`),
    restoreUser: (id) => apiPut(`/api/users/restore/${id}`),
    toggleBlock: (id) => apiPut(`/api/users/toggle-block/${id}`),

    dashboardPing: () => apiGet("/api/users/dashboard"),
  },

  courses: {
    getAllCourses: (params) =>
      apiGet("/api/courses", { params: cleanParams(params) }),

    createCourse: (payload) => apiPost("/api/courses", payload),

    getCourseById: (courseId) => apiGet(`/api/courses/${courseId}`),

    searchCourses: (params) =>
      apiGet("/api/courses/search", { params: cleanParams(params) }),

    getCourseActivity: (courseId) =>
      apiGet(`/api/courses/${courseId}/activity`),

    setCourseArchived: (courseId, archived) =>
      apiPatch(`/api/courses/${courseId}/archive`, { archived }),

    getCoursesByUser: (userId) => apiGet(`/api/courses/user/${userId}`),

    deleteCourse: (id) => apiDelete(`/api/courses/${id}`),

    addActivityToSection: (courseId, sectionId, payload) =>
      apiPost(`/api/courses/${courseId}/sections/${sectionId}/activities`, payload),

    assignToCourse: (courseId, assignmentData) =>
      apiPost(`/api/courses/${courseId}/assignments`, assignmentData),

    submitAssignment: (courseId, assignmentId, formData) =>
      requestJson(API_BASE, "POST", `/api/courses/${courseId}/assignments/${assignmentId}/submit`, {
        body: formData,
        headers: {},
      }),
  },

  // Canonical super AI request helpers — all go through /api/admin/system/super/ai-requests
  // (/api/admin/super/* is auto-rewritten by fixLegacyPath → /api/admin/system/super/*)
  getSuperAiUsage: (params) =>
    apiGet("/api/admin/super/ai-requests", { params: cleanParams(params) }),
  getSuperAiUsageSummary: (params) =>
    apiGet("/api/admin/super/ai-requests/summary", { params: cleanParams(params) }),
  getSuperAiRequests: (params) =>
    apiGet("/api/admin/super/ai-requests", { params: cleanParams(params) }),
  getSuperAiRequestsSummary: (params) =>
    apiGet("/api/admin/super/ai-requests/summary", { params: cleanParams(params) }),

  documents: {
    getDocumentsInCourse: (courseId) =>
      apiGet(`/api/documents/course/${courseId}`),

    searchDocuments: (params) =>
      apiGet("/api/documents/search", { params: cleanParams(params) }),

    uploadDocument: (formData) =>
      requestJson(API_BASE, "POST", "/api/documents/upload", {
        body: formData,
        headers: {},
      }),

    softDeleteDocument: (id) => apiPut(`/api/documents/${id}/soft-delete`),
    restoreDocument: (id) => apiPut(`/api/documents/${id}/restore`),
    updateDocument: (id, payload) => apiPut(`/api/documents/${id}`, payload),
    permanentlyDeleteDocument: (id) =>
      apiDelete(`/api/documents/${id}/permanent-delete`),

    bulkRestore: (payload) => apiPut("/api/documents/bulk-restore", payload),
    bulkDelete: (payload) =>
      apiDelete("/api/documents/bulk-delete", { data: payload }),

    downloadDocument: (id) =>
      requestBlob(API_BASE, "GET", `/api/documents/download/${id}`),

    previewDocument: (id) => apiGet(`/api/documents/preview/${id}`),

    exportPdf: (payload) =>
      requestBlob(PDF_BASE, "POST", "/api/documents/export-pdf", {
        body: payload,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/pdf",
        },
      }),
  },

  collaborators: {
    fetchCollaborators: (workspaceId) =>
      apiGet(`/api/workspaces/${workspaceId}/collaborators`),

    addCollaborator: (workspaceId, userId, role) =>
      apiPost(`/api/workspaces/${workspaceId}/add-collaborator`, {
        userId,
        role,
      }),

    removeCollaborator: (workspaceId, collaboratorId) =>
      apiDelete(`/api/workspaces/${workspaceId}/remove-collaborator/${collaboratorId}`),

    updateCollaboratorRole: (workspaceId, collaboratorId, role) =>
      apiPut(`/api/workspaces/${workspaceId}/change-role/${collaboratorId}`, { role }),
  },

  ai: {
    // Node: AI usage logging
    logUsage: (payload) => apiPost("/api/ai-usage", payload),
    listUsage: (params) =>
      apiGet("/api/ai-usage", { params: cleanParams(params) }),
    getUsageSummary: (params) =>
      apiGet("/api/ai-usage/summary", { params: cleanParams(params) }),
    getUsageById: (id) => apiGet(`/api/ai-usage/${id}`),
    deleteUsageById: (id) => apiDelete(`/api/ai-usage/${id}`),
    bulkDeleteUsage: (payload) => apiDelete("/api/ai-usage", { data: payload }),

    // Node: Admin AI settings
    getAiSettings: () => apiGet(`${ADMIN_BASE}/ai/settings`),
    updateAiSettings: (payload) => apiPut(`${ADMIN_BASE}/ai/settings`, payload),

    // AI microservice
    generateQuiz: (payload) =>
      requestJson(AI_BASE, "POST", "/api/quiz/generate", { body: payload }),
    generateAssignment: (payload) =>
      requestJson(AI_BASE, "POST", "/api/assignments/generate", { body: payload }),
    validateAssignment: (payload) =>
      requestJson(AI_BASE, "POST", "/api/assignments/validate", { body: payload }),
    uploadAssignmentFile: (formData) =>
      requestJson(AI_BASE, "POST", "/api/assignments/upload", { body: formData, headers: {} }),
    gradeAssignment: (payload) =>
      requestJson(AI_BASE, "POST", "/api/assignments/grade", { body: payload }),
    getAssignmentById: (assignmentId) =>
      requestJson(AI_BASE, "GET", `/api/assignments/${assignmentId}`),
    listAssignments: () => requestJson(AI_BASE, "GET", "/api/assignments"),

    // PDF export via pdf base
    exportPdf: (payload) =>
      requestBlob(PDF_BASE, "POST", "/api/documents/export-pdf", {
        body: payload,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/pdf",
        },
      }),

    // Optional endpoints
    getRecoverySuggestions: (deletedItems) =>
      apiPost("/api/ai/recovery-suggestions", { items: deletedItems }),
    analyzeRecoveryPatterns: (recoveryHistory) =>
      apiPost("/api/ai/analyze-patterns", { history: recoveryHistory }),
    classifyDocument: (formData) =>
      requestJson(API_BASE, "POST", "/api/ai/classify-document", { body: formData, headers: {} }),
    generateSmartTags: (documentData) =>
      apiPost("/api/ai/generate-tags", documentData),
    suggestCollaboratorRole: (collaboratorInfo) =>
      apiPost("/api/ai/suggest-role", collaboratorInfo),
    analyzeSentiment: (messages) =>
      apiPost("/api/ai/sentiment", { messages }),
    detectAnomalies: (activityData) =>
      apiPost("/api/ai/detect-anomalies", activityData),
  },

  admin: {
    // Dashboard
    getDashboardMetrics: () => apiGet(`${ADMIN_BASE}/dashboard/metrics`),

    // Users
    listUsers: (params) =>
      apiGet(`${ADMIN_BASE}/users`, { params: cleanParams(params) }),

    inviteUser: (payload) => {
      const body = { ...(payload || {}) };
      if (body.role) body.role = upper(body.role);
      return apiPost(`${ADMIN_BASE}/users/invite`, body);
    },

    setUserStatus: (userId, enabled) =>
      apiPatch(`${ADMIN_BASE}/users/${userId}/status`, { enabled }),

    setUserRole: (userId, role) =>
      apiPatch(`${ADMIN_BASE}/users/${userId}/role`, { role: upper(role) }),

    resetUserPassword: (userId) =>
      apiPost(`${ADMIN_BASE}/users/${userId}/reset-password`, null),

    // Classes
    listClasses: (params) =>
      apiGet(`${ADMIN_BASE}/classes`, { params: cleanParams(params) }),

    createClass: (payload) => apiPost(`${ADMIN_BASE}/classes`, payload),

    assignTeacher: (classId, teacherId) =>
      apiPost(`${ADMIN_BASE}/classes/${classId}/assign-teacher`, { teacherId }),

    enrollStudents: (classId, studentIds) =>
      apiPost(`${ADMIN_BASE}/classes/${classId}/enroll`, { studentIds }),

    // Branding
    getBranding: () => apiGet(`${ADMIN_BASE}/branding`),

    updateBranding: (payload) => apiPut(`${ADMIN_BASE}/branding`, payload),

    uploadLogo: (file) => {
      const form = new FormData();
      form.append("logo", file);
      return requestJson(API_BASE, "POST", `${ADMIN_BASE}/branding/logo`, {
        body: form,
        headers: {},
      });
    },

    // AI settings (duplicate access, kept for ergonomics)
    getAiSettings: () => apiGet(`${ADMIN_BASE}/ai/settings`),
    updateAiSettings: (payload) => apiPut(`${ADMIN_BASE}/ai/settings`, payload),

    // Analytics
    getAnalyticsSummary: (params) =>
      apiGet(`${ADMIN_BASE}/analytics/summary`, { params: cleanParams(params) }),

    exportAnalytics: (type, params) =>
      requestBlob(API_BASE, "GET", `${ADMIN_BASE}/analytics/export/${type}`, {
        params: cleanParams(params),
      }),

    // System routes
    merchantOverview: () => apiGet(`${ADMIN_SYSTEM_BASE}/overview`),
    merchantRecentLogs: () => apiGet(`${ADMIN_SYSTEM_BASE}/logs/recent`),

    superOverview: () => apiGet(`${ADMIN_SYSTEM_BASE}/super/overview`),

    listTenants: (params) =>
      apiGet(`${ADMIN_SYSTEM_BASE}/super/tenants`, { params: cleanParams(params) }),

    getAICost: (params) =>
      apiGet(`${ADMIN_SYSTEM_BASE}/super/ai-cost`, { params: cleanParams(params) }),

    listFeatureFlags: (params) =>
      apiGet(`${ADMIN_SYSTEM_BASE}/super/feature-flags`, { params: cleanParams(params) }),

    listAuditLogs: (params) =>
      apiGet(`${ADMIN_SYSTEM_BASE}/super/logs`, { params: cleanParams(params) }),

    listAiRequests: (params) =>
      apiGet(`${ADMIN_SYSTEM_BASE}/super/ai-requests`, { params: cleanParams(params) }),

    getAiRequestsSummary: (params) =>
      apiGet(`${ADMIN_SYSTEM_BASE}/super/ai-requests/summary`, { params: cleanParams(params) }),

    listTenantUsers: (params) =>
      apiGet(`${ADMIN_SYSTEM_BASE}/users`, { params: cleanParams(params) }),

    createAdmin: (payload) => apiPost(`${ADMIN_SYSTEM_BASE}/createAdmin`, payload),

    promoteToAdmin: (userId) =>
      apiPut(`${ADMIN_SYSTEM_BASE}/promote/${userId}`, null),
  },
};

// ----------------------------- UI Helpers -----------------------------
function JsonBox({ value }) {
  if (value === undefined || value === null) return <div className="text-muted">—</div>;
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        background: "#0b1020",
        color: "#d7e1ff",
        borderRadius: 10,
        overflowX: "auto",
        fontSize: 12,
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function roleBadge(role) {
  const v = String(role || "").toLowerCase();
  if (v === "superadmin") return <Badge bg="danger">superadmin</Badge>;
  if (v === "admin") return <Badge bg="primary">admin</Badge>;
  if (v === "teacher") return <Badge bg="info">teacher</Badge>;
  if (v === "student") return <Badge bg="secondary">student</Badge>;
  return (
    <Badge bg="light" text="dark">
      {role || "unknown"}
    </Badge>
  );
}

function pickUser(authRes) {
  if (!authRes) return null;
  if (authRes.user) return authRes.user;
  if (authRes.data && authRes.data.user) return authRes.data.user;
  return authRes;
}

export default function AdminDashboard() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState("");

  // Common outputs
  const [metrics, setMetrics] = useState(null);

  // Users
  const [userFilters, setUserFilters] = useState({ q: "", role: "", status: "" });
  const [users, setUsers] = useState([]);
  const [invite, setInvite] = useState({ email: "", name: "", role: "STUDENT" });
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserOut, setSelectedUserOut] = useState(null);

  // Classes
  const [classes, setClasses] = useState([]);
  const [newClassName, setNewClassName] = useState("");
  const [assignTeacher, setAssignTeacher] = useState({ classId: "", teacherId: "" });
  const [enroll, setEnroll] = useState({ classId: "", studentIdsCsv: "" });

  // Branding
  const [branding, setBranding] = useState(null);
  const [brandingDraft, setBrandingDraft] = useState("{}");
  const [logoFile, setLogoFile] = useState(null);

  // Analytics
  const [analyticsSummary, setAnalyticsSummary] = useState(null);
  const [analyticsType, setAnalyticsType] = useState("users");

  // AI
  const [aiSettings, setAiSettings] = useState(null);
  const [aiUsageSummary, setAiUsageSummary] = useState(null);
  const [aiRequestsSummary, setAiRequestsSummary] = useState(null);

  // System
  const [systemOut, setSystemOut] = useState(null);

  // Documents
  const [docQuery, setDocQuery] = useState("");
  const [docResults, setDocResults] = useState([]);
  const [docCourseId, setDocCourseId] = useState("");
  const [docUploadFile, setDocUploadFile] = useState(null);

  // Courses
  const [courseQuery, setCourseQuery] = useState("");
  const [courses, setCourses] = useState([]);
  const [newCourseTitle, setNewCourseTitle] = useState("");

  const displayName = useMemo(
    () => (me && (me.name || me.email)) || "Admin",
    [me]
  );
  const isSuperAdmin = (me && String(me.role).toLowerCase()) === "superadmin";

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setFatal("");

      try {
        const auth = await api.users.checkAuth();
        if (!alive) return;

        const u = pickUser(auth);
        const role = (u && u.role) || auth.role;

        if (!u) throw new AuthError("No user");

        // --- AUTHZ ---
        if (role !== "admin" && role !== "superadmin") {
          if (role === "student") {
            window.location.href = "/dashboard";
            return;
          }
          window.location.href = "/";
          return;
        }

        setMe({ ...u, role });

        const m = await api.admin.getDashboardMetrics();
        if (!alive) return;
        setMetrics(m);

        // Prime a few panels
        const [uList, cls] = await Promise.all([
          api.admin.listUsers({}),
          api.admin.listClasses({}),
        ]);

        if (!alive) return;
        setUsers(Array.isArray(uList) ? uList : uList.items || []);
        setClasses(Array.isArray(cls) ? cls : cls.items || []);
      } catch (e) {
        if (!alive) return;

        if (e instanceof AuthError) {
          window.location.href = "/login";
          return;
        }

        if (e instanceof ForbiddenError) {
          setFatal("You are logged in, but you do not have access to the Admin Dashboard.");
          return;
        }

        setFatal((e && e.message) || "Failed to load dashboard.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const onLogout = async () => {
    try {
      await api.users.logout();
    } catch {}
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {}
    window.location.href = "/login";
  };

  // ----------------------------- Actions -----------------------------
  const refreshMetrics = async () => setMetrics(await api.admin.getDashboardMetrics());

  const refreshUsers = async () => {
    const out = await api.admin.listUsers(userFilters);
    setUsers(Array.isArray(out) ? out : out.items || []);
  };

  const doInvite = async () => {
    const out = await api.admin.inviteUser(invite);
    setSelectedUserOut(out);
    await refreshUsers();
  };

  const getUserById = async () => {
    if (!selectedUserId.trim()) return;
    const out = await api.users.getUserById(selectedUserId.trim());
    setSelectedUserOut(out);
  };

  const getUserByCode = async () => {
    if (!selectedUserId.trim()) return;
    const out = await api.users.getUserByCode(selectedUserId.trim());
    setSelectedUserOut(out);
  };

  const toggleBlock = async () => {
    if (!selectedUserId.trim()) return;
    const out = await api.users.toggleBlock(selectedUserId.trim());
    setSelectedUserOut(out);
    await refreshUsers();
  };

  const restoreUser = async () => {
    if (!selectedUserId.trim()) return;
    const out = await api.users.restoreUser(selectedUserId.trim());
    setSelectedUserOut(out);
    await refreshUsers();
  };

  const deleteUser = async () => {
    if (!selectedUserId.trim()) return;
    const out = await api.users.deleteUserSuper(selectedUserId.trim());
    setSelectedUserOut(out);
    await refreshUsers();
  };

  const setRole = async (role) => {
    if (!selectedUserId.trim()) return;
    const out = await api.admin.setUserRole(selectedUserId.trim(), role);
    setSelectedUserOut(out);
    await refreshUsers();
  };

  const setStatus = async (enabled) => {
    if (!selectedUserId.trim()) return;
    const out = await api.admin.setUserStatus(selectedUserId.trim(), enabled);
    setSelectedUserOut(out);
    await refreshUsers();
  };

  const resetPassword = async () => {
    if (!selectedUserId.trim()) return;
    const out = await api.admin.resetUserPassword(selectedUserId.trim());
    setSelectedUserOut(out);
  };

  const refreshClasses = async () => {
    const out = await api.admin.listClasses({});
    setClasses(Array.isArray(out) ? out : out.items || []);
  };

  const createClass = async () => {
    if (!newClassName.trim()) return;
    await api.admin.createClass({ name: newClassName.trim() });
    setNewClassName("");
    await refreshClasses();
  };

  const assignTeacherToClass = async () => {
    if (!assignTeacher.classId || !assignTeacher.teacherId) return;
    const out = await api.admin.assignTeacher(assignTeacher.classId, assignTeacher.teacherId);
    setSystemOut(out);
    await refreshClasses();
  };

  const enrollStudents = async () => {
    if (!enroll.classId || !enroll.studentIdsCsv.trim()) return;
    const studentIds = enroll.studentIdsCsv.split(",").map((s) => s.trim()).filter(Boolean);
    const out = await api.admin.enrollStudents(enroll.classId, studentIds);
    setSystemOut(out);
    await refreshClasses();
  };

  const loadBranding = async () => {
    const out = await api.admin.getBranding();
    setBranding(out);
    setBrandingDraft(JSON.stringify(out || {}, null, 2));
  };

  const saveBranding = async () => {
    let payload = {};
    try {
      payload = JSON.parse(brandingDraft || "{}");
    } catch {
      alert("Branding JSON is invalid.");
      return;
    }
    const out = await api.admin.updateBranding(payload);
    setBranding(out);
  };

  const uploadLogo = async () => {
    if (!logoFile) return;
    const out = await api.admin.uploadLogo(logoFile);
    setBranding(out);
  };

  const loadAiSettings = async () => setAiSettings(await api.ai.getAiSettings());

  const saveAiSettings = async () => {
    const draft = aiSettings || {};
    const out = await api.ai.updateAiSettings(draft);
    setAiSettings(out);
  };

  const loadAiSummaries = async () => {
    const [uSum, rSum] = await Promise.all([
      api.getSuperAiUsageSummary({}),
      api.getSuperAiRequestsSummary({}),
    ]);
    setAiUsageSummary(uSum);
    setAiRequestsSummary(rSum);
  };

  const loadAnalyticsSummary = async () => setAnalyticsSummary(await api.admin.getAnalyticsSummary({}));

  const exportAnalytics = async () => {
    const blob = await api.admin.exportAnalytics(analyticsType, {});
    downloadBlob(blob, `analytics_${analyticsType}.csv`);
  };

  const systemSuperOverview = async () => setSystemOut(await api.admin.superOverview());
  const systemTenants = async () => setSystemOut(await api.admin.listTenants({}));
  const systemAICost = async () => setSystemOut(await api.admin.getAICost({}));
  const systemFeatureFlags = async () => setSystemOut(await api.admin.listFeatureFlags({}));
  const systemAuditLogs = async () => setSystemOut(await api.admin.listAuditLogs({}));
  const systemAiRequests = async () => setSystemOut(await api.admin.listAiRequests({}));
  const systemAiRequestsSummary = async () => setSystemOut(await api.admin.getAiRequestsSummary({}));
  const systemTenantUsers = async () => setSystemOut(await api.admin.listTenantUsers({}));
  const systemRecentLogs = async () => setSystemOut(await api.admin.merchantRecentLogs());

  const searchDocs = async () => {
    const out = await api.documents.searchDocuments({ q: docQuery, courseId: docCourseId || undefined });
    setDocResults(Array.isArray(out) ? out : out.items || []);
  };

  const uploadDoc = async () => {
    if (!docUploadFile) return;
    const form = new FormData();
    form.append("file", docUploadFile);
    const out = await api.documents.uploadDocument(form);
    setSystemOut(out);
    setDocUploadFile(null);
    await searchDocs();
  };

  const previewDoc = async (id) => {
    const out = await api.documents.previewDocument(id);
    setSystemOut(out);
  };

  const downloadDoc = async (id) => {
    const blob = await api.documents.downloadDocument(id);
    downloadBlob(blob, `document_${id}`);
  };

  const exportPdf = async () => {
    const blob = await api.documents.exportPdf({ q: docQuery || undefined, courseId: docCourseId || undefined });
    downloadBlob(blob, "documents_export.pdf");
  };

  const searchCourses = async () => {
    const out = await api.courses.searchCourses({ q: courseQuery });
    setCourses(Array.isArray(out) ? out : out.items || []);
  };

  const createCourse = async () => {
    if (!newCourseTitle.trim()) return;
    const out = await api.courses.createCourse({ title: newCourseTitle.trim() });
    setSystemOut(out);
    setNewCourseTitle("");
    await searchCourses();
  };

  if (loading) {
    return (
      <Container className="py-5">
        <div className="d-flex align-items-center gap-3">
          <Spinner animation="border" />
          <div>Loading admin dashboard…</div>
        </div>
      </Container>
    );
  }

  if (fatal) {
    return (
      <Container className="py-5">
        <Card>
          <Card.Body>
            <Card.Title>Admin Dashboard</Card.Title>
            <Card.Text className="text-danger">{fatal}</Card.Text>
            <div className="d-flex gap-2">
              <Button variant="secondary" onClick={() => window.location.reload()}>
                Retry
              </Button>
              <Button variant="outline-danger" onClick={onLogout}>
                Logout
              </Button>
            </div>
          </Card.Body>
        </Card>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h2 className="mb-1">Welcome, {displayName}</h2>
          <div className="text-muted d-flex align-items-center gap-2">
            Admin Dashboard {roleBadge(me && me.role)}
          </div>
        </div>
        <Button variant="outline-danger" onClick={onLogout}>
          Logout
        </Button>
      </div>

      <Row className="g-3">
        <Col md={12}>
          <Card>
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                  <div className="fw-semibold">Dashboard metrics</div>
                  <div className="text-muted" style={{ fontSize: 13 }}>
                    Uses: admin.getDashboardMetrics
                  </div>
                </div>
                <Button variant="secondary" onClick={refreshMetrics}>
                  Refresh
                </Button>
              </div>
              <div className="mt-3">
                <JsonBox value={metrics} />
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col md={12}>
          <Accordion defaultActiveKey="users">
            <Accordion.Item eventKey="users">
              <Accordion.Header>Users</Accordion.Header>
              <Accordion.Body>
                <Row className="g-3">
                  <Col md={8}>
                    <Card className="p-3">
                      <div className="fw-semibold mb-2">List users</div>
                      <Row className="g-2">
                        <Col md={4}>
                          <Form.Label>q</Form.Label>
                          <Form.Control
                            value={userFilters.q}
                            onChange={(e) => setUserFilters({ ...userFilters, q: e.target.value })}
                            placeholder="name, email"
                          />
                        </Col>
                        <Col md={4}>
                          <Form.Label>role</Form.Label>
                          <Form.Control
                            value={userFilters.role}
                            onChange={(e) => setUserFilters({ ...userFilters, role: e.target.value })}
                            placeholder="student, teacher, admin"
                          />
                        </Col>
                        <Col md={4}>
                          <Form.Label>status</Form.Label>
                          <Form.Control
                            value={userFilters.status}
                            onChange={(e) => setUserFilters({ ...userFilters, status: e.target.value })}
                            placeholder="enabled, disabled"
                          />
                        </Col>
                      </Row>
                      <div className="mt-2 d-flex gap-2 flex-wrap">
                        <Button variant="secondary" onClick={refreshUsers}>
                          Refresh list
                        </Button>
                        <Button variant="outline-secondary" onClick={async () => setUsers(await api.users.getAllUsersAdmin(userFilters))}>
                          Legacy list (users.getAllUsersAdmin)
                        </Button>
                      </div>

                      <div className="mt-3">
                        <Table responsive hover size="sm">
                          <thead>
                            <tr>
                              <th>ID</th>
                              <th>Email</th>
                              <th>Role</th>
                            </tr>
                          </thead>
                          <tbody>
                            {users.map((u) => (
                              <tr key={u._id || u.id} onClick={() => setSelectedUserId(u._id || u.id)} style={{ cursor: "pointer" }}>
                                <td>{u._id || u.id}</td>
                                <td>{u.email || "—"}</td>
                                <td>{roleBadge(u.role)}</td>
                              </tr>
                            ))}
                            {users.length === 0 && (
                              <tr>
                                <td colSpan={3} className="text-muted">
                                  No users found.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </Table>
                      </div>
                    </Card>
                  </Col>

                  <Col md={4}>
                    <Card className="p-3 mb-3">
                      <div className="fw-semibold mb-2">Invite user</div>
                      <Form.Label>Email</Form.Label>
                      <Form.Control
                        value={invite.email}
                        onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                        placeholder="user@example.com"
                      />
                      <Form.Label className="mt-2">Name</Form.Label>
                      <Form.Control
                        value={invite.name}
                        onChange={(e) => setInvite({ ...invite, name: e.target.value })}
                        placeholder="Full name"
                      />
                      <Form.Label className="mt-2">Role</Form.Label>
                      <Form.Control
                        value={invite.role}
                        onChange={(e) => setInvite({ ...invite, role: e.target.value })}
                        placeholder="STUDENT, TEACHER"
                      />
                      <div className="mt-2">
                        <Button variant="primary" onClick={doInvite} disabled={!invite.email.trim()}>
                          Invite
                        </Button>
                      </div>
                    </Card>

                    <Card className="p-3">
                      <div className="fw-semibold mb-2">Selected user tools</div>
                      <Form.Label>User ID or code</Form.Label>
                      <Form.Control
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        placeholder="id or code"
                      />
                      <div className="mt-2 d-flex gap-2 flex-wrap">
                        <Button size="sm" variant="secondary" onClick={getUserById}>
                          getUserById
                        </Button>
                        <Button size="sm" variant="outline-secondary" onClick={getUserByCode}>
                          getUserByCode
                        </Button>
                      </div>

                      <div className="mt-2 d-flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline-primary" onClick={() => setRole("TEACHER")}>
                          Set role TEACHER
                        </Button>
                        <Button size="sm" variant="outline-primary" onClick={() => setRole("STUDENT")}>
                          Set role STUDENT
                        </Button>
                        {isSuperAdmin && (
                          <Button size="sm" variant="danger" onClick={() => setRole("ADMIN")}>
                            Promote ADMIN
                          </Button>
                        )}
                      </div>

                      <div className="mt-2 d-flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline-success" onClick={() => setStatus(true)}>
                          Enable
                        </Button>
                        <Button size="sm" variant="outline-warning" onClick={() => setStatus(false)}>
                          Disable
                        </Button>
                      </div>

                      <div className="mt-2 d-flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline-dark" onClick={toggleBlock}>
                          toggleBlock
                        </Button>
                        <Button size="sm" variant="outline-success" onClick={restoreUser}>
                          restoreUser
                        </Button>
                        {isSuperAdmin && (
                          <Button size="sm" variant="outline-danger" onClick={deleteUser}>
                            deleteUserSuper
                          </Button>
                        )}
                      </div>

                      <div className="mt-2 d-flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline-secondary" onClick={resetPassword}>
                          resetUserPassword
                        </Button>
                      </div>

                      <div className="mt-3">
                        <JsonBox value={selectedUserOut} />
                      </div>
                    </Card>
                  </Col>
                </Row>
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="classes">
              <Accordion.Header>Classes</Accordion.Header>
              <Accordion.Body>
                <Row className="g-3">
                  <Col md={6}>
                    <Card className="p-3">
                      <div className="fw-semibold mb-2">List classes</div>
                      <Button variant="secondary" onClick={refreshClasses}>
                        Refresh
                      </Button>
                      <div className="mt-3">
                        <JsonBox value={classes} />
                      </div>
                    </Card>
                  </Col>
                  <Col md={6}>
                    <Card className="p-3">
                      <div className="fw-semibold mb-2">Create class</div>
                      <Form.Control
                        value={newClassName}
                        onChange={(e) => setNewClassName(e.target.value)}
                        placeholder="Class name"
                      />
                      <div className="mt-2">
                        <Button variant="primary" onClick={createClass} disabled={!newClassName.trim()}>
                          Create
                        </Button>
                      </div>

                      <hr />

                      <div className="fw-semibold mb-2">Assign teacher</div>
                      <Row className="g-2">
                        <Col md={6}>
                          <Form.Control
                            value={assignTeacher.classId}
                            onChange={(e) => setAssignTeacher({ ...assignTeacher, classId: e.target.value })}
                            placeholder="classId"
                          />
                        </Col>
                        <Col md={6}>
                          <Form.Control
                            value={assignTeacher.teacherId}
                            onChange={(e) => setAssignTeacher({ ...assignTeacher, teacherId: e.target.value })}
                            placeholder="teacherId"
                          />
                        </Col>
                      </Row>
                      <div className="mt-2">
                        <Button variant="secondary" onClick={assignTeacherToClass}>
                          Assign
                        </Button>
                      </div>

                      <hr />

                      <div className="fw-semibold mb-2">Enroll students</div>
                      <Form.Control
                        value={enroll.classId}
                        onChange={(e) => setEnroll({ ...enroll, classId: e.target.value })}
                        placeholder="classId"
                      />
                      <Form.Control
                        className="mt-2"
                        value={enroll.studentIdsCsv}
                        onChange={(e) => setEnroll({ ...enroll, studentIdsCsv: e.target.value })}
                        placeholder="studentIds (comma separated)"
                      />
                      <div className="mt-2">
                        <Button variant="secondary" onClick={enrollStudents}>
                          Enroll
                        </Button>
                      </div>
                    </Card>
                  </Col>
                </Row>
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="courses">
              <Accordion.Header>Courses</Accordion.Header>
              <Accordion.Body>
                <Row className="g-3">
                  <Col md={6}>
                    <Card className="p-3">
                      <div className="fw-semibold mb-2">Search courses</div>
                      <Form.Control
                        value={courseQuery}
                        onChange={(e) => setCourseQuery(e.target.value)}
                        placeholder="q"
                      />
                      <div className="mt-2 d-flex gap-2 flex-wrap">
                        <Button variant="secondary" onClick={searchCourses}>
                          Search
                        </Button>
                        <Button variant="outline-secondary" onClick={async () => setCourses(await api.courses.getAllCourses({ q: courseQuery }))}>
                          getAllCourses
                        </Button>
                      </div>
                      <div className="mt-3">
                        <JsonBox value={courses} />
                      </div>
                    </Card>
                  </Col>
                  <Col md={6}>
                    <Card className="p-3">
                      <div className="fw-semibold mb-2">Create course</div>
                      <Form.Control
                        value={newCourseTitle}
                        onChange={(e) => setNewCourseTitle(e.target.value)}
                        placeholder="Course title"
                      />
                      <div className="mt-2">
                        <Button variant="primary" onClick={createCourse} disabled={!newCourseTitle.trim()}>
                          Create
                        </Button>
                      </div>
                      <div className="mt-3">
                        <JsonBox value={systemOut} />
                      </div>
                    </Card>
                  </Col>
                </Row>
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="docs">
              <Accordion.Header>Documents</Accordion.Header>
              <Accordion.Body>
                <Row className="g-3">
                  <Col md={8}>
                    <Card className="p-3">
                      <div className="fw-semibold mb-2">Search documents</div>
                      <Row className="g-2">
                        <Col md={8}>
                          <Form.Control
                            value={docQuery}
                            onChange={(e) => setDocQuery(e.target.value)}
                            placeholder="q"
                          />
                        </Col>
                        <Col md={4}>
                          <Form.Control
                            value={docCourseId}
                            onChange={(e) => setDocCourseId(e.target.value)}
                            placeholder="courseId (optional)"
                          />
                        </Col>
                      </Row>
                      <div className="mt-2 d-flex gap-2 flex-wrap">
                        <Button variant="secondary" onClick={searchDocs}>
                          Search
                        </Button>
                        <Button variant="outline-secondary" onClick={exportPdf}>
                          Export PDF
                        </Button>
                      </div>

                      <div className="mt-3">
                        <Table responsive hover size="sm">
                          <thead>
                            <tr>
                              <th>ID</th>
                              <th>Title</th>
                              <th style={{ width: 260 }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {docResults.map((d) => (
                              <tr key={d._id || d.id}>
                                <td>{d._id || d.id}</td>
                                <td>{d.title || d.name || "—"}</td>
                                <td className="d-flex gap-2 flex-wrap">
                                  <Button size="sm" variant="outline-primary" onClick={() => previewDoc(d._id || d.id)}>
                                    Preview
                                  </Button>
                                  <Button size="sm" variant="outline-success" onClick={() => downloadDoc(d._id || d.id)}>
                                    Download
                                  </Button>
                                </td>
                              </tr>
                            ))}
                            {docResults.length === 0 && (
                              <tr>
                                <td colSpan={3} className="text-muted">
                                  No documents found.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </Table>
                      </div>
                    </Card>
                  </Col>

                  <Col md={4}>
                    <Card className="p-3">
                      <div className="fw-semibold mb-2">Upload document</div>
                      <Form.Control type="file" onChange={(e) => setDocUploadFile(e.target.files && e.target.files[0])} />
                      <div className="mt-2">
                        <Button variant="primary" onClick={uploadDoc} disabled={!docUploadFile}>
                          Upload
                        </Button>
                      </div>

                      <hr />

                      <div className="fw-semibold mb-2">Bulk tools</div>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={async () => setSystemOut(await api.ai.exportPdf({ q: docQuery || undefined }))}
                      >
                        AI exportPdf
                      </Button>

                      <div className="mt-3">
                        <JsonBox value={systemOut} />
                      </div>
                    </Card>
                  </Col>
                </Row>
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="branding">
              <Accordion.Header>Branding</Accordion.Header>
              <Accordion.Body>
                <Row className="g-3">
                  <Col md={6}>
                    <Card className="p-3">
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="fw-semibold">Current branding</div>
                        <Button variant="secondary" size="sm" onClick={loadBranding}>
                          Load
                        </Button>
                      </div>
                      <div className="mt-2">
                        <JsonBox value={branding} />
                      </div>
                    </Card>
                  </Col>
                  <Col md={6}>
                    <Card className="p-3">
                      <div className="fw-semibold mb-2">Edit branding (JSON)</div>
                      <Form.Control
                        as="textarea"
                        rows={10}
                        value={brandingDraft}
                        onChange={(e) => setBrandingDraft(e.target.value)}
                      />
                      <div className="mt-2 d-flex gap-2 flex-wrap">
                        <Button variant="primary" onClick={saveBranding}>
                          Save
                        </Button>
                        <Form.Control
                          type="file"
                          onChange={(e) => setLogoFile(e.target.files && e.target.files[0])}
                        />
                        <Button variant="secondary" onClick={uploadLogo} disabled={!logoFile}>
                          Upload logo
                        </Button>
                      </div>
                    </Card>
                  </Col>
                </Row>
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="ai">
              <Accordion.Header>AI</Accordion.Header>
              <Accordion.Body>
                <Row className="g-3">
                  <Col md={6}>
                    <Card className="p-3">
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="fw-semibold">AI settings</div>
                        <div className="d-flex gap-2">
                          <Button variant="secondary" size="sm" onClick={loadAiSettings}>
                            Load
                          </Button>
                          <Button variant="primary" size="sm" onClick={saveAiSettings} disabled={!aiSettings}>
                            Save
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2">
                        <JsonBox value={aiSettings} />
                      </div>
                    </Card>
                  </Col>

                  <Col md={6}>
                    <Card className="p-3">
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="fw-semibold">Super AI summaries</div>
                        <Button variant="secondary" size="sm" onClick={loadAiSummaries} disabled={!isSuperAdmin}>
                          Load
                        </Button>
                      </div>
                      {!isSuperAdmin && (
                        <div className="text-muted mt-2" style={{ fontSize: 13 }}>
                          Superadmin only.
                        </div>
                      )}
                      <div className="mt-2">
                        <div className="fw-semibold mb-1">Usage summary</div>
                        <JsonBox value={aiUsageSummary} />
                      </div>
                      <div className="mt-3">
                        <div className="fw-semibold mb-1">Requests summary</div>
                        <JsonBox value={aiRequestsSummary} />
                      </div>
                    </Card>
                  </Col>
                </Row>
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="analytics">
              <Accordion.Header>Analytics</Accordion.Header>
              <Accordion.Body>
                <Row className="g-3">
                  <Col md={6}>
                    <Card className="p-3">
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="fw-semibold">Analytics summary</div>
                        <Button variant="secondary" size="sm" onClick={loadAnalyticsSummary}>
                          Load
                        </Button>
                      </div>
                      <div className="mt-2">
                        <JsonBox value={analyticsSummary} />
                      </div>
                    </Card>
                  </Col>
                  <Col md={6}>
                    <Card className="p-3">
                      <div className="fw-semibold mb-2">Export analytics</div>
                      <Form.Select value={analyticsType} onChange={(e) => setAnalyticsType(e.target.value)}>
                        <option value="users">users</option>
                        <option value="courses">courses</option>
                        <option value="ai">ai</option>
                        <option value="documents">documents</option>
                      </Form.Select>
                      <div className="mt-2">
                        <Button variant="primary" onClick={exportAnalytics}>
                          Export CSV
                        </Button>
                      </div>
                    </Card>
                  </Col>
                </Row>
              </Accordion.Body>
            </Accordion.Item>

            <Accordion.Item eventKey="system">
              <Accordion.Header>System and superadmin tools</Accordion.Header>
              <Accordion.Body>
                <Row className="g-3">
                  <Col md={4}>
                    <Card className="p-3">
                      <div className="fw-semibold mb-2">Merchant</div>
                      <div className="d-grid gap-2">
                        <Button variant="secondary" onClick={systemRecentLogs}>
                          Recent logs
                        </Button>
                      </div>
                    </Card>
                  </Col>
                  <Col md={4}>
                    <Card className="p-3">
                      <div className="fw-semibold mb-2">Super overview</div>
                      <div className="d-grid gap-2">
                        <Button variant="danger" onClick={systemSuperOverview} disabled={!isSuperAdmin}>
                          Overview
                        </Button>
                        <Button variant="danger" onClick={systemTenants} disabled={!isSuperAdmin}>
                          Tenants
                        </Button>
                        <Button variant="danger" onClick={systemAICost} disabled={!isSuperAdmin}>
                          AI cost
                        </Button>
                      </div>
                    </Card>
                  </Col>
                  <Col md={4}>
                    <Card className="p-3">
                      <div className="fw-semibold mb-2">Super logs and flags</div>
                      <div className="d-grid gap-2">
                        <Button variant="danger" onClick={systemFeatureFlags} disabled={!isSuperAdmin}>
                          Feature flags
                        </Button>
                        <Button variant="danger" onClick={systemAuditLogs} disabled={!isSuperAdmin}>
                          Audit logs
                        </Button>
                        <Button variant="danger" onClick={systemAiRequests} disabled={!isSuperAdmin}>
                          AI requests
                        </Button>
                        <Button variant="danger" onClick={systemAiRequestsSummary} disabled={!isSuperAdmin}>
                          AI requests summary
                        </Button>
                        <Button variant="danger" onClick={systemTenantUsers} disabled={!isSuperAdmin}>
                          Tenant users
                        </Button>
                      </div>
                    </Card>
                  </Col>

                  <Col md={12}>
                    <Card className="p-3">
                      <div className="fw-semibold mb-2">Output</div>
                      <JsonBox value={systemOut} />
                    </Card>
                  </Col>
                </Row>
              </Accordion.Body>
            </Accordion.Item>
          </Accordion>
        </Col>
      </Row>
    </Container>
  );
}
