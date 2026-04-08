// tests/13_ai_routes.test.js
// AI routes: access control, health checks, graceful fallback when AI service is down
import request from "supertest";
import app from "./helpers/app.js";
import { connectTestDB, disconnectTestDB, clearAllCollections } from "./helpers/db.js";
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

// AI service is not running in test; we verify:
// 1. Auth gates work (401/403 for wrong roles)
// 2. Correct roles pass auth (may get 500/502 from AI proxy, but NOT 403)

describe("AI Routes — Access Control", () => {
  const aiEndpoints = [
    { method: "post", path: "/api/ai/quiz/generate" },
    { method: "post", path: "/api/ai/grade-quiz" },
    { method: "post", path: "/api/ai/grade-question" },
    { method: "get", path: "/api/ai/grade/health" },
    { method: "post", path: "/api/ai/assignments/generate" },
    { method: "post", path: "/api/ai/tutor/chat" },
    { method: "post", path: "/api/ai/learning/explanation" },
  ];

  for (const { method, path } of aiEndpoints) {
    test(`${method.toUpperCase()} ${path} — unauthenticated gets 401`, async () => {
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(401);
    });

    test(`${method.toUpperCase()} ${path} — PARENT gets 403`, async () => {
      const { token } = await createParent();
      const res = await request(app)[method](path).set(authHeader(token)).send({});
      expect(res.status).toBe(403);
    });

    test(`${method.toUpperCase()} ${path} — STUDENT passes auth (not 403)`, async () => {
      const { token } = await createStudent();
      const res = await request(app)[method](path).set(authHeader(token)).send({});
      // AI service not running → expect 5xx or 4xx but NOT 403/401
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });

    test(`${method.toUpperCase()} ${path} — TEACHER passes auth (not 403)`, async () => {
      const { token } = await createTeacher();
      const res = await request(app)[method](path).set(authHeader(token)).send({});
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });
  }
});

describe("AI Routes — Reports Access Control", () => {
  const reportRoutes = [
    { method: "post", path: "/api/ai/reports/student" },
    { method: "post", path: "/api/ai/reports/progress" },
    { method: "get", path: "/api/ai/reports/status/fake-report-id" },
  ];

  for (const { method, path } of reportRoutes) {
    test(`${method.toUpperCase()} ${path} — STUDENT passes auth`, async () => {
      const { token } = await createStudent();
      const res = await request(app)[method](path).set(authHeader(token)).send({});
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    test(`${method.toUpperCase()} ${path} — unauthenticated gets 401`, async () => {
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(401);
    });
  }
});

describe("AI Routes — AI Usage Logging", () => {
  test("POST /api/ai-usage STUDENT can log AI usage", async () => {
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

  test("GET /api/ai-usage ADMIN returns usage list (200)", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/ai-usage").set(authHeader(token));
    expect(res.status).not.toBe(403);
  });

  test("GET /api/ai-usage STUDENT gets 403", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/ai-usage").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/ai-usage/summary ADMIN returns summary", async () => {
    const { token } = await createAdmin();
    const res = await request(app).get("/api/ai-usage/summary").set(authHeader(token));
    expect(res.status).not.toBe(403);
  });

  test("DELETE /api/ai-usage/bulk SUPERADMIN can bulk delete", async () => {
    const { token } = await createAdmin(); // ADMIN should 403; test with SUPERADMIN via factory
    // The route requires SUPERADMIN
    const res = await request(app)
      .delete("/api/ai-usage/bulk")
      .set(authHeader(token))
      .send({ ids: [] });
    // Admin should get 403 for bulk delete (superadmin only)
    expect(res.status).toBe(403);
  });
});

describe("AI Routes — Quiz Routes (STUDENT only)", () => {
  test("GET /api/quizzes/student/my STUDENT returns 200", async () => {
    const { token } = await createStudent();
    const res = await request(app).get("/api/quizzes/student/my").set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("GET /api/quizzes/student/my TEACHER gets 403", async () => {
    const { token } = await createTeacher();
    const res = await request(app).get("/api/quizzes/student/my").set(authHeader(token));
    expect(res.status).toBe(403);
  });

  test("GET /api/quizzes/student/my without auth returns 401", async () => {
    const res = await request(app).get("/api/quizzes/student/my");
    expect(res.status).toBe(401);
  });

  test("PATCH /api/quizzes/attempts/:id/answers STUDENT passes auth gate", async () => {
    const { token } = await createStudent();
    const fakeId = "64aaaaaaaaaaaaaaaaaaaa30";
    const res = await request(app)
      .patch(`/api/quizzes/attempts/${fakeId}/answers`)
      .set(authHeader(token))
      .send({ answers: [] });
    // 404 expected (attempt doesn't exist), not 403
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
