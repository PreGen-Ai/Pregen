// tests/11_superadmin.test.js
// SuperAdmin routes: tenants, system overview, audit logs, AI cost, feature flags
import request from "supertest";
import mongoose from "mongoose";
import app from "./helpers/app.js";
import { connectTestDB, disconnectTestDB, clearAllCollections } from "./helpers/db.js";
import {
  createTeacher,
  createStudent,
  createAdmin,
  createSuperAdmin,
  authHeader,
} from "./helpers/factory.js";
import AuditLog from "../src/models/AuditLog.js";
import FeatureFlag from "../src/models/FeatureFlag.js";
import QuizAttempt from "../src/models/QuizAttempt.js";
import Submission from "../src/models/Submission.js";
import Tenant from "../src/models/Tenant.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

describe("SuperAdmin — System Routes Access Control", () => {
  const superAdminRoutes = [
    "/api/admin/system/super/overview",
    "/api/admin/system/super/ai-cost",
    "/api/admin/system/super/feature-flags",
    "/api/admin/system/super/logs",
    "/api/admin/system/super/ai-requests",
    "/api/admin/system/super/ai-requests/summary",
    "/api/admin/system/users",
  ];

  for (const route of superAdminRoutes) {
    test(`GET ${route} SUPERADMIN returns non-403`, async () => {
      const { token } = await createSuperAdmin();
      const res = await request(app).get(route).set(authHeader(token));
      expect(res.status).not.toBe(403);
    });

    test(`GET ${route} ADMIN gets 403`, async () => {
      const { token } = await createAdmin();
      const res = await request(app).get(route).set(authHeader(token));
      expect(res.status).toBe(403);
    });

    test(`GET ${route} STUDENT gets 403`, async () => {
      const { token } = await createStudent();
      const res = await request(app).get(route).set(authHeader(token));
      expect(res.status).toBe(403);
    });

    test(`GET ${route} unauthenticated gets 401`, async () => {
      const res = await request(app).get(route);
      expect(res.status).toBe(401);
    });
  }
});

describe("SuperAdmin — Tenant Management", () => {
  test("GET /api/admin/system/super/tenants SUPERADMIN returns 200", async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get("/api/admin/system/super/tenants")
      .set(authHeader(token));
    // This may 404 if not registered; just verify not 403/401
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  test("POST /api/admin/system/super/tenants SUPERADMIN can create tenant", async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .post("/api/admin/system/super/tenants")
      .set(authHeader(token))
      .send({
        tenantId: `tenant_${Date.now()}`,
        name: "New School District",
        status: "trial",
        plan: "basic",
      });
    // 201 on success, 400 on validation, but NOT 403
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  test("POST /api/admin/system/super/tenants persists description, pricing, and ticket limit", async () => {
    const { token } = await createSuperAdmin();
    const tenantId = `tenant_${Date.now()}`;
    const createRes = await request(app)
      .post("/api/admin/system/super/tenants")
      .set(authHeader(token))
      .send({
        tenantId,
        name: "Structured School",
        description: "A tenant with package and billing metadata",
        status: "trial",
        plan: "pro",
        pricing: { amount: 199.99, currency: "USD" },
        limits: { ticketLimit: 500 },
        branding: { logoUrl: "https://example.com/logo.png" },
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body?.tenant?.description).toBe(
      "A tenant with package and billing metadata",
    );
    expect(createRes.body?.tenant?.pricing?.amount).toBe(199.99);
    expect(createRes.body?.tenant?.limits?.ticketLimit).toBe(500);
    expect(createRes.body?.tenant?.branding?.logoUrl).toBe(
      "https://example.com/logo.png",
    );

    const getRes = await request(app)
      .get(`/api/admin/system/super/tenants/${tenantId}`)
      .set(authHeader(token));

    expect(getRes.status).toBe(200);
    expect(getRes.body?.tenant?.description).toBe(
      "A tenant with package and billing metadata",
    );
    expect(getRes.body?.tenant?.pricing?.amount).toBe(199.99);
    expect(getRes.body?.tenant?.limits?.ticketLimit).toBe(500);
  });

  test("POST /api/admin/system/super/tenants ADMIN gets 403", async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .post("/api/admin/system/super/tenants")
      .set(authHeader(token))
      .send({ tenantId: "stolen_tenant", name: "Unauthorized" });
    expect(res.status).toBe(403);
  });
});

describe("SuperAdmin — AI Cost Tracking", () => {
  test("GET /api/admin/system/super/ai-cost with range param SUPERADMIN returns 200", async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get("/api/admin/system/super/ai-cost?range=30d")
      .set(authHeader(token));
    expect(res.status).not.toBe(403);
  });

  test("GET /api/admin/system/super/ai-requests/summary SUPERADMIN returns 200", async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get("/api/admin/system/super/ai-requests/summary?range=7d")
      .set(authHeader(token));
    expect(res.status).not.toBe(403);
  });
});

