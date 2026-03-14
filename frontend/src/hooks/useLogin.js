// src/hooks/useLogin.js
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import api from "../services/api/api.js";
import { setAuthToken } from "../services/api/http.js";

export const useLogin = () => {
  const navigate = useNavigate();
  const { login, dispatch } = useAuthContext();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = useCallback(
    async (e) => {
      e.preventDefault();
      setIsLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      try {
        // ✅ use the unified API layer (uses http.js interceptors)
        const data = await api.users.login({ email, password });

        // Expect { user, token } or { user, accessToken }
        const user = data?.user;
        const token = data?.token || data?.accessToken;

        if (!user || !token)
          throw new Error("Unexpected server response format");

        // ✅ store token where http.js reads it from
        setAuthToken(token);

        // optional: store user
        localStorage.setItem("user", JSON.stringify(user));

        // ✅ update AuthContext
        await login({ user, token });

        setSuccessMessage("Login successful");
        navigate("/dashboard");
      } catch (error) {
        const msg =
          error?.message ||
          error?.response?.data?.message ||
          "Login failed. Please try again.";

        setErrorMessage(msg);
        dispatch({ type: "AUTH_ERROR" });
      } finally {
        setIsLoading(false);
      }
    },
    [email, password, login, dispatch, navigate],
  );

  return {
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    errorMessage,
    successMessage,
    isLoading,
    handleLogin,
  };
};
