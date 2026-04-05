import React from "react";
import { Navigate } from "react-router-dom";
import { useAuthContext } from "../../context/AuthContext";

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuthContext();

  if (loading) return null;

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
