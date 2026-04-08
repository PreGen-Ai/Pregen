// tests/03_rbac.test.js
// Role-based access control: verify all role gates enforce correctly
import request from "supertest";
import app from "./helpers/app.js";
import { connectTestDB, disconnectTestDB, clearAllCollections } from "./helpers/db.js";
import {
  createStudent,
  createTeacher,
  createAdmin,
  createSuperAdmin,
  createParent,
  authHeader,
} from "./helpers/factory.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

describe("Role gates — /api/users role-test routes", () => {
  test("GET /api/users/super-admin: SUPERADMIN gets 200", async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app).get("/api/users/super-admin").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/users/super-admin: ADMIN gets 403", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/users/super-admin").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/users/super-admin: STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/users/super-admin").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/users/admin: ADMIN gets 200", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/users/admin").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/users/admin: SUPERADMIN gets 200", async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app).get("/api/users/admin").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/users/admin: STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/users/admin").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/users/teacher: TEACHER gets 200", async () => {
    const { token } = await createTeacher();
    const res = await request(app).get("/api/users/teacher").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/users/teacher: ADMIN gets 200 (elevated)", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/users/teacher").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/users/teacher: STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/users/teacher").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/users/student: STUDENT gets 200", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/users/student").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/users/student: TEACHER gets 403", async () => {
    const { token } = await createTeacher();
    const res = await request(app).get("/api/users/student").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/users/parent: PARENT gets 200", async () => {
    const { token } = await createParent();
    const res = await request(app).get("/api/users/parent").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/users/parent: STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/users/parent").set(authHeader(token));
    expect(res.status).toBe(403);
  });
});

describe("Role gates — Admin user list (ADMIN only)", () => {
  test("GET /api/users/users: ADMIN gets 200", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/users/users").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/users/users: SUPERADMIN gets 200", async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app).get("/api/users/users").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/users/users: STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/users/users").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/users/users: TEACHER gets 403", async () => {
    const { token } = await createTeacher();
    const res = await request(app).get("/api/users/users").set(authHeader(token));
    expect(res.status).toBe(403);
  });
});

describe("Role gates — SuperAdmin all users list", () => {
  test("GET /api/users/all: SUPERADMIN gets 200", async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app).get("/api/users/all").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/users/all: ADMIN gets 403", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/users/all").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/users/all: unauthenticated gets 401", async () => {
    const res = await request(app).get("/api/users/all");
    expect(res.status).toBe(401);
  });
});

describe("Role normalization — legacy role strings", () => {
  test("User created with role SUPERADMIN normalizes from super_admin via hook", async () => {
    // The normalizeRole function should accept super_admin and map to SUPERADMIN
    const { user } = await createSuperAdmin();
    expect(["SUPERADMIN", "superadmin"].map(r => r.toLowerCase())).toContain(
      user.role.toLowerCase()
    );
  });
});