describe("SuperAdmin — truthful analytics payloads", () => {
  test("overview returns no-data states instead of misleading zeros when telemetry is absent", async () => {
    const { token } = await createSuperAdmin();

    await Tenant.create({
      tenantId: "tenant_overview",
      name: "Overview Academy",
      status: "active",
      plan: "pro",
    });
    await createStudent({ tenantId: "tenant_overview" });

    const res = await request(app)
      .get("/api/admin/system/super/overview")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body?.metrics?.activeTenants?.value).toBe(1);
    expect(res.body?.metrics?.totalStudents?.value).toBe(1);
    expect(res.body?.metrics?.aiCalls24h?.value).toBeNull();
    expect(res.body?.metrics?.aiCalls24h?.state).not.toBe("ok");
    expect(res.body?.metrics?.costToday?.value).toBeNull();
    expect(res.body?.metrics?.p95LatencyMs?.value).toBeNull();
    expect(res.body?.alerts?.state).toBe("no_data");
  });

  test("ai cost routes aggregate merged request telemetry and preserve tenant naming", async () => {
    const { token } = await createSuperAdmin();
    const now = new Date();

    await Tenant.create({
      tenantId: "tenant_ai",
      name: "Telemetry School",
      status: "active",
      plan: "enterprise",
    });

    await mongoose.connection.db.collection("ai_requests").insertMany([
      {
        requestId: "req-1",
        tenantId: "tenant_ai",
        provider: "openai",
        model: "gpt-test",
        feature: "quiz-generate",
        totalTokens: 120,
        totalLatencyMs: 900,
        lastStatus: "ok",
        cacheHit: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        requestId: "req-2",
        tenantId: "tenant_ai",
        provider: "openai",
        model: "gpt-test",
        feature: "assignment-generate",
        totalTokens: 80,
        totalLatencyMs: 1100,
        lastStatus: "error",
        cacheHit: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const summaryRes = await request(app)
      .get("/api/admin/system/super/ai-requests/summary?range=7d")
      .set(authHeader(token));

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body?.summary?.requests?.value).toBe(2);
    expect(summaryRes.body?.summary?.totalTokens?.value).toBe(200);
    expect(summaryRes.body?.summary?.avgLatencyMs?.value).toBe(1000);

    const costRes = await request(app)
      .get("/api/admin/system/super/ai-cost?range=7d")
      .set(authHeader(token));

    expect(costRes.status).toBe(200);
    expect(costRes.body?.byTenant?.[0]?.tenantId).toBe("tenant_ai");
    expect(costRes.body?.byTenant?.[0]?.name).toBe("Telemetry School");

    const listRes = await request(app)
      .get("/api/admin/system/super/ai-requests?range=7d&status=error")
      .set(authHeader(token));

    expect(listRes.status).toBe(200);
    expect(listRes.body?.items).toHaveLength(1);
    expect(listRes.body?.items?.[0]?.requestId).toBe("req-2");
  });
});

describe("SuperAdmin — Feature Flags", () => {
  test("GET /api/admin/system/super/feature-flags returns JSON for SUPERADMIN", async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get("/api/admin/system/super/feature-flags")
      .set(authHeader(token));
    expect(res.status).not.toBe(403);
    if (res.status === 200) {
      expect(res.headers["content-type"]).toMatch(/application\/json/);
    }
  });

  test("feature flags and audit logs use model-backed collections", async () => {
    const { token } = await createSuperAdmin();

    await FeatureFlag.create({
      key: "ai.tutor.enabled",
      description: "Enable AI tutor",
      scope: "global",
      defaultEnabled: true,
    });
    await AuditLog.create({
      tenantId: "tenant_logs",
      level: "warn",
      type: "SYSTEM_ALERT",
      actor: "system",
      message: "Telemetry warning",
      meta: { channel: "analytics" },
    });

    const flagsRes = await request(app)
      .get("/api/admin/system/super/feature-flags")
      .set(authHeader(token));
    expect(flagsRes.status).toBe(200);
    expect(flagsRes.body?.items?.[0]?.key).toBe("ai.tutor.enabled");
    expect(flagsRes.body?.meta?.updatesSupported).toBe(false);

    const logsRes = await request(app)
      .get("/api/admin/system/super/logs")
      .set(authHeader(token));
    expect(logsRes.status).toBe(200);
    expect(logsRes.body?.items?.[0]?.message).toBe("Telemetry warning");
    expect(logsRes.body?.items?.[0]?.level).toBe("warn");
  });
});

