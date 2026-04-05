import { ROLES } from "./roles";

// Sidebar config (ONE sidebar). Items are filtered by allowedRoles.
export const dashboardNav = [
  {
    section: "Learning",
    items: [
      {
        key: "practiceLab",
        label: "Practice Lab",
        to: "/dashboard/practice-lab",
        allowedRoles: [ROLES.STUDENT],
      },
      {
        key: "assignmentsTake",
        label: "Assignments",
        to: "/dashboard/assignments",
        allowedRoles: [ROLES.STUDENT],
      },
      {
        key: "quizzesTake",
        label: "Quizzes",
        to: "/dashboard/quizzes",
        allowedRoles: [ROLES.STUDENT],
      },
      {
        key: "materials",
        label: "Materials",
        to: "/dashboard/materials",
        allowedRoles: [ROLES.STUDENT, ROLES.TEACHER],
      },
      {
        key: "assignmentsManage",
        label: "Assignments",
        to: "/dashboard/teacher/assignments",
        allowedRoles: [ROLES.TEACHER],
      },
      {
        key: "quizzesManage",
        label: "Quizzes",
        to: "/dashboard/teacher/quizzes",
        allowedRoles: [ROLES.TEACHER],
      },
      {
        key: "announcements",
        label: "Announcements",
        to: "/dashboard/announcements",
        allowedRoles: [ROLES.STUDENT, ROLES.TEACHER, ROLES.ADMIN, ROLES.SUPERADMIN],
      },
      {
        key: "gradebook",
        label: "Grades",
        to: "/dashboard/grades",
        allowedRoles: [ROLES.STUDENT, ROLES.TEACHER],
      },
    ],
  },
  {
    section: "Tools",
    items: [
      {
        key: "aiTutor",
        label: "AI Tutor",
        to: "/dashboard/ai-tutor",
        allowedRoles: [ROLES.STUDENT, ROLES.TEACHER],
      },
      {
        key: "leaderboard",
        label: "Leaderboard",
        to: "/dashboard/leaderboard",
        allowedRoles: [ROLES.STUDENT, ROLES.TEACHER, ROLES.PARENT],
      },
      {
        key: "calendar",
        label: "Calendar & Dues",
        to: "/dashboard/calendar",
        allowedRoles: [ROLES.STUDENT],
      },
      {
        key: "classes",
        label: "My Classes & Subjects",
        to: "/dashboard/my-classes",
        allowedRoles: [ROLES.STUDENT, ROLES.TEACHER],
      },
    ],
  },
  {
    section: "Administration",
    items: [
      {
        key: "users",
        label: "Users",
        to: "/dashboard/admin/users",
        allowedRoles: [ROLES.ADMIN, ROLES.SUPERADMIN],
      },
      {
        key: "workspace",
        label: "Workspace",
        to: "/dashboard/admin/workspace",
        allowedRoles: [ROLES.ADMIN, ROLES.SUPERADMIN],
      },
      {
        key: "subjects",
        label: "Subjects",
        to: "/dashboard/admin/subjects",
        allowedRoles: [ROLES.ADMIN, ROLES.SUPERADMIN],
      },
      {
        key: "branding",
        label: "Branding",
        to: "/dashboard/admin/branding",
        allowedRoles: [ROLES.ADMIN, ROLES.SUPERADMIN],
      },
      {
        key: "tenantAiControls",
        label: "Tenant AI Controls",
        to: "/dashboard/admin/ai-controls",
        allowedRoles: [ROLES.ADMIN],
      },
      {
        key: "tenants",
        label: "Schools / Universities",
        to: "/dashboard/superadmin/tenants",
        allowedRoles: [ROLES.SUPERADMIN],
      },
      {
        key: "aiControls",
        label: "AI Controls",
        to: "/dashboard/superadmin/ai-controls",
        allowedRoles: [ROLES.SUPERADMIN],
      },
      {
        key: "aiCost",
        label: "AI Usage & Cost",
        to: "/dashboard/superadmin/ai-cost",
        allowedRoles: [ROLES.SUPERADMIN],
      },
      {
        key: "analytics",
        label: "Analytics",
        to: "/dashboard/superadmin/analytics",
        allowedRoles: [ROLES.SUPERADMIN],
      },
    ],
  },
];
