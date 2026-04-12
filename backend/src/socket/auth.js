import { getAccessibleCourseIdsForUser } from "../utils/academicContract.js";
import {
  getAccessibleClassroomIdsForUser,
  toId,
} from "../utils/academicContract.js";
import {
  normalizeRole,
  verifyAccessToken,
} from "../middleware/authMiddleware.js";
import User from "../models/userModel.js";

function parseCookieHeader(cookieHeader = "") {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const [rawKey, ...rawValue] = part.split("=");
      const key = String(rawKey || "").trim();
      if (!key) return acc;
      acc[key] = decodeURIComponent(rawValue.join("=").trim());
      return acc;
    }, {});
}

function extractTokenValue(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : value;
}

function resolveSocketToken(socket) {
  const auth = socket.handshake?.auth || {};
  const headers = socket.handshake?.headers || {};
  const query = socket.handshake?.query || {};
  const cookies = parseCookieHeader(headers.cookie);

  return (
    extractTokenValue(auth.token) ||
    extractTokenValue(auth.accessToken) ||
    extractTokenValue(auth.jwt) ||
    extractTokenValue(headers.authorization) ||
    extractTokenValue(query.token) ||
    extractTokenValue(cookies.token) ||
    null
  );
}

async function loadSocketAudience({ userId, role, tenantId }) {
  const canJoinScopedRooms = ["STUDENT", "TEACHER"].includes(role);

  const [courseIds, classroomIds] = await Promise.all([
    getAccessibleCourseIdsForUser({
      userId,
      tenantId,
      includeOwned: true,
    }),
    canJoinScopedRooms
      ? getAccessibleClassroomIdsForUser({
          userId,
          tenantId,
          role,
        })
      : Promise.resolve([]),
  ]);

  return { courseIds, classroomIds };
}

export async function hydrateSocketAuth(socket) {
  const token = resolveSocketToken(socket);
  if (!token) {
    const error = new Error("Authentication required");
    error.code = "SOCKET_AUTH_REQUIRED";
    throw error;
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (error) {
    const authError = new Error("Invalid or expired authentication token");
    authError.code = error?.name === "TokenExpiredError"
      ? "SOCKET_AUTH_EXPIRED"
      : "SOCKET_AUTH_INVALID";
    throw authError;
  }

  const userId =
    decoded?.id || decoded?._id || decoded?.userId || decoded?.sub || null;

  if (!userId) {
    const error = new Error("Unable to resolve socket user");
    error.code = "SOCKET_AUTH_INVALID";
    throw error;
  }

  const user = await User.findById(userId).select("-password").lean();
  if (!user) {
    const error = new Error("User not found");
    error.code = "SOCKET_USER_NOT_FOUND";
    throw error;
  }

  if (user.disabled || user.blocked) {
    const error = new Error("Account is not allowed to connect");
    error.code = "SOCKET_USER_BLOCKED";
    throw error;
  }

  const role = normalizeRole(user.role);
  const tenantId = user.tenantId || null;
  const audience = await loadSocketAudience({
    userId: user._id,
    role,
    tenantId,
  });

  const authContext = {
    token,
    userId: toId(user._id),
    role,
    tenantId,
    courseIds: audience.courseIds,
    classroomIds: audience.classroomIds,
    user: {
      _id: toId(user._id),
      id: toId(user._id),
      username: user.username || "",
      email: user.email || "",
      role,
      tenantId,
    },
  };

  socket.data.auth = authContext;
  return authContext;
}

export async function authenticateSocket(socket, next) {
  try {
    await hydrateSocketAuth(socket);
    next();
  } catch (error) {
    const authError = new Error(error?.message || "Socket authentication failed");
    authError.data = { code: error?.code || "SOCKET_AUTH_FAILED" };
    next(authError);
  }
}
