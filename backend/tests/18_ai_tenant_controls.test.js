import request from "supertest";

import app from "./helpers/app.js";
import {
  clearAllCollections,
  connectTestDB,
  disconnectTestDB,
} from "./helpers/db.js";
import {
  authHeader,
  createSuperAdmin,
  createTeacher,
} from "./helpers/factory.js";
import TenantSettings from "../src/models/TenantSettings.js";
import {
  DEFAULT_AI_SETTINGS,
  applyAiTokenPolicy,
} from "../src/services/ai/tenantAiSettingsService.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

function buildAiSettings(overrides = {}) {
  return {
    ...DEFAULT_AI_SETTINGS,
    ...overrides,
    features: {
      ...DEFAULT_AI_SETTINGS.features,
      ...(overrides.features || {}),
    },
  };
}

describe("Tenant-specific AI controls", () => {
  test("loads platform defaults when no tenant override is selected", async () => {
    const { token } = await createSuperAdmin();

    const res = await request(app)
      .get("/api/admin/ai/settings")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body?.scope?.mode).toBe("platform");
    expect(res.body?.settings?.enabled).toBe(true);
    expect(res.body?.settings?.minTokens).toBe(DEFAULT_AI_SETTINGS.minTokens);
    expect(res.body?.settings?.maxTokens).toBe(DEFAULT_AI_SETTINGS.maxTokens);
    expect(res.body?.override).toBeNull();
  });

  test("loads tenant-specific effective settings with inheritance metadata", async () => {
    const { token } = await createSuperAdmin();

    await TenantSettings.create({
      ai: buildAiSettings({
        minTokens: 300,
        maxTokens: 5000,
        softCapDaily: 60000,
      }),
    });
    await TenantSettings.create({
      tenantId: "tenant_alpha",
      aiOverride: {
        enabled: false,
        maxTokens: 900,
        features: {
          aiTutor: false,
        },
      },
    });

    const res = await request(app)
      .get("/api/admin/ai/settings")
      .set(authHeader(token))
      .set("x-tenant-id", "tenant_alpha");

    expect(res.status).toBe(200);
    expect(res.body?.scope?.mode).toBe("tenant");
    expect(res.body?.scope?.tenantId).toBe("tenant_alpha");
    expect(res.body?.platformDefaults?.minTokens).toBe(300);
    expect(res.body?.effective?.enabled).toBe(false);
    expect(res.body?.effective?.minTokens).toBe(300);
    expect(res.body?.effective?.maxTokens).toBe(900);
    expect(res.body?.effective?.features?.aiTutor).toBe(false);
    expect(res.body?.effective?.features?.aiGrading).toBe(true);
    expect(res.body?.inheritance?.enabled).toBe("overridden");
    expect(res.body?.inheritance?.minTokens).toBe("inherited");
    expect(res.body?.inheritance?.features?.aiTutor).toBe("overridden");
    expect(res.body?.inheritance?.features?.aiGrading).toBe("inherited");
  });

  test("saving a tenant override does not mutate platform defaults", async () => {
    const { token } = await createSuperAdmin();

    await TenantSettings.create({
      ai: buildAiSettings({
        enabled: true,
        minTokens: 256,
        maxTokens: 4096,
      }),
    });

    const res = await request(app)
      .put("/api/admin/ai/settings")
      .set(authHeader(token))
      .set("x-tenant-id", "tenant_beta")
      .send({
        enabled: false,
        minTokens: 512,
        maxTokens: 1024,
        features: {
          aiTutor: false,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body?.effective?.enabled).toBe(false);
    expect(res.body?.override?.minTokens).toBe(512);
    expect(res.body?.override?.features?.aiTutor).toBe(false);

    const globalDoc = await TenantSettings.findOne({ tenantId: null }).lean();
    const tenantDoc = await TenantSettings.findOne({ tenantId: "tenant_beta" }).lean();

    expect(globalDoc?.ai?.enabled).toBe(true);
    expect(globalDoc?.ai?.minTokens).toBe(256);
    expect(globalDoc?.ai?.maxTokens).toBe(4096);
    expect(tenantDoc?.aiOverride?.enabled).toBe(false);
    expect(tenantDoc?.aiOverride?.minTokens).toBe(512);
    expect(tenantDoc?.aiOverride?.maxTokens).toBe(1024);
    expect(tenantDoc?.aiOverride?.features?.aiTutor).toBe(false);
  });

  test("resetting a tenant override returns the tenant to inherited platform behavior", async () => {
    const { token } = await createSuperAdmin();

    await TenantSettings.create({
      ai: buildAiSettings({
        enabled: true,
        minTokens: 400,
        maxTokens: 2400,
      }),
    });
    await TenantSettings.create({
      tenantId: "tenant_gamma",
      aiOverride: {
        enabled: false,
        minTokens: 800,
        features: {
          aiTutor: false,
        },
      },
    });

    const resetRes = await request(app)
      .delete("/api/admin/ai/settings")
      .set(authHeader(token))
      .set("x-tenant-id", "tenant_gamma");

    expect(resetRes.status).toBe(200);
    expect(resetRes.body?.override).toBeNull();
    expect(resetRes.body?.effective?.enabled).toBe(true);
    expect(resetRes.body?.effective?.minTokens).toBe(400);
    expect(resetRes.body?.effective?.features?.aiTutor).toBe(true);

    const tenantDoc = await TenantSettings.findOne({ tenantId: "tenant_gamma" }).lean();
    expect(tenantDoc?.aiOverride).toBeUndefined();
    expect(tenantDoc?.ai).toBeUndefined();
  });

  test("backend enforcement blocks all AI requests when AI is disabled for the tenant", async () => {
    const { token } = await createTeacher({ tenantId: "tenant_disabled_ai" });

    await TenantSettings.create({
      tenantId: "tenant_disabled_ai",
      aiOverride: {
        enabled: false,
      },
    });

    const res = await request(app)
      .post("/api/ai/quiz/generate")
      .set(authHeader(token))
      .send({ topic: "Algebra" });

    expect(res.status).toBe(403);
    expect(res.body?.message).toMatch(/AI is disabled/i);
  });

  test("feature-specific enforcement blocks tutor while leaving grading available", async () => {
    const { token } = await createTeacher({ tenantId: "tenant_feature_toggle" });

    await TenantSettings.create({
      tenantId: "tenant_feature_toggle",
      aiOverride: {
        enabled: true,
        features: {
          aiTutor: false,
          aiGrading: true,
        },
      },
    });

    const tutorRes = await request(app)
      .post("/api/ai/tutor/chat")
      .set(authHeader(token))
      .send({
        session_id: "tenant-feature-session",
        message: "Help me study fractions",
      });

    expect(tutorRes.status).toBe(403);
    expect(tutorRes.body?.message).toMatch(/AI Tutor is disabled/i);

    const gradingRes = await request(app)
      .post("/api/ai/grade-quiz")
      .set(authHeader(token))
      .send({
        assignment_data: {
          questions: [{ question: "2 + 2 = ?" }],
        },
        student_answers: {},
      });

    expect(gradingRes.status).not.toBe(401);
    expect(gradingRes.status).not.toBe(403);
  });

  test("tenant-specific min and max tokens are stored, resolved, and clamped where grounded", async () => {
    const { token } = await createSuperAdmin();

    await TenantSettings.create({
      ai: buildAiSettings({
        minTokens: 128,
        maxTokens: 2048,
      }),
    });

    const saveRes = await request(app)
      .put("/api/admin/ai/settings")
      .set(authHeader(token))
      .set("x-tenant-id", "tenant_tokens")
      .send({
        minTokens: 512,
        maxTokens: 1024,
      });

    expect(saveRes.status).toBe(200);
    expect(saveRes.body?.effective?.minTokens).toBe(512);
    expect(saveRes.body?.effective?.maxTokens).toBe(1024);
    expect(saveRes.body?.inheritance?.minTokens).toBe("overridden");
    expect(saveRes.body?.inheritance?.maxTokens).toBe("overridden");

    const clamped = applyAiTokenPolicy(
      { max_tokens: 5000, max_output_tokens: 100 },
      saveRes.body?.effective,
    );
    expect(clamped.max_tokens).toBe(1024);
    expect(clamped.max_output_tokens).toBe(512);
  });
});
