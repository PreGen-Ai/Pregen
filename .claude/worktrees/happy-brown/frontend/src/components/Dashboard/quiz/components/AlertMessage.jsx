import { useEffect, useState } from "react";
import "./AlertMessage.css";

/**
 * AlertMessage Component
 * - Displays contextual alerts with animations, icons, and auto-dismiss.
 * - Fully safe: handles non-string messages and React hydration edge cases.
 */
const AlertMessage = ({
  message,
  type = "auto",
  duration = 5000,
  onDismiss,
  dismissable = true,
  position = "top",
  showIcon = true,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // ✅ Ensure message is always a string
  // ✅ Ensure message is always a valid string that actually means something
  const normalizeMessage = (msg) => {
    // null / undefined
    if (msg == null) return "";

    // Already string → OK
    if (typeof msg === "string") return msg.trim();

    // If object contains a `.message` → use it
    if (typeof msg === "object" && msg.message) {
      return String(msg.message).trim();
    }

    // ❌ Prevent objects like { topic: "Trig" } from producing alerts
    return "";
  };

  const safeMessage = normalizeMessage(message);

  // ✅ Determine alert type based on message or explicit type
  const getAlertType = () => {
    if (type !== "auto") return type;
    if (!safeMessage) return "info";

    const lowerMsg = safeMessage.toLowerCase();

    if (lowerMsg.includes("❌") || lowerMsg.includes("error")) return "error";
    if (lowerMsg.includes("✅") || lowerMsg.includes("success"))
      return "success";
    if (lowerMsg.includes("⚠️") || lowerMsg.includes("warn")) return "warning";
    if (
      lowerMsg.includes("⏳") ||
      lowerMsg.includes("load") ||
      lowerMsg.includes("process")
    )
      return "loading";
    if (lowerMsg.includes("🔍") || lowerMsg.includes("info")) return "info";

    return "info";
  };

  const alertType = getAlertType();

  // ✅ Handle visibility & auto-dismiss lifecycle
  useEffect(() => {
    if (safeMessage) {
      setIsVisible(true);
      setIsExiting(false);

      if (duration > 0) {
        const timer = setTimeout(() => handleDismiss(), duration);
        return () => clearTimeout(timer);
      }
    } else {
      handleDismiss();
    }
  }, [safeMessage, duration]);

  const handleDismiss = () => {
    if (!isExiting) {
      setIsExiting(true);
      setTimeout(() => {
        setIsVisible(false);
        onDismiss?.();
      }, 300); // Match CSS transition timing
    }
  };

  if (!safeMessage && !isVisible) return null;

  // ✅ Icon based on type
  const getIcon = () => {
    switch (alertType) {
      case "success":
        return "✅";
      case "error":
        return "❌";
      case "warning":
        return "⚠️";
      case "loading":
        return "⏳";
      case "info":
      default:
        return "ℹ️";
    }
  };

  // ✅ Progress bar color
  const getProgressColor = () => {
    switch (alertType) {
      case "success":
        return "#10b981";
      case "error":
        return "#ef4444";
      case "warning":
        return "#f59e0b";
      case "loading":
        return "#3b82f6";
      case "info":
      default:
        return "#6b7280";
    }
  };

  return (
    <div className={`alert-container alert-position-${position}`}>
      <div
        className={`alert-message alert-${alertType} ${
          isVisible ? "alert-enter" : ""
        } ${isExiting ? "alert-exit" : ""}`}
        role="alert"
        aria-live="polite"
      >
        <div className="alert-content">
          {showIcon && <div className="alert-icon">{getIcon()}</div>}

          {/* ✅ Always render safeMessage */}
          <div className="alert-text">
            {typeof message === "string"
              ? message
              : JSON.stringify(message, null, 2)}
          </div>

          {dismissable && (
            <button
              className="alert-close-btn"
              onClick={handleDismiss}
              aria-label="Dismiss alert"
            >
              ×
            </button>
          )}
        </div>

        {/* Animated progress bar */}
        {duration > 0 && (
          <div
            className="alert-progress-bar"
            style={{
              "--progress-color": getProgressColor(),
              animationDuration: `${duration}ms`,
            }}
          />
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 🔹 Alert Stack
// ============================================================================
export const AlertStack = ({
  alerts,
  maxAlerts = 3,
  position = "top-right",
}) => (
  <div className={`alert-stack-container alert-stack-${position}`}>
    {alerts.slice(0, maxAlerts).map((alert, index) => (
      <AlertMessage
        key={alert.id || index}
        message={alert.message}
        type={alert.type}
        duration={alert.duration}
        onDismiss={alert.onDismiss}
        dismissable={alert.dismissable}
        position="static"
        showIcon={alert.showIcon}
      />
    ))}
  </div>
);

// ============================================================================
// 🔹 useAlertManager Hook
// ============================================================================
export const useAlertManager = () => {
  const [alerts, setAlerts] = useState([]);

  const removeAlert = (id) =>
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));

  const addAlert = (alert) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newAlert = {
      id,
      duration: 5000,
      dismissable: true,
      showIcon: true,
      ...alert,
    };

    setAlerts((prev) => [...prev, newAlert]);

    if (newAlert.duration > 0) {
      setTimeout(() => removeAlert(id), newAlert.duration);
    }

    return id;
  };

  const clearAlerts = () => setAlerts([]);

  const make =
    (type) =>
    (msg, options = {}) =>
      addAlert({ message: msg, type, ...options });

  return {
    alerts,
    addAlert,
    removeAlert,
    clearAlerts,
    success: make("success"),
    error: make("error"),
    warning: make("warning"),
    info: make("info"),
    loading: make("loading"),
  };
};

export default AlertMessage;
