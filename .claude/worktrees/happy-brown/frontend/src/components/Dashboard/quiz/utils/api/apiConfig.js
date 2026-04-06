import axios from "axios";

/*───────────────────────────────────────────────────────────
 🌍 ENVIRONMENT
───────────────────────────────────────────────────────────*/
const isLocal = window.location.hostname === "localhost";

export const PYTHON_API_BASE = isLocal
  ? "http://localhost:8000"
  : "https://pregen.onrender.com";

export const NODE_API_BASE = isLocal
  ? "http://localhost:4000"
  : "https://preprod-pregen.onrender.com";

/*───────────────────────────────────────────────────────────
 🔧 BASE URL ROUTER — FIXED (Model-A Safe Routing)
───────────────────────────────────────────────────────────*/
const getBaseURL = (url = "") => {
  if (!url) return PYTHON_API_BASE;

  // Normalize accidental double slashes
  url = url.replace(/\/+/g, "/");

  /*───────────────────────────────────────────────────────────
    PYTHON FASTAPI ROUTES — strict matching
    These MUST go to FastAPI only.
  ───────────────────────────────────────────────────────────*/
  const pythonRoutes = [
    "/api/quiz",
    "/api/grade-quiz",
    "/api/grade-question",
    "/api/grade/health",
    "/api/learning",
    "/api/explanation",
    "/api/assignments",
    "/api/reports", // IMPORTANT: FastAPI reports endpoints
  ];

  if (pythonRoutes.some((p) => url.startsWith(p))) {
    return PYTHON_API_BASE;
  }

  /*───────────────────────────────────────────────────────────
    NODE BACKEND ROUTES — analytics, workspaces, dashboard
  ───────────────────────────────────────────────────────────*/
  const nodeRoutes = [
    "/analytics",
    "/api/analytics", // Support prefixed analytics
    "/workspaces",
    "/documents",
    "/users",
    "/files",
    "/upload",
    "/reports", // Node reports viewer
    "/dashboard",
  ];

  // Match exact AND substring paths like ".../analytics/..."
  if (
    nodeRoutes.some((p) => url.startsWith(p)) ||
    url.includes("/analytics/")
  ) {
    return NODE_API_BASE;
  }

  // Default backend → Python
  return PYTHON_API_BASE;
};

/*───────────────────────────────────────────────────────────
 🆔 REQUEST ID GENERATOR
───────────────────────────────────────────────────────────*/
const generateRequestId = () =>
  `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

/*───────────────────────────────────────────────────────────
 🚀 AXIOS INSTANCE
───────────────────────────────────────────────────────────*/
const api = axios.create({
  baseURL: PYTHON_API_BASE, // default to Python
  withCredentials: true,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

/*───────────────────────────────────────────────────────────
 🔄 REQUEST INTERCEPTOR
───────────────────────────────────────────────────────────*/
api.interceptors.request.use(
  (config) => {
    config.baseURL = getBaseURL(config.url);

    const token = localStorage.getItem("authToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;

    config.headers["X-Request-ID"] = generateRequestId();

    console.log(
      `🔄 [${config.method?.toUpperCase()}] ${config.baseURL}${config.url}`,
      config.params || config.data || ""
    );

    return config;
  },
  (error) => {
    console.error("❌ API Request Intercept Error:", error);
    return Promise.reject(error);
  }
);

/*───────────────────────────────────────────────────────────
 📥 RESPONSE INTERCEPTOR
───────────────────────────────────────────────────────────*/
api.interceptors.response.use(
  (response) => {
    console.log(`✅ ${response.status} → ${response.config.url}`);
    return response;
  },
  (error) => {
    const { response, config } = error;

    console.error("❌ API Response Error:", {
      url: config?.url,
      method: config?.method,
      status: response?.status,
      message: error.message,
    });

    // Auto-logout on expired token
    if (response?.status === 401) {
      console.warn("⚠️ Unauthorized — clearing token");
      localStorage.removeItem("authToken");
      window.location.href = "/login";
    }

    if (!response) {
      console.warn("🌐 Network error — server unreachable.");
    }

    return Promise.reject(error);
  }
);

export default api;
