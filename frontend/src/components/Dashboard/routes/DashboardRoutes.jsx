// src/routes/DashboardRoutes.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "../layout/DashboardLayout";
import RequireRole from "../guards/RequireRole";
import { ROLES } from "../nav/roles";

// ── Shared / Learning ──
import LessonsPage from "../pages/LessonsPage";
import AnnouncementsPage from "../pages/AnnouncementsPage";
import GradebookPage from "../pages/GradebookPage";
import AITutor from "../pages/AITutor";
import PracticeLab from "../pages/PracticeLab";
import Assignments from "../pages/Assignments";
import QuizGenerator from "../pages/QuizGenerator";
import Settings from "../pages/Settings";

// ── Super Admin ──
import SuperDashboardPage from "../pages/SuperAdmin/SuperDashboardPage";
import TenantsPage from "../pages/SuperAdmin/TenantsPage";
import AICostPage from "../pages/SuperAdmin/AICostPage";
import AuditLogsPage from "../pages/SuperAdmin/AuditLogsPage";
import FeatureFlagsPage from "../pages/SuperAdmin/FeatureFlagsPage";
import SuperAdminAIControlsPage from "../pages/SuperAdmin/AIControlsPage";

// ── Admin (Tenant Admin) ──
import AdminUsersPage from "../pages/AdminUsersPage";
import AdminClassesPage from "../pages/AdminClassesPage";
import AdminSubjectsPage from "../pages/AdminSubjectsPage";
import AdminBrandingPage from "../pages/AdminBrandingPage";
import AdminAIControlsPage from "../pages/AdminAIControlsPage";

export default function DashboardRoutes() {
  return (
    <Routes>
      <Route path="/dashboard" element={<DashboardLayout />}>
        {/* Default: redirect to appropriate home */}
        <Route index element={<Navigate to="/dashboard/grades" replace />} />

        {/* =====================
         * STUDENT
         * ===================== */}
        <Route
          path="practice-lab"
          element={
            <RequireRole allowedRoles={[ROLES.STUDENT]}>
              <PracticeLab />
            </RequireRole>
          }
        />
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
          path="calendar"
          element={
            <RequireRole allowedRoles={[ROLES.STUDENT]}>
              <GradebookPage />
            </RequireRole>
          }
        />

        {/* =====================
         * TEACHER
         * ===================== */}
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
        <Route
          path="teacher/content"
          element={
            <RequireRole allowedRoles={[ROLES.TEACHER]}>
              <LessonsPage />
            </RequireRole>
          }
        />

        {/* =====================
         * SHARED (Student + Teacher)
         * ===================== */}
        <Route
          path="materials"
          element={
            <RequireRole allowedRoles={[ROLES.STUDENT, ROLES.TEACHER]}>
              <LessonsPage />
            </RequireRole>
          }
        />
        <Route
          path="announcements"
          element={
            <RequireRole
              allowedRoles={[ROLES.STUDENT, ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPERADMIN]}
            >
              <AnnouncementsPage />
            </RequireRole>
          }
        />
        <Route
          path="grades"
          element={
            <RequireRole allowedRoles={[ROLES.STUDENT, ROLES.TEACHER]}>
              <GradebookPage />
            </RequireRole>
          }
        />
        <Route
          path="ai-tutor"
          element={
            <RequireRole allowedRoles={[ROLES.STUDENT]}>
              <AITutor />
            </RequireRole>
          }
        />
        <Route
          path="my-classes"
          element={
            <RequireRole allowedRoles={[ROLES.STUDENT, ROLES.TEACHER]}>
              <LessonsPage />
            </RequireRole>
          }
        />

        {/* =====================
         * ADMIN (Tenant Admin)
         * ===================== */}
        <Route
          path="admin/users"
          element={
            <RequireRole allowedRoles={[ROLES.ADMIN, ROLES.SUPERADMIN]}>
              <AdminUsersPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/workspace"
          element={
            <RequireRole allowedRoles={[ROLES.ADMIN, ROLES.SUPERADMIN]}>
              <AdminClassesPage />
            </RequireRole>
          }
        />
        {/* legacy path alias */}
        <Route
          path="workspace"
          element={<Navigate to="/dashboard/admin/workspace" replace />}
        />
        <Route
          path="admin/classes"
          element={
            <RequireRole allowedRoles={[ROLES.ADMIN, ROLES.SUPERADMIN]}>
              <AdminClassesPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/subjects"
          element={
            <RequireRole allowedRoles={[ROLES.ADMIN, ROLES.SUPERADMIN]}>
              <AdminSubjectsPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/branding"
          element={
            <RequireRole allowedRoles={[ROLES.ADMIN, ROLES.SUPERADMIN]}>
              <AdminBrandingPage />
            </RequireRole>
          }
        />
        <Route
          path="admin/ai-controls"
          element={
            <RequireRole allowedRoles={[ROLES.ADMIN]}>
              <AdminAIControlsPage />
            </RequireRole>
          }
        />

        {/* =====================
         * SUPERADMIN
         * ===================== */}
        <Route
          path="super/system"
          element={
            <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
              <SuperDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="superadmin/tenants"
          element={
            <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
              <TenantsPage />
            </RequireRole>
          }
        />
        <Route
          path="superadmin/ai-controls"
          element={
            <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
              <SuperAdminAIControlsPage />
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
          path="superadmin/analytics"
          element={
            <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
              <AuditLogsPage />
            </RequireRole>
          }
        />
        <Route
          path="superadmin/flags"
          element={
            <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
              <FeatureFlagsPage />
            </RequireRole>
          }
        />

        {/* Settings (all authenticated) */}
        <Route path="settings" element={<Settings />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
