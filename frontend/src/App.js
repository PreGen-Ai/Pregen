// src/App.jsx (UPDATED to use your pages/tools, pages/SuperAdmin, ParentPortal, TeacherPortal)
import React, { Suspense, lazy } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Outlet,
  Navigate,
} from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-toastify/dist/ReactToastify.css";

import { AuthProvider, useAuthContext } from "./context/AuthContext";
import ProtectedRoute from "./components/Auth/ProtectedRoute";

import RequireRole from "./components/Dashboard/guards/RequireRole";
import { ROLES, normalizeRole } from "./components/Dashboard/nav/roles";

const lazyPage = (importer) => lazy(importer);

function AppFallback() {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 14, opacity: 0.8 }}>Loading…</div>
    </div>
  );
}

// shared layout
const NavBar = lazyPage(() => import("./components/Home/Navbar"));
const Footer = lazyPage(() => import("./components/Home/Footer"));

// public
const Home = lazyPage(() => import("./components/Home/home"));
const Login = lazyPage(
  () => import("./components/LOGIN&REGISTRATION/Login/Login"),
);
const Signup = lazyPage(
  () => import("./components/LOGIN&REGISTRATION/Signup/Signup"),
);
const Contact = lazyPage(() => import("./components/Contact/contact"));
const SearchResults = lazyPage(() => import("./components/Home/SearchResults"));
const CasioCalculator = lazyPage(() => import("./components/casio"));

// unified dashboard layout
const DashboardLayout = lazyPage(
  () => import("./components/Dashboard/layout/DashboardLayout"),
);

// pages/tools (from your screenshot)
const UserManagementPage = lazyPage(
  () => import("./pages/tools/UserManagementPage"),
);
const AcademicStructurePage = lazyPage(
  () => import("./pages/tools/AcademicStructurePage"),
);
const BrandingPage = lazyPage(() => import("./pages/tools/BrandingPage"));
const AIControlsPage = lazyPage(() => import("./pages/tools/AIControlsPage"));
const AnalyticsReportsPage = lazyPage(
  () => import("./pages/tools/AnalyticsReportsPage"),
);

// portals (from your screenshot)
const ParentPortal = lazyPage(
  () => import("./pages/ParentPortal"),
);
const TeacherPortal = lazyPage(
  () => import("./components/Dashboard/pages/TeacherQuiz"),
);

const TenantsPage = lazyPage(
  () => import("./components/Dashboard/pages/SuperAdmin/TenantsPage"),
);
const AICostPage = lazyPage(
  () => import("./components/Dashboard/pages/SuperAdmin/AICostPage"),
);
const AuditLogsPage = lazyPage(
  () => import("./components/Dashboard/pages/SuperAdmin/AuditLogsPage"),
);
const FeatureFlagsPage = lazyPage(
  () => import("./components/Dashboard/pages/SuperAdmin/FeatureFlagsPage"),
);

// dashboard feature pages (also shown in pages/SuperAdmin)
const AITutor = lazyPage(() => import("./components/Dashboard/pages/AITutor"));
const Assignments = lazyPage(
  () => import("./components/Dashboard/pages/Assignments"),
);
const PracticeLab = lazyPage(
  () => import("./components/Dashboard/pages/PracticeLab"),
);
const QuizGenerator = lazyPage(
  () => import("./components/Dashboard/pages/QuizGenerator"),
);

// Public "/" shows Home for guests, redirects to dashboard for authed users
function HomeOrRedirect() {
  const { isAuthenticated, loading } = useAuthContext();
  if (loading) return null;
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <Home />;
}

// Default dashboard landing by role
function DashboardHomeRedirect() {
  const { user, loading } = useAuthContext();
  if (loading) return null;

  const role = normalizeRole(user?.role);

  if (role === ROLES.PARENT) return <Navigate to="/dashboard/parent" replace />;
  if (role === ROLES.SUPERADMIN)
    return <Navigate to="/dashboard/superadmin/dashboard" replace />;
  if (role === ROLES.ADMIN)
    return <Navigate to="/dashboard/admin/users" replace />;
  if (role === ROLES.TEACHER)
    return <Navigate to="/dashboard/teacher" replace />;

  return <Navigate to="/dashboard/assignments" replace />;
}

const PublicLayout = () => (
  <>
    <Suspense fallback={<AppFallback />}>
      <NavBar />
    </Suspense>

    <Outlet />

    <Suspense fallback={<AppFallback />}>
      <Footer />
    </Suspense>
  </>
);

/**
 * If your DashboardLayout ALREADY renders <Outlet /> internally,
 * remove the <Outlet /> below to avoid double nesting.
 */
