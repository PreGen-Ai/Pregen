// backend/src/middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/userModel.js";
import Course from "../models/CourseModel.js";

dotenv.config();

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

const NODE_ENV = process.env.NODE_ENV || "development";
const isDev = String(NODE_ENV).toLowerCase() === "development";

export const JWT_SECRET = requireEnv("JWT_SECRET");
export const REFRESH_TOKEN_EXPIRES_IN =
  process.env.REFRESH_TOKEN_EXPIRES_IN || "30d";

/**
 * Canonical roles for this backend (matches your DB enum):
 * STUDENT, TEACHER, ADMIN, SUPERADMIN, PARENT
 */
export function normalizeRole(role) {
  if (!role) return "";
  const raw = String(role).trim();
  const up = raw.toUpperCase();

  // Accept legacy / inconsistent formats
  if (up === "SUPER_ADMIN") return "SUPERADMIN";
  if (up === "SUPER-ADMIN") return "SUPERADMIN";
  if (up === "SUPERADMIN") return "SUPERADMIN";

  return up; // STUDENT, TEACHER, ADMIN, PARENT, etc
}

export function extractBearerToken(value) {
  const h = String(value || "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export function extractBearer(req) {
  return extractBearerToken(req.get("Authorization"));
}

export function extractToken(req) {
  return extractBearer(req) || req.cookies?.token || null;
}

function extractSessionUserId(req) {
  return req.session?.user?.id || req.session?.userId || null;
}

function attachUser(req, user, token) {
  const role = normalizeRole(user?.role);

  req.user = user;
  req.userRole = role;

  // ensure downstream code sees the normalized role
  if (req.user) req.user.role = role;
  if (token) req.token = token;
}

export function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function resolveUserIdFromToken(token) {
  const decoded = verifyAccessToken(token);
  return decoded.id || decoded._id || decoded.userId || decoded.sub || null;
}

export async function getAuthenticatedUserById(userId) {
  return User.findById(userId).select("-password");
}

/**
 * requireAuth
 * - accepts Bearer token OR cookie token OR session (fallback)
 * - in dev only: x-user-id header fallback if nothing else
 */
export async function requireAuth(req, res, next) {
  try {
    const bearer = extractBearer(req);
    const cookieToken = req.cookies?.token || null;
    const token = extractToken(req);

    let userId = null;

    if (token) {
      userId = resolveUserIdFromToken(token);
      req.token = token;
    } else {
      userId = extractSessionUserId(req);

      if (!userId && isDev) {
        const devId = req.headers["x-user-id"];
        if (devId) userId = String(devId);
      }
    }

    if (isDev) {
      console.log("AUTH DEBUG", {
        hasBearer: !!bearer,
        hasCookieToken: !!cookieToken,
        hasSessionUserId: !!(req.session?.userId || req.session?.user?.id),
      });
    }

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const user = await getAuthenticatedUserById(userId);
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "User not found" });
    }

    if (user.disabled) {
      return res
        .status(401)
        .json({ success: false, message: "Account disabled" });
    }

    if (user.blocked) {
      return res
        .status(401)
        .json({ success: false, message: "Account blocked" });
    }

    attachUser(req, user, token);
    return next();
  } catch (err) {
    const message =
      err?.name === "TokenExpiredError"
        ? "Session expired. Please login again."
        : "Invalid or missing authentication token.";

    if (isDev) console.error("AUTH VERIFY FAILED", err?.message || err);

    return res.status(401).json({
      success: false,
      message,
      ...(isDev ? { error: err?.message } : {}),
    });
  }
}

/**
 * requireRole(...roles)
 * - roles should be canonical values: "STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"
 * - legacy strings still okay ("super_admin", "SuperAdmin") because we normalize
 */
export function requireRole(...roles) {
  const allow = roles.map((r) => normalizeRole(r));
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ success: false, message: "Authentication required" });
    }

    const role = normalizeRole(req.userRole || req.user.role);

    if (!allow.includes(role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${allow.join(", ")}`,
        yourRole: role,
      });
    }

    return next();
  };
}

export const authorizeRoles = (...roles) => requireRole(...roles);

/**
 * Clean named guards (use these in routes)
 */
export const requireStudent = [requireAuth, requireRole("STUDENT")];

export const requireTeacher = [
  requireAuth,
  requireRole("TEACHER", "ADMIN", "SUPERADMIN"),
];

export const requireAdmin = [requireAuth, requireRole("ADMIN", "SUPERADMIN")];

export const requireSuperAdmin = [requireAuth, requireRole("SUPERADMIN")];

export const requireParent = [requireAuth, requireRole("PARENT")];

/**
 * Course guards
 */
export const courseAdminAuth = [
  requireAuth,
  requireRole("ADMIN", "TEACHER", "SUPERADMIN"),
];

export const courseOwnerAuth = async (req, res, next) => {
  const { courseId } = req.params;

  if (!req.user) {
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated" });
  }

  const role = normalizeRole(req.userRole || req.user.role);
  if (role === "ADMIN" || role === "SUPERADMIN") return next();

  try {
    const course = await Course.findById(courseId);
    if (!course) {
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    if (String(course.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: isDev ? error?.message : undefined,
    });
  }
};

/**
 * Tenant helper
 * Resolution order:
 * 1. req.tenantId (set by prior middleware)
 * 2. x-tenant-id header (superadmin cross-tenant override)
 * 3. req.user.tenantId / req.user.orgId
 */
export function getTenantId(req) {
  return (
    req.tenantId ||
    (req.get ? req.get("x-tenant-id") : null) ||
    req.user?.tenantId ||
    req.user?.orgId ||
    null
  );
}

/**
 * Backwards-compat alias used in routes
 */
export const auth = requireAuth;
