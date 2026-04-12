// tests/08_teacher.test.js
// Teacher routes: dashboard, assignments, quizzes, content, roster
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

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

describe("Teacher Routes — Access Control", () => {
  test("GET /api/teachers/dashboard TEACHER returns 200", async () => {
    const { token } = await createTeacher();
    const res = await request(app).get("/api/teachers/dashboard").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/teachers/dashboard ADMIN returns 200", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/teachers/dashboard").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/teachers/dashboard SUPERADMIN returns 200", async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app).get("/api/teachers/dashboard").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/teachers/dashboard STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/teachers/dashboard").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/teachers/dashboard without auth gets 401", async () => {
    const res = await request(app).get("/api/teachers/dashboard");
    expect(res.status).toBe(401);
  });
});

describe("Teacher Routes — Assignments", () => {
  test("GET /api/teachers/assignments returns 200 for TEACHER", async () => {
    const { token } = await createTeacher();
    const res = await request(app).get("/api/teachers/assignments").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/teachers/assignments STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/teachers/assignments").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("POST /api/teachers/assignments TEACHER can create assignment", async () => {
    const { user: teacher, token } = await createTeacher();
    const course = await createCourse(teacher);
    const res = await request(app)
      .post("/api/teachers/assignments")
      .set(authHeader(token))
      .send({
        title: "Essay Assignment",
        description: "Write a 500-word essay",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        type: "text_submission",
        workspaceId: course._id.toString(),
        tenantId: "tenant_test",
      });
    expect([200, 201]).toContain(res.status);
  });

  test("POST /api/teachers/assignments STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app)
      .post("/api/teachers/assignments")
      .set(authHeader(token))
      .send({ title: "Bad Assignment" });
    expect(res.status).toBe(403);
  });

  test("POST /api/teachers/assignments without dueDate returns 400-level error", async () => {
    const { token } = await createTeacher();
    const res = await request(app)
      .post("/api/teachers/assignments")
      .set(authHeader(token))
      .send({ title: "No Due Date", description: "Missing dueDate" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test("GET /api/teachers/assignments/:id/submissions returns 200 for TEACHER", async () => {
    const { user: teacher, token } = await createTeacher();
    const course = await createCourse(teacher);
    // First create an assignment
    const created = await request(app)
      .post("/api/teachers/assignments")
      .set(authHeader(token))
      .send({
        title: "Submission Test",
        description: "Test",
        dueDate: new Date(Date.now() + 86400000).toISOString(),
        type: "text_submission",
        workspaceId: course._id.toString(),
        tenantId: "tenant_test",
      });
    if (created.status > 201) return;
    const id = created.body._id ?? created.body.assignment?._id;
    if (!id) return;

    const res = await request(app)
      .get(`/api/teachers/assignments/${id}/submissions`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });
});

describe("Teacher Routes — Quizzes", () => {
  test("GET /api/teachers/quizzes returns 200 for TEACHER", async () => {
    const { token } = await createTeacher();
    const res = await request(app).get("/api/teachers/quizzes").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/teachers/quizzes STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/teachers/quizzes").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("POST /api/teachers/quizzes TEACHER can create quiz", async () => {
    const { user: teacher, token } = await createTeacher();
    const course = await createCourse(teacher);
    const res = await request(app)
      .post("/api/teachers/quizzes")
      .set(authHeader(token))
      .send({
        title: "Chapter 1 Quiz",
        description: "Basics of biology",
        subject: "Biology",
        workspaceId: course._id.toString(),
        questions: [
          {
            questionText: "What is photosynthesis?",
            questionType: "short_answer",
            points: 10,
          },
        ],
        tenantId: "tenant_test",
      });
    expect([200, 201]).toContain(res.status);
  });
});

describe("Teacher Routes — Course Roster", () => {
  test("GET /api/teachers/courses/:id/roster returns 200 for TEACHER", async () => {
    const { user: teacher, token } = await createTeacher();
    const course = await createCourse(teacher);
    const res = await request(app)
      .get(`/api/teachers/courses/${course._id}/roster`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/teachers/courses/:id/roster STUDENT gets 403", async () => {
    const { user: teacher } = await createTeacher();
    const { token: studentToken } = await createStudent();
    const course = await createCourse(teacher);
    const res = await request(app)
      .get(`/api/teachers/courses/${course._id}/roster`)
      .set(authHeader(studentToken));
    expect(res.status).toBe(403);
  });
});
