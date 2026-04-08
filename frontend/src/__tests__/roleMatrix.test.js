// frontend/src/__tests__/roleMatrix.test.js
// Unit tests for the RBAC role matrix
import roleMatrix from "../components/Dashboard/routes/roleMatrix.js";

describe("Role Matrix — Structure", () => {
  const expectedRoles = ["STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"];

  test("roleMatrix is defined and is an object", () => {
    expect(roleMatrix).toBeDefined();
    expect(typeof roleMatrix).toBe("object");
  });

  for (const role of expectedRoles) {
    test(`roleMatrix has entry for ${role}`, () => {
      expect(roleMatrix[role]).toBeDefined();
    });

    test(`roleMatrix[${role}] has a 'can' array`, () => {
      expect(Array.isArray(roleMatrix[role]?.can)).toBe(true);
    });
  }
});

describe("Role Matrix — STUDENT permissions", () => {
  const studentPerms = roleMatrix["STUDENT"]?.can ?? [];

  test("STUDENT can practiceLab", () => {
    expect(studentPerms).toContain("practiceLab");
  });

  test("STUDENT can takeAssignments", () => {
    expect(studentPerms).toContain("takeAssignments");
  });

  test("STUDENT can takeQuizzes", () => {
    expect(studentPerms).toContain("takeQuizzes");
  });

  test("STUDENT can aiTutor", () => {
    expect(studentPerms).toContain("aiTutor");
  });

  test("STUDENT can leaderboard", () => {
    expect(studentPerms).toContain("leaderboard");
  });

  test("STUDENT CANNOT manageAssignments (teacher permission)", () => {
    expect(studentPerms).not.toContain("manageAssignments");
  });

  test("STUDENT CANNOT crudUsers (admin permission)", () => {
    expect(studentPerms).not.toContain("crudUsers");
  });
});

describe("Role Matrix — TEACHER permissions", () => {
  const teacherPerms = roleMatrix["TEACHER"]?.can ?? [];

  test("TEACHER can manageAssignments", () => {
    expect(teacherPerms).toContain("manageAssignments");
  });

  test("TEACHER can manageQuizzes", () => {
    expect(teacherPerms).toContain("manageQuizzes");
  });

  test("TEACHER can aiTutor", () => {
    expect(teacherPerms).toContain("aiTutor");
  });

  test("TEACHER CANNOT crudUsers (admin permission)", () => {
    expect(teacherPerms).not.toContain("crudUsers");
  });

  test("TEACHER CANNOT crudSchools (superadmin permission)", () => {
    expect(teacherPerms).not.toContain("crudSchools");
  });
});

describe("Role Matrix — ADMIN permissions", () => {
  const adminPerms = roleMatrix["ADMIN"]?.can ?? [];

  test("ADMIN can crudUsers", () => {
    expect(adminPerms).toContain("crudUsers");
  });

  test("ADMIN can crudClasses", () => {
    expect(adminPerms).toContain("crudClasses");
  });

  test("ADMIN can branding", () => {
    expect(adminPerms).toContain("branding");
  });
});

describe("Role Matrix — SUPERADMIN permissions", () => {
  const saPerms = roleMatrix["SUPERADMIN"]?.can ?? [];

  test("SUPERADMIN can crudSchools", () => {
    expect(saPerms).toContain("crudSchools");
  });

  test("SUPERADMIN can aiControls", () => {
    expect(saPerms).toContain("aiControls");
  });

  test("SUPERADMIN can analytics", () => {
    expect(saPerms).toContain("analytics");
  });
});

describe("Role Matrix — PARENT permissions", () => {
  const parentPerms = roleMatrix["PARENT"]?.can ?? [];

  test("PARENT can leaderboard", () => {
    expect(parentPerms).toContain("leaderboard");
  });

  test("PARENT CANNOT manageAssignments", () => {
    expect(parentPerms).not.toContain("manageAssignments");
  });

  test("PARENT CANNOT crudUsers", () => {
    expect(parentPerms).not.toContain("crudUsers");
  });
});
