
import {
  createContext,
  useReducer,
  useEffect,
  useCallback,
  useContext,
  useRef,
} from "react";

// Adjust this path if your context folder is different
import {
  apiClient,
  normalizeApiError,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
} from "../services/api/http";

// Global guard so only one checkAuth runs at a time across StrictMode remounts
let isAuthChecking = false;

const AuthContext = createContext(null);

const initialState = {
  user: null,
  token: null,
  isAuthenticated: false,
  loading: true,
};

function normalizeUser(u) {
  if (!u || typeof u !== "object") return null;
  return {
    ...u,
    role: u.role?.toUpperCase?.() || u.role || "USER",
  };
}

function readStoredUser() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // supports both shapes:
    // { user, token } OR just user
    return parsed?.user
      ? parsed
      : { user: parsed, token: parsed?.token || null };
  } catch {
    return null;
  }
}

function writeStoredUser(payload) {
  try {
    localStorage.setItem("user", JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function clearStoredUser() {
  try {
    localStorage.removeItem("user");
  } catch {
    // ignore
  }
}

function authReducer(state, action) {
  switch (action.type) {
    case "AUTH_START":
      return { ...state, loading: true };

    case "LOGIN_SUCCESS":
    case "USER_LOADED": {
      const token = action.payload?.token ?? state.token ?? null;
      const user =
        normalizeUser(action.payload?.user || action.payload) || null;

      return {
        ...state,
        user,
        token,
        isAuthenticated: !!user,
        loading: false,
      };
    }

    case "LOGOUT_SUCCESS":
    case "AUTH_ERROR":
      return {
        ...state,
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
      };

    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const hasInitialized = useRef(false);
  const pendingLoginRef = useRef(false);

  /**
   * checkAuth
   * - Always calls backend
   * - If you have httpOnly cookie auth, this still works even when token is not readable in JS
   */
  const checkAuth = useCallback(async () => {
    if (isAuthChecking || pendingLoginRef.current) return;
    isAuthChecking = true;

    dispatch({ type: "AUTH_START" });

    try {
      // If token exists in storage, ensure it is persisted for apiClient interceptor
      const existingToken = getAuthToken();
      if (existingToken) setAuthToken(existingToken);

      const res = await apiClient.get("/api/users/checkAuth", {
        timeout: 60000, // Render cold start can take 30-45s; override global 25s default
        headers: {
          "Cache-Control": "no-store",
          Pragma: "no-cache",
          Expires: "0",
        },
      });

      const serverUser = res?.data?.user ? normalizeUser(res.data.user) : null;

      // If backend ever returns a token, persist it, otherwise keep whatever we have
      const serverToken =
        res?.data?.token || res?.data?.accessToken || res?.data?.jwt || null;

      const finalToken = serverToken || getAuthToken() || null;

      if (!serverUser) {
        clearStoredUser();
        clearAuthToken();
        dispatch({ type: "AUTH_ERROR" });
        return;
      }

      if (finalToken) setAuthToken(finalToken);

      const payload = { user: serverUser, token: finalToken };
      writeStoredUser(payload);

      dispatch({ type: "USER_LOADED", payload });
    } catch (err) {
      // Do not spam console in production
      const msg = normalizeApiError(err);

      clearStoredUser();
      clearAuthToken();
      dispatch({ type: "AUTH_ERROR" });

      // Optional: toast here only if you want noisy auth errors
      // toast.error(msg);
      console.error("Auth check failed:", msg);
    } finally {
      isAuthChecking = false;
    }
  }, []);

  /**
   * login
   * Call this after a successful login request
   * Expected shapes:
   * - { user, token }
   * - { user, accessToken }
   * - { user, jwt }
   */
  const login = useCallback(
    async (userData) => {
      try {
        const token =
          userData?.token || userData?.accessToken || userData?.jwt || null;

        const user = normalizeUser(userData?.user || userData) || null;

        if (!user) throw new Error("Missing user");

        // Persist token for apiClient interceptor
        if (token) setAuthToken(token);

        const payload = { user, token };
        writeStoredUser(payload);

        dispatch({ type: "LOGIN_SUCCESS", payload });

        // Delay verification to avoid overlap with StrictMode init checks
        pendingLoginRef.current = true;
        setTimeout(async () => {
          try {
            await checkAuth();
          } finally {
            pendingLoginRef.current = false;
          }
        }, 500);
      } catch (err) {
        clearStoredUser();
        clearAuthToken();
        dispatch({ type: "AUTH_ERROR" });
        console.error("Login failed:", err?.message || err);
      }
    },
    [checkAuth],
  );

  /**
   * logout
   * Clears local storage token and asks backend to clear cookies/session too
   */
  const logout = useCallback(async () => {
    try {
      await apiClient.post("/api/users/logout").catch(() => {});
    } finally {
      clearStoredUser();
      clearAuthToken();
      dispatch({ type: "LOGOUT_SUCCESS" });
    }
  }, []);

  /**
   * Init
   * - Hydrate from localStorage first so UI does not flicker
   * - Then verify with backend
   */
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const stored = readStoredUser();
    const token = getAuthToken();

    if (stored?.user) {
      const normalized = normalizeUser(stored.user);
      const finalToken = stored.token || token || null;

      if (finalToken) setAuthToken(finalToken);

      dispatch({
        type: "LOGIN_SUCCESS",
        payload: { user: normalized, token: finalToken },
      });
    }

    // Verify shortly after hydration
    setTimeout(() => {
      checkAuth();
    }, 250);
  }, [checkAuth]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        checkAuth,
        dispatch,
        api: apiClient,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}
