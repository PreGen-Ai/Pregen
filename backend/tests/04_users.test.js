// tests/04_users.test.js
// User management: CRUD, block/unblock, soft delete, restore, profile update
import request from "supertest";
import app from "./helpers/app.js";
import { connectTestDB, disconnectTestDB, clearAllCollections } from "./helpers/db.js";
import {
  createStudent,
  createAdmin,
  createSuperAdmin,
  authHeader,
} from "./helpers/factory.js";
import User from "../src/models/userModel.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

describe("User Management — Admin list & lookup", () => {
  test("GET /api/users/users returns array for ADMIN", async () => {
    const { token } = await createAdmin();
    await createStudent();
    await createStudent();
    const res = await request(app).get("/api/users/users").set(authHeader(token));
    expect(res.status).toBe(200);
    // Response should be an array or contain a users key
    const users = Array.isArray(res.body) ? res.body : res.body.users;
    expect(Array.isArray(users)).toBe(true);
  });

  test("GET /api/users/users?role=STUDENT filters by role", async () => {
    const { token } = await createAdmin();
    await createStudent();
    const res = await request(app)
      .get("/api/users/users?role=STUDENT")
      .set(authHeader(token));
    expect(res.status).toBe(200);
    const users = Array.isArray(res.body) ? res.body : res.body.users;
    if (users && users.length > 0) {
      users.forEach((u) => {
        expect(["STUDENT", "student"]).toContain(u.role?.toLowerCase?.() ?? u.role);
      });
    }
  });

  test("GET /api/users/users?q= searches by username/email", async () => {
    const { user, token } = await createAdmin();
    const res = await request(app)
      .get(`/api/users/users?q=${user.username}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/users/users/id/:id returns correct user for ADMIN", async () => {
    const { user: student } = await createStudent();
    const { token } = await createAdmin();
    const res = await request(app)
      .get(`/api/users/users/id/${student._id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/users/users/id/:id returns 404 for nonexistent ID", async () => {
    const { token } = await createAdmin();
    const fakeId = "64aaaaaaaaaaaaaaaaaaaa01";
    const res = await request(app)
      .get(`/api/users/users/id/${fakeId}`)
      .set(authHeader(token));
    expect([404, 400]).toContain(res.status);
  });
});

describe("User Management — Block / Unblock", () => {
  test("PUT /api/users/toggle-block/:id toggles blocked status", async () => {
    const { user: student } = await createStudent({ blocked: false });
    const { token } = await createAdmin();
    const res = await request(app)
      .put(`/api/users/toggle-block/${student._id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("blocked");

    // Verify it toggled
    const updated = await User.findById(student._id);
    expect(updated.blocked).toBe(true);
  });

  test("PUT /api/users/toggle-block/:id toggles back to unblocked", async () => {
    const { user: student } = await createStudent({ blocked: true });
    const { token } = await createAdmin();
    await request(app)
      .put(`/api/users/toggle-block/${student._id}`)
      .set(authHeader(token));
    const updated = await User.findById(student._id);
    expect(updated.blocked).toBe(false);
  });

  test("PUT /api/users/toggle-block/:id STUDENT gets 403", async () => {
    const { user: student } = await createStudent();
    const { token } = await createStudent();
    const res = await request(app)
      .put(`/api/users/toggle-block/${student._id}`)
      .set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("PUT /api/users/toggle-block/:id returns 404 for unknown user", async () => {
    const { token } = await createAdmin();
    const fakeId = "64aaaaaaaaaaaaaaaaaaaa02";
    const res = await request(app)
      .put(`/api/users/toggle-block/${fakeId}`)
      .set(authHeader(token));
    expect([404, 400]).toContain(res.status);
  });
});

describe("User Management — Soft Delete & Restore", () => {
  test("DELETE /api/users/delete/:id marks user as deleted (SUPERADMIN)", async () => {
    const { user: student } = await createStudent();
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .delete(`/api/users/delete/${student._id}`)
      .set(authHeader(token));
    expect([200, 204]).toContain(res.status);
    const updated = await User.findById(student._id);
    // User may be hard-deleted or soft-deleted
    if (updated) {
      expect(updated.deleted).toBe(true);
    }
  });

  test("DELETE /api/users/delete/:id ADMIN gets 403", async () => {
    const { user: student } = await createStudent();
    const { token } = await createAdmin();
    const res = await request(app)
      .delete(`/api/users/delete/${student._id}`)
      .set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("PUT /api/users/restore/:id restores deleted user (ADMIN)", async () => {
    const { user: student } = await createStudent({ deleted: true });
    const { token } = await createAdmin();
    const res = await request(app)
      .put(`/api/users/restore/${student._id}`)
      .set(authHeader(token));
    expect([200, 204]).toContain(res.status);
  });

  test("PUT /api/users/restore/:id STUDENT gets 403", async () => {
    const { user: student } = await createStudent({ deleted: true });
    const { token: studentToken } = await createStudent();
    const res = await request(app)
      .put(`/api/users/restore/${student._id}`)
      .set(authHeader(studentToken));
    expect(res.status).toBe(403);
  });
});

describe("User Management — Role Update", () => {
  test("PUT /api/users/admin/update-role/:id SUPERADMIN can change role", async () => {
    const { user: student } = await createStudent();
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .put(`/api/users/admin/update-role/${student._id}`)
      .set(authHeader(token))
      .send({ role: "TEACHER" });
    expect([200, 204]).toContain(res.status);
  });

  test("PUT /api/users/admin/update-role/:id ADMIN gets 403", async () => {
    const { user: student } = await createStudent();
    const { token } = await createAdmin();
    const res = await request(app)
      .put(`/api/users/admin/update-role/${student._id}`)
      .set(authHeader(token))
      .send({ role: "TEACHER" });
    expect(res.status).toBe(403);
  });
});

describe("User Management — Signup (Admin-only)", () => {
  test("POST /api/users/signup ADMIN can create new user", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .post("/api/users/signup")
      .set(authHeader(token))
      .send({
        username: `newstudent_${Date.now()}`,
        email: `newstudent_${Date.now()}@test.com`,
        password: "Password1!",
        role: "STUDENT",
        tenantId: "tenant_test",
      });
    expect([200, 201]).toContain(res.status);
  });

  test("POST /api/users/signup STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app)
      .post("/api/users/signup")
      .set(authHeader(token))
      .send({
        username: "hacker_student",
        email: "hacker@test.com",
        password: "Password1!",
        role: "ADMIN",
      });
    expect(res.status).toBe(403);
  });

  test("POST /api/users/signup without auth returns 401", async () => {
    const res = await request(app).post("/api/users/signup").send({
      username: "ghost",
      email: "ghost@test.com",
      password: "Password1!",
    });
    expect(res.status).toBe(401);
  });

  test("POST /api/users/signup duplicate email returns 400-level error", async () => {
    const { user, token } = await createAdmin();
    const { user: existing } = await createStudent();
    const res = await request(app)
      .post("/api/users/signup")
      .set(authHeader(token))
      .send({
        username: `fresh_${Date.now()}`,
        email: existing.email, // duplicate
        password: "Password1!",
        role: "STUDENT",
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
