import AiUsage from "../../models/aiUsage.js";
import { getTenantId } from "../../middleware/authMiddleware.js";
import { estimateUsageCost } from "./modelPricing.js";

const OUTPUT_PREVIEW_LIMIT = 4000;
const DEFAULT_CURRENCY = "USD";

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

function firstFiniteValue(values = []) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
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

function readExplicitCost(responseData = null) {
  if (!responseData || typeof responseData !== "object") {
    return null;
  }

  const candidates = [
    responseData,
    responseData.cost,
    responseData.meta?.cost,
    responseData.metadata?.cost,
    responseData.usage,
    responseData.meta?.usage,
    responseData.metadata?.usage,
  ].filter(Boolean);

  const pick = (...keys) =>
    firstFiniteValue(
      candidates.flatMap((candidate) => keys.map((key) => candidate?.[key])),
    );

  const inputCost = pick(
    "inputCost",
    "input_cost",
    "promptCost",
    "prompt_cost",
  );
  const outputCost = pick(
    "outputCost",
    "output_cost",
    "completionCost",
    "completion_cost",
  );
  const totalCost = pick(
    "totalCost",
    "total_cost",
    "cost",
  );

  const currency =
    responseData?.currency ||
    responseData?.metadata?.currency ||
    responseData?.meta?.currency ||
    DEFAULT_CURRENCY;

  if (inputCost === null && outputCost === null && totalCost === null) {
    return null;
  }

  return {
    inputCost,
    outputCost,
    totalCost:
      totalCost ??
      ((inputCost ?? null) !== null && (outputCost ?? null) !== null
        ? inputCost + outputCost
        : null),
    currency: String(currency || DEFAULT_CURRENCY).toUpperCase(),
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
    const resolvedProvider =
      responseData?.provider ||
      responseData?.metadata?.provider ||
      provider;
    const resolvedModel =
      responseData?.model ||
      responseData?.metadata?.model ||
      model;
    const explicitCost = readExplicitCost(responseData);
    const estimatedCost =
      explicitCost ||
      (success
        ? estimateUsageCost({
            provider: resolvedProvider,
            model: resolvedModel,
            inputTokens,
            outputTokens,
          })
        : null);

    await AiUsage.create({
      tenantId: getTenantId(req),
      userId: req.user?._id || undefined,
      sessionId:
        req.params?.sessionId ||
        req.body?.session_id ||
        req.body?.sessionId ||
        req.get?.("x-session-id") ||
        undefined,
      provider: resolvedProvider,
      model: resolvedModel,
      feature,
      endpoint,
      requestId,
      requests: 1,
      inputTokens,
      outputTokens,
      totalTokens,
      inputCost: estimatedCost?.inputCost ?? estimatedCost?.input_cost ?? undefined,
      outputCost: estimatedCost?.outputCost ?? estimatedCost?.output_cost ?? undefined,
      totalCost: estimatedCost?.totalCost ?? estimatedCost?.total_cost ?? undefined,
      currency: estimatedCost?.currency || undefined,
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
