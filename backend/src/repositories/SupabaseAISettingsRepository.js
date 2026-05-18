/**
 * backend/src/repositories/SupabaseAISettingsRepository.js
 *
 * Repository for tenant_ai_settings in Supabase.
 * All methods degrade gracefully when Supabase is not configured.
 *
 * Controllers must NOT import the Supabase client directly.
 * They should use this repository only via the service layer.
 */

import { withSupabase } from "../config/supabase.js";

const TABLE = "tenant_ai_settings";

// Safe defaults returned when Supabase is unavailable
export const AI_SETTINGS_DEFAULTS = Object.freeze({
  ai_enabled: true,
  primary_provider: "openai",
  fallback_provider: "gemini",
  report_provider: "openai",
  openai_model: "gpt-4o-mini",
  gemini_model: "gemini-2.5-flash",
  qwen_model: "qwen3:4b",
  min_tokens_per_request: 1,
  max_tokens_per_request: 4000,
  monthly_token_budget: 1_000_000,
  used_tokens_month: 0,
  hard_limit_enabled: true,
  feedback_tone: "neutral",
  feature_ai_grading: true,
  feature_ai_quiz_gen: true,
  feature_ai_tutor: true,
  feature_ai_summaries: true,
});

/**
 * Get settings for a tenant.
 * Returns defaults if Supabase is not configured or row doesn't exist.
 */
export async function getSettings(tenantId) {
  if (!tenantId) return { ...AI_SETTINGS_DEFAULTS };

  const { data, error } = await withSupabase(async (client) =>
    client
      .from(TABLE)
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle()
  );

  if (error && error !== "supabase_not_configured") {
    console.warn(`[SupabaseAISettings] getSettings failed for tenant=${tenantId}:`, error);
  }

  if (!data) return { ...AI_SETTINGS_DEFAULTS };
  return data;
}

/**
 * Upsert settings for a tenant. Only updates provided fields.
 * Returns the saved settings or null on failure.
 */
export async function upsertSettings(tenantId, patch = {}) {
  if (!tenantId) throw new Error("tenantId is required");

  // Validate provider names
  const VALID_PROVIDERS = ["openai", "gemini", "qwen"];
  const providerFields = ["primary_provider", "fallback_provider", "report_provider"];
  for (const field of providerFields) {
    if (patch[field] !== undefined && !VALID_PROVIDERS.includes(patch[field])) {
      throw Object.assign(new Error(`Invalid provider: ${patch[field]}`), { status: 400 });
    }
  }

  // Validate token limits
  const { min_tokens_per_request, max_tokens_per_request } = { ...AI_SETTINGS_DEFAULTS, ...patch };
  if (
    max_tokens_per_request > 0 &&
    min_tokens_per_request > max_tokens_per_request
  ) {
    throw Object.assign(
      new Error("max_tokens_per_request must be >= min_tokens_per_request"),
      { status: 400 }
    );
  }

  const record = {
    tenant_id: tenantId,
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await withSupabase(async (client) =>
    client
      .from(TABLE)
      .upsert(record, { onConflict: "tenant_id", returning: "representation" })
      .select()
      .single()
  );

  if (error && error !== "supabase_not_configured") {
    console.error(`[SupabaseAISettings] upsert failed for tenant=${tenantId}:`, error);
    return null;
  }

  return data || null;
}

/**
 * Atomically increment used_tokens_month for a tenant.
 * Fails silently if Supabase is not configured (non-critical path).
 */
export async function incrementTokenUsage(tenantId, tokensUsed) {
  if (!tenantId || !tokensUsed || tokensUsed <= 0) return;

  const { error } = await withSupabase(async (client) =>
    client.rpc("increment_tenant_token_usage", {
      p_tenant_id: tenantId,
      p_tokens: tokensUsed,
    })
  );

  if (error && error !== "supabase_not_configured") {
    // Non-critical: log but don't crash
    console.warn(`[SupabaseAISettings] incrementTokenUsage failed for tenant=${tenantId}:`, error);
  }
}

/**
 * Check if an AI request is allowed given tenant settings and estimated tokens.
 * Returns { allowed: boolean, reason: string|null }.
 */
export async function checkBudget(tenantId, estimatedTokens = 0) {
  const settings = await getSettings(tenantId);

  if (!settings.ai_enabled) {
    return { allowed: false, reason: "AI is disabled for this tenant" };
  }

  if (estimatedTokens > 0 && estimatedTokens > settings.max_tokens_per_request) {
    return {
      allowed: false,
      reason: `Request exceeds max tokens per request (${settings.max_tokens_per_request})`,
    };
  }

  if (settings.hard_limit_enabled && settings.monthly_token_budget > 0) {
    const remaining = settings.monthly_token_budget - (settings.used_tokens_month || 0);
    if (remaining <= 0) {
      return { allowed: false, reason: "Monthly token budget exhausted" };
    }
    if (estimatedTokens > 0 && estimatedTokens > remaining) {
      return { allowed: false, reason: "Insufficient monthly token budget remaining" };
    }
  }

  return { allowed: true, reason: null };
}
