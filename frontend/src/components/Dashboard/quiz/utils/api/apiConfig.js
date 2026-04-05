import axios from "axios";

const isLocal = window.location.hostname === "localhost";

export const NODE_API_BASE = isLocal
  ? "http://localhost:4000"
  : "https://pregen.onrender.com";

const generateRequestId = () =>
  `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

function rewriteToNodeBridge(url = "") {
  const value = String(url || "");

  if (!value.startsWith("/api/")) return value;

  const mappings = [
    [/^\/api\/quiz\b/, "/api/ai/quiz"],
    [/^\/api\/grade-quiz\b/, "/api/ai/grade-quiz"],
    [/^\/api\/grade-question\b/, "/api/ai/grade-question"],
    [/^\/api\/grade\/health\b/, "/api/ai/grade/health"],
    [/^\/api\/assignments\b/, "/api/ai/assignments"],
    [/^\/api\/learning\b/, "/api/ai/learning"],
    [/^\/api\/reports\b/, "/api/ai/reports"],
    [/^\/api\/download-report\b/, "/api/ai/reports/pdf"],
    [/^\/api\/report\b/, "/api/ai/reports/json"],
  ];

  for (const [pattern, replacement] of mappings) {
    if (pattern.test(value)) {
      return value.replace(pattern, replacement);
    }
  }

  return value;
}

const api = axios.create({
  baseURL: NODE_API_BASE,
  withCredentials: true,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("authToken");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    config.url = rewriteToNodeBridge(config.url);
    config.headers["X-Request-ID"] = generateRequestId();

    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const msg =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      "";

    if (
      status === 401 &&
      /invalid token|jwt expired|token expired|unauthorized/i.test(msg)
    ) {
      localStorage.removeItem("authToken");
      window.location.href = "/login";
    }

    return Promise.reject(error);
  },
);

export default api;