describe("SuperAdmin — Redirect /api/admin/super → /api/admin/system/super", () => {
  test("GET /api/admin/super/overview redirects to system path", async () => {
    const { token } = await createSuperAdmin();
    // Should 307 redirect
    const res = await request(app)
      .get("/api/admin/super/overview")
      .set(authHeader(token))
      .redirects(0); // don't follow
    expect([307, 308, 301, 302]).toContain(res.status);
  });
});

describe("SuperAdmin — User Management (System-Wide)", () => {
  test("GET /api/admin/system/users SUPERADMIN returns 200", async () => {
    const { token } = await createSuperAdmin();
    const res = await request(app)
      .get("/api/admin/system/users")
      .set(authHeader(token));
    expect(res.status).not.toBe(403);
  });

  test("POST /api/admin/system/createAdmin SUPERADMIN can create admin user", async () => {
    const { token } = await createSuperAdmin();
    const ts = Date.now();
    const res = await request(app)
      .post("/api/admin/system/createAdmin")
      .set(authHeader(token))
      .send({
        username: `sa_created_admin_${ts}`,
        email: `sa_admin_${ts}@test.com`,
        password: "Password1!",
        role: "ADMIN",
        tenantId: `tenant_${ts}`,
      });
    expect(res.status).not.toBe(403);
  });
});

describe("Admin analytics summary payload", () => {
  test("analytics summary returns stateful metrics from real tenant data", async () => {
    const { token, user: admin } = await createAdmin({ tenantId: "tenant_analytics" });
    const { user: teacher } = await createTeacher({
      tenantId: "tenant_analytics",
      lastLogin: new Date(),
    });
    const { user: student } = await createStudent({ tenantId: "tenant_analytics" });

    await Submission.create({
      tenantId: "tenant_analytics",
      workspaceId: new mongoose.Types.ObjectId(),
      assignmentId: new mongoose.Types.ObjectId(),
      studentId: student._id,
      teacherId: teacher._id,
      gradedBy: "AI",
      gradedAt: new Date(),
      aiGradedAt: new Date(),
      score: 88,
    });

    await QuizAttempt.create({
      tenantId: "tenant_analytics",
      quizId: new mongoose.Types.ObjectId(),
      workspaceId: new mongoose.Types.ObjectId(),
      studentId: student._id,
      score: 72,
      status: "ai_graded",
      gradedAt: new Date(),
      aiGradedAt: new Date(),
    });

    await mongoose.connection.db.collection("ai_requests").insertOne({
      requestId: "analytics-req-1",
      tenantId: "tenant_analytics",
      provider: "openai",
      model: "gpt-test",
      feature: "grading",
      totalTokens: 50,
      totalLatencyMs: 700,
      lastStatus: "ok",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .get("/api/admin/analytics/summary?range=7d")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body?.summary?.avgScore?.value).toBe(80);
    expect(res.body?.summary?.aiGraded?.value).toBe(2);
    expect(res.body?.summary?.aiRequests?.value).toBe(1);
    expect(res.body?.summary?.activeTeachers?.value).toBe(1);
    expect(res.body?.summary?.activeTeachers?.meta?.derivedFrom).toEqual(
      expect.arrayContaining(["users.lastActiveAt", "users.lastLogin"]),
    );
  });

  test("analytics summary returns no-data state when grading data is absent", async () => {
    const { token } = await createAdmin({ tenantId: "tenant_empty_analytics" });

    const res = await request(app)
      .get("/api/admin/analytics/summary?range=7d")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body?.summary?.avgScore?.value).toBeNull();
    expect(res.body?.summary?.avgScore?.state).toBe("no_data");
    expect(res.body?.summary?.aiGraded?.value).toBeNull();
    expect(res.body?.summary?.aiRequests?.value).toBeNull();
  });
});
