/**
 * backend/src/middleware/rateLimiters.js
 *
 * Centralised rate-limit definitions for the LMS.
 * Uses express-rate-limit (already a dependency).
 *
 * Limiters:
 *   loginRateLimiter         — brute-force protection on auth routes
 *   aiGenerationRateLimiter  — per-user throttle for AI quiz/assignment generation
 *   aiGradingRateLimiter     — per-user throttle for AI grading calls
 *   aiGeneralRateLimiter     — broader throttle for all AI routes
 *
 * All responses use a safe, user-friendly message — no internal details.
 */

import rateLimit from "express-rate-limit";

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD  = NODE_ENV === "production";

// Key generator: tenant + user so multi-tenant users don't share buckets
function tenantUserKey(req) {
  const tenantId = req.user?.schoolId || req.user?.tenantId || "global";
  const userId   = req.user?._id || req.user?.id || req.ip || "anon";
  return `${tenantId}:${userId}`;
}

// ------------------------------------------------------------------
// Login rate limiter — applied at the auth route level
// ------------------------------------------------------------------
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: IS_PROD ? 10 : 50,    // 10 attempts per 15min in prod, 50 in dev
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || "unknown",
  message: {
    success: false,
    message: "Too many login attempts. Please wait 15 minutes before trying again.",
    code: "RATE_LIMIT_LOGIN",
  },
  skip: () => !IS_PROD && process.env.DISABLE_RATE_LIMIT === "true",
});

// ------------------------------------------------------------------
// AI quiz/assignment generation limiter (expensive LLM calls)
// ------------------------------------------------------------------
export const aiGenerationRateLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1-minute window
  max: IS_PROD ? 5 : 20,      // 5 generations per minute per user in prod
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: tenantUserKey,
  message: {
    success: false,
    message: "You are generating content too quickly. Please wait a moment and try again.",
    code: "RATE_LIMIT_AI_GENERATION",
    retryAfterSeconds: 60,
  },
  skip: (req) => {
    // Superadmin bypass (for testing)
    if (req.user?.role === "SUPERADMIN" && !IS_PROD) return true;
    if (process.env.DISABLE_RATE_LIMIT === "true") return true;
    return false;
  },
});

// ------------------------------------------------------------------
// AI grading limiter (bulk grading can be expensive)
// ------------------------------------------------------------------
export const aiGradingRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: IS_PROD ? 20 : 100,    // 20 grading calls per minute per user in prod
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: tenantUserKey,
  message: {
    success: false,
    message: "Grading requests are being throttled. Please try again in a moment.",
    code: "RATE_LIMIT_AI_GRADING",
    retryAfterSeconds: 60,
  },
  skip: () => process.env.DISABLE_RATE_LIMIT === "true",
});

// ------------------------------------------------------------------
// General AI route limiter (all /api/ai/* requests)
// ------------------------------------------------------------------
export const aiGeneralRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: IS_PROD ? 60 : 300,    // 60 AI requests per minute per user in prod
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: tenantUserKey,
  message: {
    success: false,
    message: "AI service request limit reached. Please slow down and try again shortly.",
    code: "RATE_LIMIT_AI_GENERAL",
    retryAfterSeconds: 60,
  },
  skip: () => process.env.DISABLE_RATE_LIMIT === "true",
});
