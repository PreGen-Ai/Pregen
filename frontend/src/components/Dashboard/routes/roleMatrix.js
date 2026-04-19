// src/services/api/roleMatrix.js
import { ROLES } from "../nav/roles";

// Your requested permissions matrix (single source of truth)
export const roleMatrix = {
  [ROLES.STUDENT]: {
    can: [
      "practiceLab",
      "takeAssignments",
      "takeQuizzes",
      "leaderboard",
      "calendarDues",
      "aiTutor",
      "myClasses",
    ],
  },
  [ROLES.TEACHER]: {
    can: [
      "manageAssignments",
      "manageQuizzes",
      "leaderboard",
      "myClasses",
    ],
  },
  [ROLES.ADMIN]: {
    can: ["crudUsers", "crudClasses", "crudSubjects", "branding"],
  },
  [ROLES.SUPERADMIN]: {
    can: [
      "crudSchools",
      "crudUsers",
      "crudClasses",
      "crudSubjects",
      "branding",
      "aiControls",
      "analytics",
    ],
  },
  [ROLES.PARENT]: {
    can: ["leaderboard"],
  },
};
