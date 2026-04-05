// ✅ useSignup.js — Fully aligned with AuthContext.js
import { useState, useCallback } from "react";
import axios from "axios";
import { useAuthContext } from "../context/AuthContext";

// 🌍 Centralized API base URL (same logic everywhere)
const API_BASE_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : window.location.hostname.includes("preprod")
    ? "https://pregen.onrender.com"
    : "https://pregen.onrender.com";

// ⚙️ Reusable Axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export const useSignup = () => {
  const { login, dispatch } = useAuthContext();

  // 🧾 Form fields
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState("");

  // 👁️ Password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // ⚡ Feedback + loading
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // 🔹 Main handler
  const handleSignup = useCallback(
    async (e) => {
      e.preventDefault();
      setIsLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      // 🔒 Basic client-side validation
      if (password !== confirmPassword) {
        setErrorMessage("Passwords do not match.");
        setIsLoading(false);
        return;
      }

      try {
        // 🚀 Call backend
        const response = await api.post("/api/users/signup", {
          username,
          email,
          password,
          firstName,
          lastName,
          gender,
        });

        const { user, token } = response.data;
        if (!user || !token) throw new Error("Unexpected response format");

        // 🧩 Normalize role to uppercase
        const normalizedUser = {
          ...user,
          role: user.role?.toUpperCase?.() || "STUDENT",
        };

        // 🧠 Prepare unified payload
        const payload = { user: normalizedUser, token };

        // ✅ Use global AuthContext login() for instant Navbar reactivity
        await login(payload);

        setSuccessMessage("Registration successful 🎉");
      } catch (error) {
        console.error("Signup error:", error);
        setErrorMessage(
          error.response?.data?.message || "Signup failed. Please try again."
        );
        dispatch({ type: "AUTH_ERROR" });
      } finally {
        setIsLoading(false);
      }
    },
    [
      username,
      email,
      password,
      confirmPassword,
      firstName,
      lastName,
      gender,
      login,
      dispatch,
    ]
  );

  return {
    username,
    setUsername,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    firstName,
    setFirstName,
    lastName,
    setLastName,
    gender,
    setGender,
    showPassword,
    setShowPassword,
    showConfirmPassword,
    setShowConfirmPassword,
    errorMessage,
    successMessage,
    isLoading,
    handleSignup,
  };
};
