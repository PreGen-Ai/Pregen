import React from "react";
import { Navigate } from "react-router-dom";
import { hasRole } from "../nav/roles";
import { useAuthContext } from "../../../context/AuthContext";

function normalize(r) {
  if (!r) return "";
  const up = String(r).toUpperCase();
  if (up === "SUPER_ADMIN") return "SUPERADMIN";
  return up;
}

export default function RequireRole({ allowedRoles = [], children }) {
  const { user, loading, isAuthenticated } = useAuthContext();

  if (loading) return null;

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // If no roles passed, allow by default
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    return <>{children}</>;
  }

  const ok = hasRole(normalize(user.role), allowedRoles.map(normalize));

  if (ok) return <>{children}</>;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 18, fontWeight: 900 }}>Not allowed</div>
      <div style={{ marginTop: 8, opacity: 0.8 }}>
        Your account does not have access to this page.
      </div>
    </div>
  );
}
