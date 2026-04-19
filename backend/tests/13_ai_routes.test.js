import request from "supertest";
import app from "./helpers/app.js";
import {
  connectTestDB,
  disconnectTestDB,
  clearAllCollections,
} from "./helpers/db.js";
import {
  createStudent,
  createTeacher,
  createAdmin,
  createParent,
  authHeader,
} from "./helpers/factory.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

describe("AI Routes - Access Control", () => {
  const aiEndpoints = [
    { method: "post", path: "/api/ai/quiz/generate" },
    { method: "post", path: "/api/ai/grade-quiz" },
    { method: "post", path: "/api/ai/grade-question" },
    { method: "get", path: "/api/ai/grade/health" },
    { method: "post", path: "/api/ai/assignments/generate" },
    { method: "post", path: "/api/ai/tutor/session/fake-session-id" },
    { method: "post", path: "/api/ai/tutor/material/fake-session-id" },
    { method: "post", path: "/api/ai/tutor/chat" },
    { method: "post", path: "/api/ai/learning/explanation" },
  ];

  for (const { method, path, teacherDenied = false } of aiEndpoints) {
    test(`${method.toUpperCase()} ${path} unauthenticated gets 401`, async () => {
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(401);
    });

    test(`${method.toUpperCase()} ${path} parent gets 403`, async () => {
      const { token } = await createParent();
      const res = await request(app)
        [method](path)
        .set(authHeader(token))
        .send({});
      expect(res.status).toBe(403);
    });

    test(`${method.toUpperCase()} ${path} student passes auth`, async () => {
      const { token } = await createStudent();
      const res = await request(app)
        [method](path)
        .set(authHeader(token))
        .send({});
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    test(`${method.toUpperCase()} ${path} teacher role gate`, async () => {
      const { token } = await createTeacher();
      const res = await request(app)
        [method](path)
        .set(authHeader(token))
        .send({});

      if (teacherDenied) {
        expect(res.status).toBe(403);
      } else {
        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(401);
      }
    });
  }
});

describe("AI Routes - Reports Access Control", () => {
  const reportRoutes = [
    { method: "post", path: "/api/ai/reports/student" },
    { method: "post", path: "/api/ai/reports/progress" },
    { method: "get", path: "/api/ai/reports/status/fake-report-id" },
  ];

  for (const { method, path } of reportRoutes) {
    test(`${method.toUpperCase()} ${path} student passes auth`, async () => {
      const { token } = await createStudent();
      const res = await request(app)
        [method](path)
        .set(authHeader(token))
        .send({});
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    test(`${method.toUpperCase()} ${path} unauthenticated gets 401`, async () => {
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(401);
    });
  }
});

describe("AI Routes - AI Usage Logging", () => {
  test("POST /api/ai-usage student can log AI usage", async () => {
    const { token } = await createStudent();
    const res = await request(app)
      .post("/api/ai-usage")
      .set(authHeader(token))
      .send({
        operation: "quiz_generation",
        tokensUsed: 1500,
        model: "gemini-pro",
        tenantId: "tenant_test",
      });
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  test("GET /api/ai-usage admin returns usage list", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/ai-usage").set(authHeader(token));
    expect(res.status).not.toBe(403);
  });

  test("GET /api/ai-usage student gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/ai-usage").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/ai-usage/summary admin returns summary", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .get("/api/ai-usage/summary")
      .set(authHeader(token));
    expect(res.status).not.toBe(403);
  });

  test("DELETE /api/ai-usage/bulk admin still gets 403", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .delete("/api/ai-usage/bulk")
      .set(authHeader(token))
      .send({ ids: [] });
    expect(res.status).toBe(403);
  });
});

describe("AI Routes - Quiz Routes", () => {
  test("GET /api/quizzes/student/my student returns 200", async () => {
    const { token } = await createStudent();
    const res = await request(app)
      .get("/api/quizzes/student/my")
      .set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/quizzes/student/my teacher gets 403", async () => {
    const { token } = await createTeacher();
    const res = await request(app)
      .get("/api/quizzes/student/my")
      .set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/quizzes/student/my without auth returns 401", async () => {
    const res = await request(app).get("/api/quizzes/student/my");
    expect(res.status).toBe(401);
  });

  test("PATCH /api/quizzes/attempts/:id/answers student passes auth gate", async () => {
    const { token } = await createStudent();
    const fakeId = "64aaaaaaaaaaaaaaaaaaaa30";
    const res = await request(app)
      .patch(`/api/quizzes/attempts/${fakeId}/answers`)
      .set(authHeader(token))
      .send({ answers: [] });
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
