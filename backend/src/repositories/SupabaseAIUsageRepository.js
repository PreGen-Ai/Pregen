/**
 * backend/src/repositories/SupabaseAIUsageRepository.js
 *
 * Repository for ai_request_logs in Supabase.
 * Non-critical: all methods degrade gracefully.
 * Core LMS flows must not depend on this succeeding.
 */

import { withSupabase } from "../config/supabase.js";

const TABLE = "ai_request_logs";

/**
 * Log an AI request to Supabase.
 * Non-blocking — caller should not await this on the hot path.
 *
 * @param {Object} entry
 * @param {string} entry.tenantId
 * @param {string} [entry.userId]
 * @param {string} [entry.role]
 * @param {string} entry.feature
 * @param {string} entry.provider
 * @param {string} entry.model
 * @param {string} [entry.promptVersion]
 * @param {string} entry.status         — ok | error | timeout | fallback | blocked
 * @param {number} [entry.inputTokens]
 * @param {number} [entry.outputTokens]
 * @param {number} [entry.totalTokens]
 * @param {number} [entry.latencyMs]
 * @param {string} [entry.errorCode]
 * @param {string} [entry.errorMessageSafe]
 * @param {string} [entry.requestId]
 * @param {string} [entry.fallbackFrom]
 * @param {boolean} [entry.cacheHit]
 */
export async function logAIRequest(entry = {}) {
  const record = {
    tenant_id:          String(entry.tenantId || "unknown"),
    user_id:            entry.userId ? String(entry.userId) : null,
    role:               entry.role || null,
    feature:            entry.feature || "unknown",
    provider:           entry.provider || "unknown",
    model:              entry.model || "unknown",
    prompt_version:     entry.promptVersion || null,
    status:             entry.status || "unknown",
    input_tokens:       Number(entry.inputTokens) || 0,
    output_tokens:      Number(entry.outputTokens) || 0,
    total_tokens:       Number(entry.totalTokens) || 0,
    latency_ms:         entry.latencyMs != null ? Number(entry.latencyMs) : null,
    error_code:         entry.errorCode || null,
    error_message_safe: entry.errorMessageSafe ? String(entry.errorMessageSafe).slice(0, 500) : null,
    request_id:         entry.requestId || null,
    fallback_from:      entry.fallbackFrom || null,
    cache_hit:          Boolean(entry.cacheHit),
  };

  const { error } = await withSupabase((client) => client.from(TABLE).insert(record));

  if (error && error !== "supabase_not_configured") {
    console.warn("[SupabaseAIUsage] logAIRequest failed:", error);
  }
}

/**
 * Get AI usage logs for a tenant with optional filters.
 * Returns { data: [], total: 0 } on failure.
 *
 * @param {Object} opts
 * @param {string} opts.tenantId
 * @param {string} [opts.startDate]   — ISO string
 * @param {string} [opts.endDate]     — ISO string
 * @param {string} [opts.feature]
 * @param {string} [opts.provider]
 * @param {string} [opts.model]
 * @param {string} [opts.status]
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 */
export async function getUsageLogs({
  tenantId,
  startDate,
  endDate,
  feature,
  provider,
  model,
  status,
  limit = 100,
  offset = 0,
} = {}) {
  if (!tenantId) return { data: [], total: 0 };

  const { data, error } = await withSupabase(async (client) => {
    let query = client
      .from(TABLE)
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (startDate) query = query.gte("created_at", startDate);
    if (endDate)   query = query.lte("created_at", endDate);
    if (feature)   query = query.eq("feature", feature);
    if (provider)  query = query.eq("provider", provider);
    if (model)     query = query.eq("model", model);
    if (status)    query = query.eq("status", status);

    return query;
  });

  if (error && error !== "supabase_not_configured") {
    console.warn("[SupabaseAIUsage] getUsageLogs failed:", error);
  }

  return { data: data?.data || [], total: data?.count || 0 };
}

/**
 * Get aggregated token usage summary for a tenant.
 * Returns null if Supabase is not configured.
 */
export async function getUsageSummary(tenantId, { startDate, endDate } = {}) {
  if (!tenantId) return null;

  const { data, error } = await withSupabase(async (client) => {
    let query = client
      .from(TABLE)
      .select("feature, provider, status, input_tokens, output_tokens, total_tokens, latency_ms")
      .eq("tenant_id", tenantId);

    if (startDate) query = query.gte("created_at", startDate);
    if (endDate)   query = query.lte("created_at", endDate);

    return query;
  });

  if (error && error !== "supabase_not_configured") {
    console.warn("[SupabaseAIUsage] getUsageSummary failed:", error);
    return null;
  }

  const rows = data?.data || data || [];
  if (!Array.isArray(rows) || rows.length === 0) return { total_requests: 0, total_tokens: 0, by_provider: {}, by_feature: {} };

  const summary = {
    total_requests: rows.length,
    total_tokens: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    by_provider: {},
    by_feature: {},
    by_status: {},
  };

  for (const row of rows) {
    summary.total_tokens += Number(row.total_tokens) || 0;
    summary.total_input_tokens += Number(row.input_tokens) || 0;
    summary.total_output_tokens += Number(row.output_tokens) || 0;

    const p = row.provider || "unknown";
    summary.by_provider[p] = summary.by_provider[p] || { requests: 0, tokens: 0 };
    summary.by_provider[p].requests++;
    summary.by_provider[p].tokens += Number(row.total_tokens) || 0;

    const f = row.feature || "unknown";
    summary.by_feature[f] = summary.by_feature[f] || { requests: 0, tokens: 0 };
    summary.by_feature[f].requests++;
    summary.by_feature[f].tokens += Number(row.total_tokens) || 0;

    const s = row.status || "unknown";
    summary.by_status[s] = (summary.by_status[s] || 0) + 1;
  }

  return summary;
}
