// tests/10_admin.test.js
// Admin panel: dashboard, users, classes, subjects, branding, AI settings
import request from "supertest";
import app from "./helpers/app.js";
import { connectTestDB, disconnectTestDB, clearAllCollections } from "./helpers/db.js";
import {
  createStudent,
  createTeacher,
  createAdmin,
  createSuperAdmin,
  authHeader,
} from "./helpers/factory.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

describe("Admin Panel — Dashboard", () => {
  test("GET /api/admin/dashboard ADMIN returns 200", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/admin/dashboard").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/admin/dashboard SUPERADMIN returns 200", async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app).get("/api/admin/dashboard").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/admin/dashboard STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/admin/dashboard").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/admin/dashboard TEACHER gets 403", async () => {
    const { token } = await createTeacher();
    const res = await request(app).get("/api/admin/dashboard").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/admin/dashboard without auth returns 401", async () => {
    const res = await request(app).get("/api/admin/dashboard");
    expect(res.status).toBe(401);
  });
});

describe("Admin Panel — Users", () => {
  test("GET /api/admin/users ADMIN returns 200", async () => {
    const { token } = await createAdmin();
    await createStudent();
    const res = await request(app).get("/api/admin/users").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/admin/users STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/admin/users").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/admin/users supports pagination params", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .get("/api/admin/users?limit=10&page=1")
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/admin/users supports role filter", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .get("/api/admin/users?role=STUDENT")
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/admin/users supports status filter", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .get("/api/admin/users?status=active")
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("POST /api/admin/users/create ADMIN can create user", async () => {
    const { token } = await createAdmin();
    const ts = Date.now();
    const res = await request(app)
      .post("/api/admin/users/create")
      .set(authHeader(token))
      .send({
        username: `admin_created_${ts}`,
        email: `admin_created_${ts}@test.com`,
        password: "Password1!",
        role: "STUDENT",
        tenantId: "tenant_test",
      });
    expect([200, 201]).toContain(res.status);
  });

  test("PATCH /api/admin/users/:id/status ADMIN can toggle status", async () => {
    const { user: student } = await createStudent();
    const { token } = await createAdmin();
    const res = await request(app)
      .patch(`/api/admin/users/${student._id}/status`)
      .set(authHeader(token))
      .send({ disabled: true });
    expect([200, 204]).toContain(res.status);
  });

  test("PATCH /api/admin/users/:id/role ADMIN can change role", async () => {
    const { user: student } = await createStudent();
    const { token } = await createAdmin();
    const res = await request(app)
      .patch(`/api/admin/users/${student._id}/role`)
      .set(authHeader(token))
      .send({ role: "TEACHER" });
    expect([200, 204]).toContain(res.status);
  });

  test("POST /api/admin/users/:id/reset-password ADMIN can reset password", async () => {
    const { user: student } = await createStudent();
    const { token } = await createAdmin();
    const res = await request(app)
      .post(`/api/admin/users/${student._id}/reset-password`)
      .set(authHeader(token));
    expect([200, 204]).toContain(res.status);
  });
});

describe("Admin Panel — Classes", () => {
  test("GET /api/admin/classes ADMIN returns 200", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/admin/classes").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/admin/classes STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/admin/classes").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("POST /api/admin/classes ADMIN can create class", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .post("/api/admin/classes")
      .set(authHeader(token))
      .send({ name: "Grade 10A", tenantId: "tenant_test" });
    expect([200, 201]).toContain(res.status);
  });
});

describe("Admin Panel — Subjects", () => {
  test("GET /api/admin/subjects ADMIN returns 200", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/admin/subjects").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("POST /api/admin/subjects ADMIN can create subject", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .post("/api/admin/subjects")
      .set(authHeader(token))
      .send({ name: "Mathematics", tenantId: "tenant_test" });
    expect([200, 201]).toContain(res.status);
  });
});

describe("Admin Panel — Branding", () => {
  test("GET /api/admin/branding ADMIN returns 200", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/admin/branding").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("PUT /api/admin/branding ADMIN can update branding", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .put("/api/admin/branding")
      .set(authHeader(token))
      .send({ primaryColor: "#FF5733", institutionName: "Test School" });
    expect([200, 204]).toContain(res.status);
  });

  test("GET /api/admin/branding STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/admin/branding").set(authHeader(token));
    expect(res.status).toBe(403);
  });
});

describe("Admin Panel — AI Settings", () => {
  test("GET /api/admin/ai/settings ADMIN returns 200", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/admin/ai/settings").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("PUT /api/admin/ai/settings ADMIN can update AI settings", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .put("/api/admin/ai/settings")
      .set(authHeader(token))
      .send({
        enabled: true,
        feedbackTone: "encouraging",
        features: { aiGrading: true, aiQuizGen: true, aiTutor: true, aiSummaries: false },
      });
    expect([200, 204]).toContain(res.status);
  });

  test("GET /api/admin/ai/settings STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/admin/ai/settings").set(authHeader(token));
    expect(res.status).toBe(403);
  });
});