const DashboardAppLayout = () => (
  <Suspense fallback={<AppFallback />}>
    <DashboardLayout />
  </Suspense>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ToastContainer
          position="bottom-right"
          theme="colored"
          autoClose={2500}
        />

        <Suspense fallback={<AppFallback />}>
          <Routes>
            {/* ---------- Public ---------- */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<HomeOrRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/SearchResults" element={<SearchResults />} />
              <Route path="/CasioCalculator" element={<CasioCalculator />} />
            </Route>

            {/* ---------- Protected shell ---------- */}
            <Route
              element={
                <ProtectedRoute>
                  <Outlet />
                </ProtectedRoute>
              }
            >
              {/* Legacy redirects */}
              <Route
                path="/settings"
                element={<Navigate to="/dashboard/settings" replace />}
              />
              <Route
                path="/ai-tutor"
                element={<Navigate to="/dashboard/ai-tutor" replace />}
              />
              <Route
                path="/assignments"
                element={<Navigate to="/dashboard/assignments" replace />}
              />
              <Route
                path="/quizzes"
                element={<Navigate to="/dashboard/quizzes" replace />}
              />
              <Route
                path="/practice-lab"
                element={<Navigate to="/dashboard/practice-lab" replace />}
              />

              <Route
                path="/admin"
                element={<Navigate to="/dashboard/admin/users" replace />}
              />
              <Route
                path="/super"
                element={
                  <Navigate to="/dashboard/superadmin/dashboard" replace />
                }
              />

              {/* Unified dashboard */}
              <Route path="/dashboard" element={<DashboardAppLayout />}>
                <Route index element={<DashboardHomeRedirect />} />

                {/* ---------- STUDENT ---------- */}
                <Route
                  path="assignments"
                  element={
                    <RequireRole allowedRoles={[ROLES.STUDENT]}>
                      <Assignments />
                    </RequireRole>
                  }
                />
                <Route
                  path="quizzes"
                  element={
                    <RequireRole allowedRoles={[ROLES.STUDENT]}>
                      <QuizGenerator />
                    </RequireRole>
                  }
                />
                <Route
                  path="practice-lab"
                  element={
                    <RequireRole allowedRoles={[ROLES.STUDENT]}>
                      <PracticeLab />
                    </RequireRole>
                  }
                />

                {/* ---------- TEACHER ---------- */}
                <Route
                  path="teacher"
                  element={
                    <RequireRole allowedRoles={[ROLES.TEACHER]}>
                      <TeacherPortal />
                    </RequireRole>
                  }
                />
                <Route
                  path="teacher/assignments"
                  element={
                    <RequireRole allowedRoles={[ROLES.TEACHER]}>
                      <Assignments />
                    </RequireRole>
                  }
                />
                <Route
                  path="teacher/quizzes"
                  element={
                    <RequireRole allowedRoles={[ROLES.TEACHER]}>
                      <QuizGenerator />
                    </RequireRole>
                  }
                />

                {/* ---------- PARENT ---------- */}
                <Route
                  path="parent"
                  element={
                    <RequireRole allowedRoles={[ROLES.PARENT]}>
                      <ParentPortal />
                    </RequireRole>
                  }
                />

                {/* ---------- SHARED ---------- */}
                <Route
                  path="ai-tutor"
                  element={
                    <RequireRole allowedRoles={[ROLES.STUDENT, ROLES.TEACHER]}>
                      <AITutor />
                    </RequireRole>
                  }
                />

                {/* ---------- ADMIN ---------- */}
                <Route
                  path="admin/users"
                  element={
                    <RequireRole allowedRoles={[ROLES.ADMIN, ROLES.SUPERADMIN]}>
                      <UserManagementPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="admin/workspace"
                  element={
                    <RequireRole allowedRoles={[ROLES.ADMIN, ROLES.SUPERADMIN]}>
                      <AcademicStructurePage />
                    </RequireRole>
                  }
                />
                <Route
                  path="admin/branding"
                  element={
                    <RequireRole allowedRoles={[ROLES.ADMIN, ROLES.SUPERADMIN]}>
                      <BrandingPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="admin/ai-controls"
                  element={
                    <RequireRole allowedRoles={[ROLES.ADMIN, ROLES.SUPERADMIN]}>
                      <AIControlsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="admin/analytics"
                  element={
                    <RequireRole allowedRoles={[ROLES.ADMIN, ROLES.SUPERADMIN]}>
                      <AnalyticsReportsPage />
                    </RequireRole>
                  }
                />

                {/* ---------- SUPERADMIN ---------- */}

                <Route
                  path="superadmin/tenants"
                  element={
                    <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
                      <TenantsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="superadmin/ai-cost"
                  element={
                    <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
                      <AICostPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="superadmin/feature-flags"
                  element={
                    <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
                      <FeatureFlagsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="superadmin/audit"
                  element={
                    <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
                      <AuditLogsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="superadmin/ai-controls"
                  element={
                    <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
                      <AIControlsPage />
                    </RequireRole>
                  }
                />
                <Route
                  path="superadmin/analytics"
                  element={
                    <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
                      <AnalyticsReportsPage />
                    </RequireRole>
                  }
                />

                <Route
                  path="*"
                  element={<Navigate to="/dashboard" replace />}
                />
              </Route>
            </Route>

            {/* ---------- Catch-all ---------- */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
