import AiUsage from "../../models/aiUsage.js";
import { getTenantId } from "../../middleware/authMiddleware.js";

function estimateChars(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string") return value.length;

  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

export async function logAiBridgeUsage({
  req,
  feature,
  endpoint,
  requestId,
  startedAt,
  success,
  responseData = null,
  error = null,
  provider = "fastapi-proxy",
  model = "",
}) {
  try {
    await AiUsage.create({
      tenantId: getTenantId(req),
      userId: req.user?._id || undefined,
      sessionId:
        req.params?.sessionId ||
        req.body?.session_id ||
        req.body?.sessionId ||
        req.get?.("x-session-id") ||
        undefined,
      provider,
      model,
      feature,
      endpoint,
      requestId,
      requests: 1,
      promptChars: estimateChars(req.body),
      completionChars: estimateChars(responseData),
      latencyMs: Math.max(0, Date.now() - startedAt),
      status: success ? "ok" : "error",
      success,
      error: success
        ? undefined
        : {
            message: error?.message || "AI bridge request failed",
            code: String(
              error?.upstreamStatus || error?.status || "bridge_error",
            ),
          },
      timestamp: new Date(),
    });
  } catch (logError) {
    console.error("AI usage bridge log failed:", logError?.message || logError);
  }
}
