// src/utils/errorHandler.js
import { toast } from "react-hot-toast";
import { useCallback } from "react";

/**
 * useErrorHandler (React Hook)
 * -------------------------------------------------------------
 * Provides a reusable error handling function for contexts and components.
 * Automatically extracts messages from API responses, logs useful info,
 * and shows user-friendly toast notifications.
 * -------------------------------------------------------------
 */
export const useErrorHandler = () => {
  const handleError = useCallback(
    (error, defaultMessage = "Something went wrong.", context = {}) => {
      // Log full error details for developers
      console.error("🔴 Error Handler Triggered:", {
        message: error?.message,
        url: error?.config?.url,
        method: error?.config?.method,
        status: error?.response?.status,
        data: error?.response?.data,
        context,
      });

      // Extract API message or fallback
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        defaultMessage;

      // Decide user-facing toast message
      if (error?.response?.status >= 500) {
        toast.error("Server error. Please try again later.");
      } else if (error?.response?.status === 404) {
        toast.error("Requested resource not found.");
      } else if (error?.response?.status === 401) {
        toast.error("Session expired. Please log in again.");
      } else if (error?.response?.status === 403) {
        toast.error("You don’t have permission to perform this action.");
      } else if (error?.code === "ERR_NETWORK") {
        toast.error("Network error — please check your connection.");
      } else {
        toast.error(message);
      }
    },
    []
  );

  return { handleError };
};

/**
 * handleError (Standalone Function)
 * -------------------------------------------------------------
 * Non-hook version for use outside of React components,
 * such as utility functions or plain services.
 * -------------------------------------------------------------
 */
export const handleError = (
  error,
  defaultMessage = "Something went wrong.",
  context = {}
) => {
  console.error("🔴 Error Handler Triggered:", {
    message: error?.message,
    url: error?.config?.url,
    method: error?.config?.method,
    status: error?.response?.status,
    data: error?.response?.data,
    context,
  });

  const message =
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    defaultMessage;

  if (error?.response?.status >= 500) {
    toast.error("Server error. Please try again later.");
  } else if (error?.response?.status === 404) {
    toast.error("Requested resource not found.");
  } else if (error?.response?.status === 401) {
    toast.error("Session expired. Please log in again.");
  } else if (error?.response?.status === 403) {
    toast.error("You don’t have permission to perform this action.");
  } else if (error?.code === "ERR_NETWORK") {
    toast.error("Network error — please check your connection.");
  } else {
    toast.error(message);
  }
};
