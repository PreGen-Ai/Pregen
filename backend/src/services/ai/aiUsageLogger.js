import AiUsage from "../../models/aiUsage.js";
import { getTenantId } from "../../middleware/authMiddleware.js";

const OUTPUT_PREVIEW_LIMIT = 4000;

function estimateChars(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === "string") return value.length;

  if (Buffer.isBuffer(value)) return value.length;

  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function safeStringify(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return "";

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function estimateTokens(value) {
  const text = safeStringify(value);
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function firstFiniteNumber(values = []) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed);
    }
  }
  return null;
}

function usageObjects(responseData = null) {
  if (!responseData || typeof responseData !== "object") return [];

  return [
    responseData,
    responseData.usage,
    responseData.usage_metadata,
    responseData.usageMetadata,
    responseData.meta?.usage,
    responseData.meta?.usage_metadata,
    responseData.meta?.usageMetadata,
    responseData.metadata?.usage,
    responseData.metadata?.usage_metadata,
    responseData.metadata?.usageMetadata,
  ].filter(Boolean);
}

function normalizeUsage(responseData = null) {
  const candidates = usageObjects(responseData);

  const readField = (...keys) =>
    firstFiniteNumber(
      candidates.flatMap((candidate) => keys.map((key) => candidate?.[key])),
    );

  const inputTokens = readField(
    "inputTokens",
    "promptTokens",
    "prompt_tokens",
    "promptTokenCount",
    "prompt_token_count",
    "inputTokenCount",
    "input_token_count",
  );

  const outputTokens = readField(
    "outputTokens",
    "completionTokens",
    "completion_tokens",
    "candidatesTokenCount",
    "candidates_token_count",
    "outputTokenCount",
    "output_token_count",
  );

  const totalTokens = readField(
    "totalTokens",
    "total_tokens",
    "totalTokenCount",
    "total_token_count",
    "tokens",
  );

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      totalTokens ??
      ((inputTokens ?? null) !== null && (outputTokens ?? null) !== null
        ? inputTokens + outputTokens
        : null),
  };
}

function buildOutputSnapshot(responseData = null) {
  const output = safeStringify(responseData).trim();
  if (!output) {
    return {
      outputPreview: "",
      outputChars: 0,
      outputTruncated: false,
    };
  }

  return {
    outputPreview:
      output.length > OUTPUT_PREVIEW_LIMIT
        ? output.slice(0, OUTPUT_PREVIEW_LIMIT).trimEnd()
        : output,
    outputChars: output.length,
    outputTruncated: output.length > OUTPUT_PREVIEW_LIMIT,
  };
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
    const normalizedUsage = normalizeUsage(responseData);
    const estimatedInputTokens = estimateTokens(req.body);
    const estimatedOutputTokens =
      success && responseData !== null ? estimateTokens(responseData) : 0;
    const inputTokens = normalizedUsage.inputTokens ?? estimatedInputTokens;
    const outputTokens = normalizedUsage.outputTokens ?? estimatedOutputTokens;
    const totalTokens =
      normalizedUsage.totalTokens ?? Math.max(0, inputTokens + outputTokens);
    const outputSnapshot = buildOutputSnapshot(responseData);

    await AiUsage.create({
      tenantId: getTenantId(req),
      userId: req.user?._id || undefined,
      sessionId:
        req.params?.sessionId ||
        req.body?.session_id ||
        req.body?.sessionId ||
        req.get?.("x-session-id") ||
        undefined,
      provider:
        responseData?.provider ||
        responseData?.metadata?.provider ||
        provider,
      model:
        responseData?.model ||
        responseData?.metadata?.model ||
        model,
      feature,
      endpoint,
      requestId,
      requests: 1,
      inputTokens,
      outputTokens,
      totalTokens,
      promptChars: estimateChars(req.body),
      completionChars: estimateChars(responseData),
      outputPreview: outputSnapshot.outputPreview,
      outputChars: outputSnapshot.outputChars,
      outputTruncated: outputSnapshot.outputTruncated,
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
