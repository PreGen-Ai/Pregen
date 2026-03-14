// utils/errorHandler.js
// ------------------------------------------------------------
// MODEL-A CLEAN VERSION — Consistent with FastAPI + Axios + Gemini backend
// ------------------------------------------------------------

/**
 * Custom API Error class (frontend-safe)
 */
export class ApiError extends Error {
  constructor(message, code = "UNKNOWN_ERROR", details = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Extract safe message from backend response
 */
const extractBackendMessage = (data) => {
  if (!data) return null;
  return (
    data.detail ||
    data.message ||
    data.error ||
    data.msg ||
    (typeof data === "string" ? data : null)
  );
};

/**
 * Comprehensive API error handler (Axios + Gemini + custom errors)
 */
export const handleApiError = (error, context = "API call") => {
  console.error(`❌ Error in ${context}:`, error);

  // ------------------------------------------------------------
  // 🔵 AXIOS ERROR (network / API)
  // ------------------------------------------------------------
  if (error.isAxiosError || error?.response) {
    const status = error.response?.status ?? null;
    const data = error.response?.data ?? null;
    const backendMessage = extractBackendMessage(data);

    switch (status) {
      case 400:
        return new ApiError(
          backendMessage || "Invalid input data",
          "VALIDATION_ERROR",
          data?.errors || data
        );

      case 401:
        return new ApiError("You must be logged in to continue", "AUTH_ERROR");

      case 403:
        return new ApiError(
          "You don't have permission to perform this action",
          "PERMISSION_ERROR"
        );

      case 404:
        return new ApiError(
          backendMessage || "Requested resource not found",
          "NOT_FOUND"
        );

      case 429:
        return new ApiError(
          "Too many requests — please slow down",
          "RATE_LIMIT"
        );

      case 500:
        return new ApiError(
          backendMessage || "Server encountered an error",
          "SERVER_ERROR"
        );

      case 502:
      case 503:
      case 504:
        return new ApiError(
          backendMessage ||
            "The service is temporarily unavailable — try again later",
          "SERVICE_UNAVAILABLE"
        );

      default:
        return new ApiError(
          backendMessage || `Network error: ${error.message}`,
          "NETWORK_ERROR"
        );
    }
  }

  // ------------------------------------------------------------
  // 🔶 CUSTOM ApiError
  // ------------------------------------------------------------
  if (error instanceof ApiError) return error;

  // ------------------------------------------------------------
  // 🔴 STANDARD JS ERROR
  // ------------------------------------------------------------
  if (error instanceof Error) {
    return new ApiError(error.message, "CLIENT_ERROR", {
      originalError: error.name,
    });
  }

  // ------------------------------------------------------------
  // ⚫ UNKNOWN ERROR TYPE
  // ------------------------------------------------------------
  return new ApiError(
    `An unexpected error occurred during ${context}`,
    "UNKNOWN_ERROR",
    { originalError: String(error) }
  );
};

/**
 * Check if error is recoverable (for auto-retry)
 */
export const isRecoverableError = (error) => {
  if (!(error instanceof ApiError)) return false;

  const recoverableCodes = [
    "NETWORK_ERROR",
    "SERVER_ERROR",
    "SERVICE_UNAVAILABLE",
    "RATE_LIMIT",
  ];

  return recoverableCodes.includes(error.code);
};

/**
 * Return a user-friendly message for UI
 */
export const getUserFriendlyError = (error) => {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Something went wrong — please try again.";
};
