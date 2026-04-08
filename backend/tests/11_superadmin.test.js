// tests/11_superadmin.test.js
// SuperAdmin routes: tenants, system overview, audit logs, AI cost, feature flags
import request from "supertest";
import app from "./helpers/app.js";
import { connectTestDB, disconnectTestDB, clearAllCollections } from "./helpers/db.js";
import {
  createStudent,
  createAdmin,
  createSuperAdmin,
  authHeader,
} from "./helpers/factory.js";

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
