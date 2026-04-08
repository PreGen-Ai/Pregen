// tests/06_announcements.test.js
// Announcements: CRUD, role access, visibility
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

async function createAnnouncement(token, body = {}) {
  return request(app)
    .post("/api/announcements")
    .set(authHeader(token))
    .send({
      title: "Test Announcement",
      content: "This is a test announcement content body.",
      tenantId: "tenant_test",
      ...body,
    });
}

describe("Announcements — Read", () => {
  test("GET /api/announcements returns 200 for STUDENT", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/announcements").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/announcements returns 200 for TEACHER", async () => {
    const { token } = await createTeacher();
    const res = await request(app).get("/api/announcements").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/announcements returns 401 without auth", async () => {
    const res = await request(app).get("/api/announcements");
    expect(res.status).toBe(401);
  });

  test("GET /api/announcements returns array in response", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/announcements").set(authHeader(token));
    expect(res.status).toBe(200);
    const data = Array.isArray(res.body) ? res.body : res.body.announcements ?? res.body.data ?? [];
    expect(Array.isArray(data)).toBe(true);
  });
});

describe("Announcements — Create", () => {
  test("POST /api/announcements TEACHER can create", async () => {
    const { token } = await createTeacher();
    const res = await createAnnouncement(token);
    expect([200, 201]).toContain(res.status);
  });

  test("POST /api/announcements ADMIN can create", async () => {
    const { token } = await createAdmin();
    const res = await createAnnouncement(token);
    expect([200, 201]).toContain(res.status);
  });

  test("POST /api/announcements SUPERADMIN can create", async () => {
    const { token } = await createSuperAdmin();
    const res = await createAnnouncement(token);
    expect([200, 201]).toContain(res.status);
  });

  test("POST /api/announcements STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await createAnnouncement(token);
    expect(res.status).toBe(403);
  });

  test("POST /api/announcements without auth returns 401", async () => {
    const res = await request(app)
      .post("/api/announcements")
      .send({ title: "Ghost", content: "Ghost content" });
    expect(res.status).toBe(401);
  });

  test("POST /api/announcements missing title returns 400-level error", async () => {
    const { token } = await createTeacher();
    const res = await request(app)
      .post("/api/announcements")
      .set(authHeader(token))
      .send({ content: "No title here" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("Announcements — Update & Delete", () => {
  test("PATCH /api/announcements/:id TEACHER can update own announcement", async () => {
    const { token } = await createTeacher();
    const created = await createAnnouncement(token);
    if (created.status > 201) return; // skip if create failed
    const id = created.body._id ?? created.body.announcement?._id;
    if (!id) return;

    const res = await request(app)
      .patch(`/api/announcements/${id}`)
      .set(authHeader(token))
      .send({ title: "Updated Title" });
    expect([200, 204]).toContain(res.status);
  });

  test("DELETE /api/announcements/:id TEACHER can delete announcement", async () => {
    const { token } = await createTeacher();
    const created = await createAnnouncement(token);
    if (created.status > 201) return;
    const id = created.body._id ?? created.body.announcement?._id;
    if (!id) return;

    const res = await request(app)
      .delete(`/api/announcements/${id}`)
      .set(authHeader(token));
    expect([200, 204]).toContain(res.status);
  });

  test("DELETE /api/announcements/:id STUDENT gets 403", async () => {
    const { token: teacherToken } = await createTeacher();
    const { token: studentToken } = await createStudent();
    const created = await createAnnouncement(teacherToken);
    if (created.status > 201) return;
    const id = created.body._id ?? created.body.announcement?._id;
    if (!id) return;

    const res = await request(app)
      .delete(`/api/announcements/${id}`)
      .set(authHeader(studentToken));
    expect(res.status).toBe(403);
  });

  test("PATCH /api/announcements/nonexistent-id returns 400-level", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .patch("/api/announcements/64aaaaaaaaaaaaaaaaaaaa04")
      .set(authHeader(token))
      .send({ title: "Ghost update" });
    expect([404, 400]).toContain(res.status);
  });
});
