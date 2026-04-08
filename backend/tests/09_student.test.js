// tests/09_student.test.js
// Student routes: assignments, quizzes, workspaces, results, leaderboard
import request from "supertest";
import app from "./helpers/app.js";
import { connectTestDB, disconnectTestDB, clearAllCollections } from "./helpers/db.js";
import {
  createStudent,
  createTeacher,
  createAdmin,
  authHeader,
} from "./helpers/factory.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

describe("Student Routes — Access Control", () => {
  test("GET /api/students/assignments returns 200 for STUDENT", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/students/assignments").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/students/assignments TEACHER gets 403", async () => {
    const { token } = await createTeacher();
    const res = await request(app).get("/api/students/assignments").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/students/assignments ADMIN gets 403", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/students/assignments").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/students/assignments without auth returns 401", async () => {
    const res = await request(app).get("/api/students/assignments");
    expect(res.status).toBe(401);
  });
});

describe("Student Routes — Quizzes", () => {
  test("GET /api/students/quizzes returns 200 for STUDENT", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/students/quizzes").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/students/quizzes TEACHER gets 403", async () => {
    const { token } = await createTeacher();
    const res = await request(app).get("/api/students/quizzes").set(authHeader(token));
    expect(res.status).toBe(403);
  });
});

describe("Student Routes — Workspaces", () => {
  test("GET /api/students/workspaces returns 200 for STUDENT", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/students/workspaces").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/students/workspaces TEACHER gets 403", async () => {
    const { token } = await createTeacher();
    const res = await request(app).get("/api/students/workspaces").set(authHeader(token));
    expect(res.status).toBe(403);
  });
});

describe("Student Routes — Results & Leaderboard", () => {
  test("GET /api/students/results returns 200 for STUDENT", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/students/results").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/students/leaderboard returns 200 for STUDENT", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/students/leaderboard").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/students/leaderboard without auth returns 401", async () => {
    const res = await request(app).get("/api/students/leaderboard");
    expect(res.status).toBe(401);
  });
});

describe("Student Routes — Quiz Lifecycle", () => {
  test("POST /api/students/quizzes/:id/start STUDENT gets non-403 for nonexistent quiz", async () => {
    const { token } = await createStudent();
    const fakeId = "64aaaaaaaaaaaaaaaaaaaa10";
    const res = await request(app)
      .post(`/api/students/quizzes/${fakeId}/start`)
      .set(authHeader(token));
    // Access passes (not 403), but quiz not found (404)
    expect(res.status).not.toBe(403);
  });

  test("POST /api/students/quizzes/:id/start TEACHER gets 403", async () => {
    const { token } = await createTeacher();
    const fakeId = "64aaaaaaaaaaaaaaaaaaaa10";
    const res = await request(app)
      .post(`/api/students/quizzes/${fakeId}/start`)
      .set(authHeader(token));
    expect(res.status).toBe(403);
  });
});

describe("Student Routes — Assignment Submission", () => {
  test("POST /api/students/assignments/submit TEACHER gets 403", async () => {
    const { token } = await createTeacher();
    const res = await request(app)
      .post("/api/students/assignments/submit")
      .set(authHeader(token))
      .send({ assignmentId: "64aaaaaaaaaaaaaaaaaaaa11", textSubmission: "My answer" });
    expect(res.status).toBe(403);
  });

  test("POST /api/students/assignments/submit without auth returns 401", async () => {
    const res = await request(app)
      .post("/api/students/assignments/submit")
      .send({ assignmentId: "64aaaaaaaaaaaaaaaaaaaa11" });
    expect(res.status).toBe(401);
  });
});
