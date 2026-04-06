// ✅ PrivateRoute.jsx — Prevents login-redirect loops
import { Navigate } from "react-router-dom";
import { useAuthContext } from "./context/AuthContext";

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuthContext();

  if (loading) return <div>Loading...</div>; // ⏳ wait for checkAuth
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return children;
};

export default PrivateRoute;
