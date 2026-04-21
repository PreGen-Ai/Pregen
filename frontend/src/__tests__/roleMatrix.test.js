import roleMatrix from "../components/Dashboard/routes/roleMatrix.js";
import { ROLES } from "../components/Dashboard/nav/roles.js";

describe("Role Matrix - Structure", () => {
  const expectedRoles = [
    ROLES.STUDENT,
    ROLES.TEACHER,
    ROLES.ADMIN,
    ROLES.SUPERADMIN,
    ROLES.PARENT,
  ];

  test("roleMatrix is defined and is an object", () => {
    expect(roleMatrix).toBeDefined();
    expect(typeof roleMatrix).toBe("object");
  });

  for (const role of expectedRoles) {
    test(`roleMatrix has entry for ${role}`, () => {
      expect(roleMatrix[role]).toBeDefined();
    });

    test(`roleMatrix[${role}] has a can array`, () => {
      expect(Array.isArray(roleMatrix[role]?.can)).toBe(true);
    });
  }
});

describe("Role Matrix - STUDENT permissions", () => {
  const studentPerms = roleMatrix[ROLES.STUDENT]?.can ?? [];

  test("student can practiceLab", () => {
    expect(studentPerms).toContain("practiceLab");
  });

  test("student can takeAssignments", () => {
    expect(studentPerms).toContain("takeAssignments");
  });

  test("student can takeQuizzes", () => {
    expect(studentPerms).toContain("takeQuizzes");
  });

  test("student can aiTutor", () => {
    expect(studentPerms).toContain("aiTutor");
  });

  test("student can leaderboard", () => {
    expect(studentPerms).toContain("leaderboard");
  });

  test("student cannot manageAssignments", () => {
    expect(studentPerms).not.toContain("manageAssignments");
  });

  test("student cannot crudUsers", () => {
    expect(studentPerms).not.toContain("crudUsers");
  });
});

describe("Role Matrix - TEACHER permissions", () => {
  const teacherPerms = roleMatrix[ROLES.TEACHER]?.can ?? [];

  test("teacher can manageAssignments", () => {
    expect(teacherPerms).toContain("manageAssignments");
  });

  test("teacher can manageQuizzes", () => {
    expect(teacherPerms).toContain("manageQuizzes");
  });

  test("teacher can aiTutor", () => {
    expect(teacherPerms).toContain("aiTutor");
  });

  test("teacher cannot crudUsers", () => {
    expect(teacherPerms).not.toContain("crudUsers");
  });

  test("teacher cannot crudSchools", () => {
    expect(teacherPerms).not.toContain("crudSchools");
  });
});

describe("Role Matrix - ADMIN permissions", () => {
  const adminPerms = roleMatrix[ROLES.ADMIN]?.can ?? [];

  test("admin can crudUsers", () => {
    expect(adminPerms).toContain("crudUsers");
  });

  test("admin can crudClasses", () => {
    expect(adminPerms).toContain("crudClasses");
  });

  test("admin can branding", () => {
    expect(adminPerms).toContain("branding");
  });
});

describe("Role Matrix - SUPERADMIN permissions", () => {
  const superAdminPerms = roleMatrix[ROLES.SUPERADMIN]?.can ?? [];

  test("superadmin can crudSchools", () => {
    expect(superAdminPerms).toContain("crudSchools");
  });

  test("superadmin can aiControls", () => {
    expect(superAdminPerms).toContain("aiControls");
  });

  test("superadmin can analytics", () => {
    expect(superAdminPerms).toContain("analytics");
  });
});

describe("Role Matrix - PARENT permissions", () => {
  const parentPerms = roleMatrix[ROLES.PARENT]?.can ?? [];

  test("parent can leaderboard", () => {
    expect(parentPerms).toContain("leaderboard");
  });

  test("parent cannot manageAssignments", () => {
    expect(parentPerms).not.toContain("manageAssignments");
  });

  test("parent cannot crudUsers", () => {
    expect(parentPerms).not.toContain("crudUsers");
  });
});
