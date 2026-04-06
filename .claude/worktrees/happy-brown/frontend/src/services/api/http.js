// src/services/api/http.js
import axios from "axios";

/**
 * Base URLs
 * - CRA env: REACT_APP_*
 * - Vite env: VITE_*
 * - Fallback to hostname defaults
 */
const hostname = typeof window !== "undefined" ? window.location.hostname : "";

const ENV_API =
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_API_BASE_URL) ||
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL)) ||
  "";

const ENV_AI =
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_AI_BASE_URL) ||
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_AI_BASE_URL || import.meta.env.VITE_AI_URL)) ||
  "";

export const API_BASE_URL =
  ENV_API ||
  (hostname === "localhost" || hostname === "127.0.0.1"
    ? "http://localhost:4000"
    : hostname.includes("preprod")
      ? "https://preprod-pregen.onrender.com"
      : "https://pregen.onrender.com");

export const AI_BASE_URL =
  ENV_AI ||
  (hostname === "localhost" || hostname === "127.0.0.1"
    ? "http://localhost:8000"
    : hostname.includes("preprod")
      ? "https://preprod-pregen.onrender.com"
      : "https://pregen.onrender.com");

/**
 * Token handling
 */
const tokenKeys = ["token", "accessToken", "jwt"];
const userKeys = ["user", "auth", "sessionUser", "authUser", "currentUser"];

export function getAuthToken() {
  if (typeof window === "undefined") return null;

  for (const k of tokenKeys) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v) return v;
  }

  for (const k of userKeys) {
    const raw = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (!raw) continue;

    try {
      const obj = JSON.parse(raw);
      const t =
        obj?.token ||
        obj?.accessToken ||
        obj?.jwt ||
        obj?.data?.token ||
        obj?.data?.accessToken ||
        obj?.data?.jwt;
      if (t) return t;
    } catch {
      // ignore
    }
  }

  return null;
}

export function setAuthToken(token) {
  if (typeof window === "undefined") return;
  if (!token) return;
  localStorage.setItem("token", token);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;

  for (const k of tokenKeys) {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  }

  for (const k of userKeys) {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  }
}

// Backward-compatible aliases
export const getToken = getAuthToken;
export const clearToken = clearAuthToken;

/**
 * SUPERADMIN tenant scoping
 * - For /api/admin/* routes (admin module), backend requires tenantId.
 * - SUPERADMIN must send x-tenant-id (or query param).
 *
 * We store the currently-selected tenant in localStorage:
 *   localStorage.setItem("activeTenantId", "tnt_pregen_010")
 *
 * You can set this from the Tenants page when you click "View tenant" or "Use tenant".
 */
const ACTIVE_TENANT_KEY = "activeTenantId";

export function getActiveTenantId() {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(ACTIVE_TENANT_KEY);
  return v ? String(v).trim() : null;
}

export function setActiveTenantId(tenantId) {
  if (typeof window === "undefined") return;
  if (!tenantId) return;
  localStorage.setItem(ACTIVE_TENANT_KEY, String(tenantId).trim());
}

export function clearActiveTenantId() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACTIVE_TENANT_KEY);
}

/**
 * Optional: read role from stored user/auth objects
 * We only need SUPERADMIN detection to decide attaching x-tenant-id.
 */
function getStoredUserRole() {
  if (typeof window === "undefined") return null;

  const tryParse = (raw) => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  for (const k of userKeys) {
    const raw = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (!raw) continue;

    const obj = tryParse(raw);
    const role = obj?.role || obj?.user?.role || obj?.data?.user?.role;
    if (role) return String(role);
  }

  return null;
}

function normalizeRole(raw) {
  const up = String(raw || "")
    .trim()
    .toUpperCase();
  return up === "SUPER_ADMIN" ? "SUPERADMIN" : up;
}

function isAdminModulePath(urlOrPath) {
  const p = String(urlOrPath || "");
  // axios config.url is usually relative like "/api/admin/..."
  return p.startsWith("/api/admin/") && !p.startsWith("/api/admin/system/");
}

function attachInterceptors(client) {
  client.interceptors.request.use(
    (config) => {
      const token = getAuthToken();

      config.headers = config.headers || {};

      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // ✅ SUPERADMIN: auto-attach x-tenant-id for admin-module endpoints
      // This prevents 400 "Missing tenantId" for endpoints under /api/admin/*
      const role = normalizeRole(getStoredUserRole());
      const activeTenantId = getActiveTenantId();

      if (
        role === "SUPERADMIN" &&
        activeTenantId &&
        isAdminModulePath(config.url)
      ) {
        if (!config.headers["x-tenant-id"] && !config.headers["X-Tenant-Id"]) {
          config.headers["x-tenant-id"] = activeTenantId;
        }
      }

      return config;
    },
    (error) => Promise.reject(error),
  );

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status;
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "";

      const token = getAuthToken();
      const looksLikeInvalidToken =
        typeof msg === "string" &&
        /invalid token|jwt expired|token expired|unauthorized/i.test(msg);

      if (status === 401 && token && looksLikeInvalidToken) {
        clearAuthToken();
      }

      return Promise.reject(error);
    },
  );

  return client;
}

export const apiClient = attachInterceptors(
  axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    timeout: 25000,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  }),
);

export const aiClient = attachInterceptors(
  axios.create({
    baseURL: AI_BASE_URL,
    withCredentials: true,
    timeout: 35000,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  }),
);

export const pdfClient = attachInterceptors(
  axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    timeout: 35000,
    headers: {
      Accept: "*/*",
    },
  }),
);

/**
 * Error normalization
 */
export function normalizeApiError(err) {
  const status = err?.response?.status;

  const msg =
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.response?.data?.detail ||
    err?.message ||
    "Request failed";

  return status ? `${status}: ${msg}` : msg;
}
