import { ROLES } from "./roles";

// Sidebar config (single sidebar). Items are filtered by allowedRoles and
// optionally disabled until a superadmin selects a school context.
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
        allowedRoles: [
          ROLES.STUDENT,
          ROLES.TEACHER,
          ROLES.ADMIN,
          ROLES.SUPERADMIN,
        ],
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
    ],
  },
  {
    section: "School Administration",
    items: [
      {
        key: "users",
        label: "Users",
        to: "/dashboard/admin/users",
        allowedRoles: [ROLES.ADMIN],
      },
      {
        key: "workspace",
        label: "Academic Structure",
        to: "/dashboard/admin/workspace",
        allowedRoles: [ROLES.ADMIN],
      },
      {
        key: "subjects",
        label: "Subjects",
        to: "/dashboard/admin/subjects",
        allowedRoles: [ROLES.ADMIN],
      },
      {
        key: "branding",
        label: "Branding",
        to: "/dashboard/admin/branding",
        allowedRoles: [ROLES.ADMIN],
      },
      {
        key: "tenantAiControls",
        label: "AI Controls",
        to: "/dashboard/admin/ai-controls",
        allowedRoles: [ROLES.ADMIN],
      },
      {
        key: "schoolAnalytics",
        label: "Analytics",
        to: "/dashboard/admin/analytics",
        allowedRoles: [ROLES.ADMIN],
      },
    ],
  },
  {
    section: "Platform",
    items: [
      {
        key: "platformAnalytics",
        label: "Platform Analytics",
        to: "/dashboard/superadmin/analytics",
        allowedRoles: [ROLES.SUPERADMIN],
      },
      {
        key: "tenants",
        label: "Schools",
        to: "/dashboard/superadmin/tenants",
        allowedRoles: [ROLES.SUPERADMIN],
      },
      {
        key: "platformAiControls",
        label: "Platform AI Controls",
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
        key: "audit",
        label: "Audit Logs",
        to: "/dashboard/superadmin/audit",
        allowedRoles: [ROLES.SUPERADMIN],
      },
    ],
  },
  {
    section: "Selected School",
    helper: "Select a school from Schools to unlock school-scoped tools.",
    items: [
      {
        key: "selectedSchoolUsers",
        label: "School Users",
        to: "/dashboard/admin/users",
        allowedRoles: [ROLES.SUPERADMIN],
        requiresActiveTenant: true,
      },
      {
        key: "selectedSchoolWorkspace",
        label: "Academic Structure",
        to: "/dashboard/admin/workspace",
        allowedRoles: [ROLES.SUPERADMIN],
        requiresActiveTenant: true,
      },
      {
        key: "selectedSchoolSubjects",
        label: "Subjects",
        to: "/dashboard/admin/subjects",
        allowedRoles: [ROLES.SUPERADMIN],
        requiresActiveTenant: true,
      },
      {
        key: "selectedSchoolBranding",
        label: "Branding",
        to: "/dashboard/admin/branding",
        allowedRoles: [ROLES.SUPERADMIN],
        requiresActiveTenant: true,
      },
      {
        key: "selectedSchoolAiControls",
        label: "School AI Controls",
        to: "/dashboard/admin/ai-controls",
        allowedRoles: [ROLES.SUPERADMIN],
        requiresActiveTenant: true,
      },
      {
        key: "selectedSchoolAnalytics",
        label: "School Analytics",
        to: "/dashboard/admin/analytics",
        allowedRoles: [ROLES.SUPERADMIN],
        requiresActiveTenant: true,
      },
    ],
  },
];
