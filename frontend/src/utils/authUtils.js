// src/utils/authUtils.js

/**
 * authUtils
 * -------------------------------------------------------------
 * Utility functions for managing authentication state,
 * including token handling, validation, and session persistence.
 * -------------------------------------------------------------
 */

// ==================== TOKEN HELPERS ====================

/**
 * Get the stored JWT token (from localStorage or sessionStorage)
 * -----------------------------------------------------
 * @returns {string|null} - The stored token or null
 */
export const getJwtToken = () => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token") || sessionStorage.getItem("token");
};

/**
 * Set a new JWT token
 * -----------------------------------------------------
 * @param {string} token - JWT token string
 * @param {boolean} rememberMe - Whether to store in localStorage
 */
export const setAuthToken = (token, rememberMe = false) => {
  if (typeof window === "undefined") return;
  if (rememberMe) {
    localStorage.setItem("token", token);
  } else {
    sessionStorage.setItem("token", token);
  }
};

/**
 * Remove any stored JWT token (logout)
 * -----------------------------------------------------
 */
export const clearAuthToken = () => {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  sessionStorage.removeItem("token");
};

/**
 * Decode a JWT token safely (without validation)
 * -----------------------------------------------------
 * @param {string} token - The JWT token
 * @returns {object|null} - Decoded payload or null
 */
export const decodeJwt = (token) => {
  try {
    const payloadBase64 = token.split(".")[1];
    const payload = atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(payload);
  } catch (error) {
    console.error("Error decoding JWT:", error);
    return null;
  }
};

// ==================== AUTH VALIDATION ====================

/**
 * Check if a token exists and is still valid
 * -----------------------------------------------------
 * @returns {boolean} - True if token exists and not expired
 */
export const isUserAuthenticated = () => {
  const token = getJwtToken();
  if (!token) return false;

  const payload = decodeJwt(token);
  if (!payload || !payload.exp) return false;

  const isExpired = Date.now() >= payload.exp * 1000;
  if (isExpired) {
    console.warn("JWT expired — clearing storage.");
    clearAuthToken();
    return false;
  }

  return true;
};

/**
 * Get current logged-in user data from JWT
 * -----------------------------------------------------
 * @returns {object|null} - { userId, email, role, ... } or null
 */
export const getUserFromToken = () => {
  const token = getJwtToken();
  if (!token) return null;
  const payload = decodeJwt(token);
  return payload || null;
};

// ==================== SESSION HELPERS ====================

/**
 * Refresh session token (if supported by backend)
 * -----------------------------------------------------
 * Optionally used for silent refresh before expiration.
 * @param {Function} refreshApi - Function that returns a new token
 */
export const refreshSessionToken = async (refreshApi) => {
  try {
    const token = getJwtToken();
    if (!token) return null;

    const decoded = decodeJwt(token);
    const now = Date.now() / 1000;
    const timeLeft = decoded.exp - now;

    // Refresh if token will expire in the next 5 minutes
    if (timeLeft < 300) {
      const response = await refreshApi();
      if (response?.token) {
        setAuthToken(response.token, true);
        return response.token;
      }
    }
    return token;
  } catch (error) {
    console.error("Error refreshing session token:", error);
    return null;
  }
};

// ==================== REDIRECTION HELPERS ====================

/**
 * Redirect user to login page (and clear tokens)
 * -----------------------------------------------------
 */
export const redirectToLogin = () => {
  clearAuthToken();
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
};

/**
 * Redirect user to dashboard after login
 * -----------------------------------------------------
 */
export const redirectToDashboard = () => {
  if (typeof window !== "undefined") {
    window.location.href = "/dashboard";
  }
};


/**
 * 🔹 Universal User ID Resolver
 * Works for student, teacher, and admin.
 */
export const getUserIdentifier = (user) => {
  if (!user) return null;

  const role = user.role?.toLowerCase();

  // 🎓 Student
  if (role === "student" && user.student_id) return user.student_id;

  // 🧑‍🏫 Teacher
  if (role === "teacher" && user.user_id) return user.user_id;

  // 👑 Admin
  if (role === "admin" && user.user_id) return user.user_id;

  // 🧩 Fallback (legacy)
  return user._id || user.id || null;
};
