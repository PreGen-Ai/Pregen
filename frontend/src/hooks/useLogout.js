// ✅ useLogout.js — Unified with AuthContext.js
import { useCallback } from "react";
import { useAuthContext } from "../context/AuthContext";
import axios from "axios";

// 🌍 Match same base URL logic as AuthContext
const API_BASE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : window.location.hostname.includes("preprod")
    ? "https://pregen.onrender.com"
    : "https://pregen.onrender.com";

// 🧩 Local Axios instance (in case AuthContext.api fails)
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export const useLogout = () => {
  const { logout: contextLogout, dispatch } = useAuthContext();

  const logout = useCallback(async () => {
    try {
      // ✅ 1. Attempt backend logout
      await api.post("/api/users/logout").catch(() => {});

      // ✅ 2. Use centralized logout handler from AuthContext
      await contextLogout();

      // ✅ 3. Remove stale headers globally (extra safety)
      delete axios.defaults.headers.common["Authorization"];
      delete api.defaults.headers.common["Authorization"];

      console.info("✅ User logged out successfully (context + API sync)");
    } catch (error) {
      console.error("Logout error:", error.response?.data || error.message);

      // 🔄 Fallback to manual dispatch if context fails
      dispatch({ type: "LOGOUT_SUCCESS" });
    }
  }, [contextLogout, dispatch]);

  return { logout };
};
