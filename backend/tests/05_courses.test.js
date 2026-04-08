// tests/05_courses.test.js
// Courses: CRUD, visibility, archival, enrollment, tenant isolation
import request from "supertest";
import app from "./helpers/app.js";
import { connectTestDB, disconnectTestDB, clearAllCollections } from "./helpers/db.js";
import {
  createStudent,
  createTeacher,
  createAdmin,
  createSuperAdmin,
  createCourse,
  authHeader,
} from "./helpers/factory.js";
import Course from "../src/models/CourseModel.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

describe("Courses — List & Read", () => {
  test("GET /api/courses returns 200 for authenticated user", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/courses").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/courses returns 401 without auth", async () => {
    const res = await request(app).get("/api/courses");
    expect(res.status).toBe(401);
  });

  test("GET /api/courses/public/list returns 200 without auth", async () => {
    const res = await request(app).get("/api/courses/public/list");
    expect(res.status).toBe(200);
  });

  test("GET /api/courses/my-courses/list returns 200 for authenticated user", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/courses/my-courses/list").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/courses/search/list returns 200 with query", async () => {
    const { token } = await createStudent();
    const res = await request(app)
      .get("/api/courses/search/list?q=math")
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/courses/:id returns correct course", async () => {
    const { user: admin, token } = await createAdmin();
    const course = await createCourse(admin);
    const res = await request(app)
      .get(`/api/courses/${course._id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/courses/:id returns 404 for nonexistent course", async () => {
    const { token } = await createStudent();
    const fakeId = "64aaaaaaaaaaaaaaaaaaaa03";
    const res = await request(app)
      .get(`/api/courses/${fakeId}`)
      .set(authHeader(token));
    expect([404, 400]).toContain(res.status);
  });
});

describe("Courses — Create", () => {
  test("POST /api/courses ADMIN can create course", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .post("/api/courses")
      .set(authHeader(token))
      .send({
        title: "Biology 101",
        description: "Intro to biology",
        type: "course",
        visibility: "private",
        tenantId: "tenant_test",
      });
    expect([200, 201]).toContain(res.status);
    expect(res.body.title || res.body.course?.title).toMatch(/Biology/i);
  });

  test("POST /api/courses STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app)
      .post("/api/courses")
      .set(authHeader(token))
      .send({ title: "Hacked Course", type: "course" });
    expect(res.status).toBe(403);
  });

  test("POST /api/courses TEACHER gets 403 (only ADMIN can create)", async () => {
    const { token } = await createTeacher();
    const res = await request(app)
      .post("/api/courses")
      .set(authHeader(token))
      .send({ title: "Teacher Course", type: "course" });
    expect(res.status).toBe(403);
  });

  test("POST /api/courses without title returns 400-level error", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .post("/api/courses")
      .set(authHeader(token))
      .send({ type: "course" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("Courses — Archive", () => {
  test("PATCH /api/courses/:id/archive ADMIN can archive course", async () => {
    const { user: admin, token } = await createAdmin();
    const course = await createCourse(admin);
    const res = await request(app)
      .patch(`/api/courses/${course._id}/archive`)
      .set(authHeader(token))
      .send({ archived: true });
    expect([200, 204]).toContain(res.status);
    const updated = await Course.findById(course._id);
    expect(updated.archived).toBe(true);
  });

  test("PATCH /api/courses/:id/archive STUDENT gets 403", async () => {
    const { user: admin } = await createAdmin();
    const { token: studentToken } = await createStudent();
    const course = await createCourse(admin);
    const res = await request(app)
      .patch(`/api/courses/${course._id}/archive`)
      .set(authHeader(studentToken))
      .send({ archived: true });
    expect([403, 401]).toContain(res.status);
  });
});

describe("Courses — Delete", () => {
  test("DELETE /api/courses/:id ADMIN can delete course", async () => {
    const { user: admin, token } = await createAdmin();
    const course = await createCourse(admin);
    const res = await request(app)
      .delete(`/api/courses/${course._id}`)
      .set(authHeader(token));
    expect([200, 204]).toContain(res.status);
  });

  test("DELETE /api/courses/:id STUDENT gets 403", async () => {
    const { user: admin } = await createAdmin();
    const { token: studentToken } = await createStudent();
    const course = await createCourse(admin);
    const res = await request(app)
      .delete(`/api/courses/${course._id}`)
      .set(authHeader(studentToken));
    expect(res.status).toBe(403);
  });
});

describe("Courses — Tenant isolation", () => {
  test("Courses from tenantA are not accessible to tenantB admin", async () => {
    const { user: adminA, token: tokenA } = await createAdmin({ tenantId: "tenant_A" });
    const { token: tokenB } = await createAdmin({ tenantId: "tenant_B" });
    const courseA = await createCourse(adminA, { tenantId: "tenant_A" });

    // TenantB admin listing should not see tenantA courses
    const res = await request(app).get("/api/courses").set(authHeader(tokenB));
    expect(res.status).toBe(200);
    const courses = Array.isArray(res.body) ? res.body : res.body.courses ?? [];
    const found = courses.some((c) => String(c._id) === String(courseA._id));
    // Tenant isolation should prevent this
    expect(found).toBe(false);
  });
});

describe("Courses — Course by User", () => {
  test("GET /api/courses/user/:userId returns courses for that user", async () => {
    const { user: admin, token } = await createAdmin();
    await createCourse(admin);
    const res = await request(app)
      .get(`/api/courses/user/${admin._id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });
});
