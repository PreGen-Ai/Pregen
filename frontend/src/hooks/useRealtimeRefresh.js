import { useEffect, useRef } from "react";

import { useRealtime } from "../context/RealtimeContext";

export default function useRealtimeRefresh(
  refresh,
  {
    enabled = true,
    pollMs = 30000,
    shouldRefresh,
  } = {},
) {
  const { isConnected, subscribe } = useRealtime() || {};
  const refreshRef = useRef(refresh);
  const predicateRef = useRef(shouldRefresh);

  refreshRef.current = refresh;
  predicateRef.current = shouldRefresh;

  useEffect(() => {
    if (!enabled || typeof subscribe !== "function") return undefined;

    return subscribe((event) => {
      if (typeof predicateRef.current === "function" && !predicateRef.current(event)) {
        return;
      }

      Promise.resolve(refreshRef.current?.()).catch(() => {});
    });
  }, [enabled, subscribe]);

  useEffect(() => {
    if (!enabled || isConnected || !pollMs) return undefined;

    const intervalId = setInterval(() => {
      Promise.resolve(refreshRef.current?.()).catch(() => {});
    }, pollMs);

    return () => clearInterval(intervalId);
  }, [enabled, isConnected, pollMs]);
}
