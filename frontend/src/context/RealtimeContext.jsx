import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "react-toastify";

import { useAuthContext } from "./AuthContext";
import { getAuthToken } from "../services/api/http";
import {
  createRealtimeSocket,
  REALTIME_EVENT_NAMES,
  updateRealtimeSocketAuth,
} from "../services/realtime/socket";

const RealtimeContext = createContext(null);

function normalizeRealtimeEvent(eventName, payload = {}) {
  const typeFromEvent = String(eventName || "").split(":")[0] || "operation";
  const statusFromEvent = String(eventName || "").split(":")[1] || "updated";

  return {
    ...payload,
    event: payload?.event || eventName,
    type: payload?.type || typeFromEvent,
    status: payload?.status || statusFromEvent,
    message: payload?.message || "",
    timestamp: payload?.timestamp || new Date().toISOString(),
  };
}

function pushBoundedObject(prev, key, value, limit = 100) {
  const next = { ...prev, [key]: value };
  const keys = Object.keys(next);
  if (keys.length <= limit) return next;

  delete next[keys[0]];
  return next;
}

function getToastVariant(event) {
  if (event?.severity === "error" || event?.status === "failed") return "error";
  if (event?.severity === "success" || event?.status === "success") return "success";
  if (event?.severity === "warning") return "warning";
  return "info";
}

function showNotificationToast(event) {
  if (!event?.message) return;

  const toastId = event.notificationId || event.requestId || `${event.event}-${event.timestamp}`;
  const variant = getToastVariant(event);

  if (variant === "error") {
    toast.error(event.message, { toastId });
    return;
  }

  if (variant === "success") {
    toast.success(event.message, { toastId });
    return;
  }

  if (variant === "warning") {
    toast.warn(event.message, { toastId });
    return;
  }

  toast.info(event.message, { toastId });
}

export function RealtimeProvider({ children }) {
  const { isAuthenticated } = useAuthContext();
  const token = getAuthToken();

  const socketRef = useRef(null);
  const listenersRef = useRef(new Set());
  const seenNotificationsRef = useRef(new Set());
  const fallbackToastShownRef = useRef(false);

  const [connectionState, setConnectionState] = useState("idle");
  const [lastEvent, setLastEvent] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [operations, setOperations] = useState({});

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      setConnectionState("idle");
      return undefined;
    }

    const socket = socketRef.current || createRealtimeSocket(token);
    socketRef.current = socket;
    updateRealtimeSocketAuth(socket, token);

    const handleConnect = () => {
      setConnectionState("connected");

      if (fallbackToastShownRef.current) {
        toast.dismiss("realtime-fallback");
        toast.success("Live updates restored.", {
          toastId: "realtime-restored",
        });
        fallbackToastShownRef.current = false;
      }

      socket.emit("rooms:refresh", () => {});
    };

    const handleDisconnect = (reason) => {
      setConnectionState(
        reason === "io client disconnect" ? "idle" : "disconnected",
      );
    };

    const handleConnectError = () => {
      setConnectionState("degraded");

      if (!fallbackToastShownRef.current) {
        toast.warn(
          "Live updates are unavailable right now. The dashboard will fall back to periodic refresh.",
          {
            toastId: "realtime-fallback",
            autoClose: 4000,
          },
        );
        fallbackToastShownRef.current = true;
      }
    };

    const dispatchRealtimeEvent = (eventName, payload) => {
      const event = normalizeRealtimeEvent(eventName, payload);
      setLastEvent(event);

      if (event.requestId) {
        setOperations((prev) => pushBoundedObject(prev, event.requestId, event));
      }

      if (eventName === "notification:new") {
        const notificationId = event.notificationId || event.requestId;

        if (notificationId && seenNotificationsRef.current.has(notificationId)) {
          return;
        }

        if (notificationId) {
          seenNotificationsRef.current.add(notificationId);
        }

        setNotifications((prev) => [event, ...prev].slice(0, 50));
        showNotificationToast(event);
      }

      if (eventName === "socket:error" && event.message) {
        toast.error(event.message, { toastId: "realtime-socket-error" });
      }

      listenersRef.current.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error("Realtime listener failed:", error);
        }
      });
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    for (const eventName of REALTIME_EVENT_NAMES) {
      socket.on(eventName, (payload) => dispatchRealtimeEvent(eventName, payload));
    }

    if (!socket.connected) {
      setConnectionState("connecting");
      socket.connect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);

      for (const eventName of REALTIME_EVENT_NAMES) {
        socket.off(eventName);
      }

      socket.disconnect();
    };
  }, [isAuthenticated, token]);

  const subscribe = useCallback((listener) => {
    listenersRef.current.add(listener);

    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const refreshRooms = useCallback(() => {
    socketRef.current?.emit("rooms:refresh", () => {});
  }, []);

  return (
    <RealtimeContext.Provider
      value={{
        connectionState,
        isConnected: connectionState === "connected",
        lastEvent,
        notifications,
        operations,
        subscribe,
        refreshRooms,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
