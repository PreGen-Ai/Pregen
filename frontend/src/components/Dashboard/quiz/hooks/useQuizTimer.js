// hooks/useQuizTimer.js
import { useState, useEffect, useRef, useCallback } from "react";

export const useQuizTimer = () => {
  const [timeSpent, setTimeSpent] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef(null);

  const startTimer = useCallback((initialTime = 0) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setTimeSpent(initialTime);
    setIsTimerRunning(true);

    timerRef.current = setInterval(() => {
      setTimeSpent((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsTimerRunning(false);
  }, []);

  const resetTimer = useCallback(() => {
    stopTimer();
    setTimeSpent(0);
  }, [stopTimer]);

  const formatTime = useCallback(
    (seconds = timeSpent) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;

      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
          .toString()
          .padStart(2, "0")}`;
      }
      return `${minutes}:${secs.toString().padStart(2, "0")}`;
    },
    [timeSpent]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return {
    timeSpent,
    isTimerRunning,
    startTimer,
    stopTimer,
    resetTimer,
    formatTime,
  };
};
