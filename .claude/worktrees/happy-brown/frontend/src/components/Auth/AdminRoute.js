import React from "react";
import { Navigate } from "react-router-dom";

const AdminRoute = ({ children }) => {
  const token = localStorage.getItem("token");

  // Try to parse user from localStorage
  let isAdmin = false;
  try {
    const user = JSON.parse(localStorage.getItem("user"));
    isAdmin = user?.role === "admin";
  } catch (error) {
    console.error("❌ Error parsing user data:", error);
  }

  // Redirect if not authenticated
  if (!token) return <Navigate to="/login" replace />;

  // Redirect non-admin users to dashboard
  if (!isAdmin) return <Navigate to="/Dashboard" replace />;

  return children;
};

export default AdminRoute;
