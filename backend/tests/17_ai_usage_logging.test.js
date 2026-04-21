import AiUsage from "../src/models/aiUsage.js";
import { logAiBridgeUsage } from "../src/services/ai/aiUsageLogger.js";
import {
  clearAllCollections,
  connectTestDB,
  disconnectTestDB,
} from "./helpers/db.js";
import { createStudent } from "./helpers/factory.js";

beforeAll(() => connectTestDB());
afterAll(() => disconnectTestDB());
beforeEach(() => clearAllCollections());

function buildReq(user, body = {}, headers = {}) {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), value]),
  );

  return {
    user,
    body,
    params: {},
    get(name) {
      return normalizedHeaders[String(name).toLowerCase()];
    },
  };
}

describe("AI bridge usage logging", () => {
  test("stores upstream token usage and output snapshot for successful requests", async () => {
    const { user } = await createStudent({ tenantId: "tenant_alpha" });
    const requestId = "req-success-001";
    const req = buildReq(
      user,
      { message: "Explain photosynthesis in simple terms." },
      { "x-session-id": "session-alpha" },
    );

    await logAiBridgeUsage({
      req,
      feature: "tutor-chat",
      endpoint: "POST /api/ai/tutor/chat",
      requestId,
      startedAt: Date.now() - 25,
      success: true,
      responseData: {
        request_id: requestId,
        provider: "openai",
        model: "gpt-5.4-nano",
        reply: "Plants use sunlight to make food.",
        usage: {
          prompt_tokens: 123,
          completion_tokens: 45,
          total_tokens: 168,
        },
      },
    });

    const saved = await AiUsage.findOne({ requestId }).lean();

    expect(saved).toBeTruthy();
    expect(saved.tenantId).toBe("tenant_alpha");
    expect(saved.sessionId).toBe("session-alpha");
    expect(saved.provider).toBe("openai");
    expect(saved.model).toBe("gpt-5.4-nano");
    expect(saved.inputTokens).toBe(123);
    expect(saved.outputTokens).toBe(45);
    expect(saved.totalTokens).toBe(168);
    expect(saved.outputPreview).toContain("Plants use sunlight to make food.");
    expect(saved.outputChars).toBeGreaterThan(0);
    expect(saved.outputTruncated).toBe(false);
  });

  test("falls back to estimated tokens when upstream usage metadata is missing", async () => {
    const { user } = await createStudent({ tenantId: "tenant_beta" });
    const requestId = "req-fallback-001";
    const req = buildReq(user, {
      topic: "Quadratic equations",
      grade_level: "High School",
      num_questions: 5,
    });

    await logAiBridgeUsage({
      req,
      feature: "quiz-generate",
      endpoint: "POST /api/ai/quiz/generate",
      requestId,
      startedAt: Date.now() - 15,
      success: true,
      responseData: {
        quiz: [
          {
            question: "What is the discriminant?",
            answer: "b^2 - 4ac",
          },
        ],
      },
    });

    const saved = await AiUsage.findOne({ requestId }).lean();

    expect(saved).toBeTruthy();
    expect(saved.inputTokens).toBeGreaterThan(0);
    expect(saved.outputTokens).toBeGreaterThan(0);
    expect(saved.totalTokens).toBe(saved.inputTokens + saved.outputTokens);
    expect(saved.outputPreview).toContain("discriminant");
    expect(saved.outputChars).toBeGreaterThan(0);
  });
});
