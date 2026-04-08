// tests/07_gradebook.test.js
// Gradebook: student sees own, teacher sees all, grading updates
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

describe("Gradebook — Read Access", () => {
  test("GET /api/gradebook returns 200 for STUDENT", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/gradebook").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/gradebook returns 200 for TEACHER", async () => {
    const { token } = await createTeacher();
    const res = await request(app).get("/api/gradebook").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/gradebook returns 200 for ADMIN", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/gradebook").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/gradebook returns 401 without auth", async () => {
    const res = await request(app).get("/api/gradebook");
    expect(res.status).toBe(401);
  });

  test("GET /api/gradebook response is JSON", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/gradebook").set(authHeader(token));
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});

describe("Gradebook — Grade Update (Teacher+)", () => {
  test("PATCH /api/gradebook/submissions/:id STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const fakeId = "64aaaaaaaaaaaaaaaaaaaa05";
    const res = await request(app)
      .patch(`/api/gradebook/submissions/${fakeId}`)
      .set(authHeader(token))
      .send({ score: 85, feedback: "Good job" });
    expect(res.status).toBe(403);
  });

  test("PATCH /api/gradebook/submissions/:id nonexistent returns 404 for TEACHER", async () => {
    const { token } = await createTeacher();
    const fakeId = "64aaaaaaaaaaaaaaaaaaaa05";
    const res = await request(app)
      .patch(`/api/gradebook/submissions/${fakeId}`)
      .set(authHeader(token))
      .send({ score: 85, feedback: "Good job" });
    expect([404, 400]).toContain(res.status);
  });

  test("PATCH /api/gradebook/quiz-attempts/:id STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const fakeId = "64aaaaaaaaaaaaaaaaaaaa06";
    const res = await request(app)
      .patch(`/api/gradebook/quiz-attempts/${fakeId}`)
      .set(authHeader(token))
      .send({ score: 90 });
    expect(res.status).toBe(403);
  });

  test("PATCH /api/gradebook/quiz-attempts/:id nonexistent returns 404 for TEACHER", async () => {
    const { token } = await createTeacher();
    const fakeId = "64aaaaaaaaaaaaaaaaaaaa06";
    const res = await request(app)
      .patch(`/api/gradebook/quiz-attempts/${fakeId}`)
      .set(authHeader(token))
      .send({ score: 90 });
    expect([404, 400]).toContain(res.status);
  });

  test("PATCH /api/gradebook/submissions/:id ADMIN returns non-403", async () => {
    const { token } = await createAdmin();
    const fakeId = "64aaaaaaaaaaaaaaaaaaaa07";
    const res = await request(app)
      .patch(`/api/gradebook/submissions/${fakeId}`)
      .set(authHeader(token))
      .send({ score: 75, feedback: "Adequate" });
    // Should pass auth check (not 403) but may 404
    expect(res.status).not.toBe(403);
  });
});
