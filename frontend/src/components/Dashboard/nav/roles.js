export const ROLES = {
  STUDENT: "student",
  TEACHER: "teacher",
  ADMIN: "admin",
  SUPERADMIN: "superadmin",
  PARENT: "parent",
};

export function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function hasRole(userRole, allowedRoles = []) {
  const r = normalizeRole(userRole);
  return allowedRoles.map(normalizeRole).includes(r);
}
