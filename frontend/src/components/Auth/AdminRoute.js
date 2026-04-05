import React from "react";
import { Navigate } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext";

const AdminRoute = ({ children }) => {
  const { isAuthenticated, loading, user } = useAuthContext();

  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const role = String(user?.role || "").toUpperCase();
  if (!["ADMIN", "SUPERADMIN"].includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default AdminRoute;
