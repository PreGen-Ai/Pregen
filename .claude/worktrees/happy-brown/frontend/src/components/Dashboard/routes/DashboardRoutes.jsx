// src/routes/DashboardRoutes.jsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "../layout/DashboardLayout";
import RequireRole from "../guards/RequireRole";
import { ROLES } from "../nav/roles";

// Pages are intentionally left as placeholders here.
const Placeholder = ({ title }) => (
  <div style={{ padding: 16, color: "#fff" }}>
    <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
    <p style={{ opacity: 0.8, marginTop: 8 }}>
      Hook this route to your real page component.
    </p>
  </div>
);

export default function DashboardRoutes() {
  return (
    <Routes>
      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<Placeholder title="Dashboard Home" />} />

        {/* =========================
         * STUDENT
         * ========================= */}
        <Route
          path="practicelab"
          element={
            <RequireRole allowedRoles={[ROLES.STUDENT]}>
              <Placeholder title="Practice Lab" />
            </RequireRole>
          }
        />

        {/* Student assignments/quizzes */}
        <Route
          path="assignments"
          element={
            <RequireRole allowedRoles={[ROLES.STUDENT]}>
              <Placeholder title="Assignments (Take/Submit)" />
            </RequireRole>
          }
        />
        <Route
          path="quizzes"
          element={
            <RequireRole allowedRoles={[ROLES.STUDENT]}>
              <Placeholder title="Quizzes (Take/Submit)" />
            </RequireRole>
          }
        />

        <Route
          path="calendar"
          element={
            <RequireRole allowedRoles={[ROLES.STUDENT]}>
              <Placeholder title="Calendar & Dues" />
            </RequireRole>
          }
        />

        {/* =========================
         * TEACHER
         * (Separate routes so they don't conflict with student paths)
         * ========================= */}
        <Route
          path="teacher/assignments"
          element={
            <RequireRole allowedRoles={[ROLES.TEACHER]}>
              <Placeholder title="Teacher Assignments (Generate/Grade/Assign)" />
            </RequireRole>
          }
        />
        <Route
          path="teacher/quizzes"
          element={
            <RequireRole allowedRoles={[ROLES.TEACHER]}>
              <Placeholder title="Teacher Quizzes (Generate/Grade/Assign)" />
            </RequireRole>
          }
        />
        <Route
          path="teacher/content"
          element={
            <RequireRole allowedRoles={[ROLES.TEACHER]}>
              <Placeholder title="Teacher Content" />
            </RequireRole>
          }
        />

        {/* =========================
         * SHARED (Student + Teacher + Parent)
         * ========================= */}
        <Route
          path="ai-tutor"
          element={
            <RequireRole allowedRoles={[ROLES.STUDENT, ROLES.TEACHER]}>
              <Placeholder title="AI Tutor" />
            </RequireRole>
          }
        />
        <Route
          path="leaderboard"
          element={
            <RequireRole
              allowedRoles={[ROLES.STUDENT, ROLES.TEACHER, ROLES.PARENT]}
            >
              <Placeholder title="Leaderboard" />
            </RequireRole>
          }
        />
        <Route
          path="my-classes"
          element={
            <RequireRole allowedRoles={[ROLES.STUDENT, ROLES.TEACHER]}>
              <Placeholder title="My Classes & Subjects" />
            </RequireRole>
          }
        />

        {/* =========================
         * ADMIN (Admin + Superadmin)
         * ========================= */}
        <Route
          path="admin/users"
          element={
            <RequireRole allowedRoles={[ROLES.ADMIN, ROLES.SUPERADMIN]}>
              <Placeholder title="Admin: Users (CRUD)" />
            </RequireRole>
          }
        />
        <Route
          path="admin/classes"
          element={
            <RequireRole allowedRoles={[ROLES.ADMIN, ROLES.SUPERADMIN]}>
              <Placeholder title="Admin: Classes" />
            </RequireRole>
          }
        />
        <Route
          path="workspace"
          element={
            <RequireRole allowedRoles={[ROLES.ADMIN, ROLES.SUPERADMIN]}>
              <Placeholder title="Workspace (Classes/Subjects CRUD)" />
            </RequireRole>
          }
        />
        <Route
          path="admin/branding"
          element={
            <RequireRole allowedRoles={[ROLES.ADMIN, ROLES.SUPERADMIN]}>
              <Placeholder title="Admin: Branding" />
            </RequireRole>
          }
        />

        {/* =========================
         * SUPERADMIN
         * ========================= */}
        <Route
          path="super/system"
          element={
            <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
              <Placeholder title="Super Admin: System" />
            </RequireRole>
          }
        />
        <Route
          path="superadmin/tenants"
          element={
            <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
              <Placeholder title="Tenants (Schools/Universities)" />
            </RequireRole>
          }
        />
        <Route
          path="superadmin/ai-controls"
          element={
            <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
              <Placeholder title="AI Controls" />
            </RequireRole>
          }
        />
        <Route
          path="superadmin/analytics"
          element={
            <RequireRole allowedRoles={[ROLES.SUPERADMIN]}>
              <Placeholder title="Analytics" />
            </RequireRole>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
