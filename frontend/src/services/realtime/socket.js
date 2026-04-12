import { io } from "socket.io-client";

const hostname = typeof window !== "undefined" ? window.location.hostname : "";

function getViteEnv() {
  try {
    return Function(
      'try { return import.meta && import.meta.env ? import.meta.env : {}; } catch { return {}; }',
    )();
  } catch {
    return {};
  }
}

const viteEnv = getViteEnv();

const ENV_SOCKET_URL =
  (typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_SOCKET_URL) ||
  viteEnv.VITE_SOCKET_URL ||
  viteEnv.VITE_APP_BACKEND_URL ||
  "";

export const SOCKET_URL =
  ENV_SOCKET_URL ||
  (hostname === "localhost" || hostname === "127.0.0.1"
    ? "http://localhost:4000"
    : "https://pregen.onrender.com");

export const REALTIME_EVENT_NAMES = [
  "socket:ready",
  "socket:error",
  "rooms:refreshed",
  "notification:new",
  "operation:started",
  "operation:success",
  "operation:failed",
  "grading:started",
  "grading:success",
  "grading:failed",
  "quiz_generation:started",
  "quiz_generation:success",
  "quiz_generation:failed",
  "assignment_generation:started",
  "assignment_generation:success",
  "assignment_generation:failed",
  "teacher_review:updated",
  "grade:adjusted",
  "submission:success",
  "submission:failed",
  "assignment_publish:success",
  "quiz_publish:success",
];

function buildSocketAuth(token) {
  if (!token) return {};
  return {
    token: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
  };
}

export function createRealtimeSocket(token) {
  return io(SOCKET_URL, {
    autoConnect: false,
    withCredentials: true,
    transports: ["websocket", "polling"],
    auth: buildSocketAuth(token),
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 10000,
    timeout: 20000,
  });
}

export function updateRealtimeSocketAuth(socket, token) {
  if (!socket) return;
  socket.auth = buildSocketAuth(token);
}
