/**
 * backend/src/repositories/SupabaseJobsRepository.js
 *
 * Repository for ai_jobs in Supabase.
 * Minimal job queue for long-running AI tasks (batch grading, report generation).
 * Interface is designed to be swappable with BullMQ/Redis in future.
 *
 * All methods degrade gracefully when Supabase is not configured.
 */

import { withSupabase } from "../config/supabase.js";

const TABLE = "ai_jobs";

/**
 * Create a new AI job and return its id.
 * Returns null if Supabase is not configured (caller must handle).
 *
 * @param {Object} params
 * @param {string} params.tenantId
 * @param {string} [params.userId]
 * @param {string} params.feature          — grading_batch | report_generation | quiz_generation
 * @param {Object} [params.inputJson]      — sanitized job input (no student PII names)
 * @param {string} [params.provider]
 * @param {string} [params.model]
 * @param {number} [params.priority]       — 1 (highest) – 10 (lowest), default 5
 * @returns {Promise<string|null>}          — job id UUID or null
 */
export async function createJob({ tenantId, userId, feature, inputJson, provider, model, priority = 5 } = {}) {
  if (!tenantId || !feature) return null;

  const record = {
    tenant_id:   String(tenantId),
    user_id:     userId ? String(userId) : null,
    feature,
    status:      "queued",
    priority:    Math.max(1, Math.min(10, Number(priority) || 5)),
    provider:    provider || null,
    model:       model || null,
    input_json:  inputJson || null,
    retry_count: 0,
  };

  const { data, error } = await withSupabase((client) =>
    client.from(TABLE).insert(record).select("id").single()
  );

  if (error && error !== "supabase_not_configured") {
    console.warn("[SupabaseJobs] createJob failed:", error);
    return null;
  }

  return data?.id || null;
}

/**
 * Get a job by its id.
 * Returns null if not found or Supabase unavailable.
 */
export async function getJob(jobId) {
  if (!jobId) return null;

  const { data, error } = await withSupabase((client) =>
    client.from(TABLE).select("*").eq("id", jobId).maybeSingle()
  );

  if (error && error !== "supabase_not_configured") {
    console.warn("[SupabaseJobs] getJob failed:", error);
  }

  return data || null;
}

/**
 * Update job status and optionally store output or error.
 */
export async function updateJob(jobId, { status, outputJson, errorMessageSafe, provider, model } = {}) {
  if (!jobId || !status) return;

  const VALID_STATUSES = ["queued", "processing", "completed", "failed", "cancelled"];
  if (!VALID_STATUSES.includes(status)) {
    console.warn(`[SupabaseJobs] invalid status: ${status}`);
    return;
  }

  const patch = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "processing") patch.started_at = new Date().toISOString();
  if (status === "completed" || status === "failed") patch.completed_at = new Date().toISOString();
  if (outputJson !== undefined) patch.output_json = outputJson;
  if (errorMessageSafe) patch.error_message_safe = String(errorMessageSafe).slice(0, 500);
  if (provider) patch.provider = provider;
  if (model) patch.model = model;

  const { error } = await withSupabase((client) =>
    client.from(TABLE).update(patch).eq("id", jobId)
  );

  if (error && error !== "supabase_not_configured") {
    console.warn("[SupabaseJobs] updateJob failed:", error);
  }
}

/**
 * Increment retry count on failure. Returns updated count or null.
 */
export async function incrementJobRetry(jobId) {
  const job = await getJob(jobId);
  if (!job) return null;

  const newCount = (job.retry_count || 0) + 1;
  const { error } = await withSupabase((client) =>
    client.from(TABLE).update({ retry_count: newCount, updated_at: new Date().toISOString() }).eq("id", jobId)
  );

  if (error && error !== "supabase_not_configured") {
    console.warn("[SupabaseJobs] incrementJobRetry failed:", error);
  }

  return newCount;
}

/**
 * Get queued jobs for a tenant, ordered by priority then creation time.
 */
export async function getQueuedJobs({ tenantId, feature, limit = 20 } = {}) {
  if (!tenantId) return [];

  const { data, error } = await withSupabase(async (client) => {
    let query = client
      .from(TABLE)
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("status", "queued")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(limit);

    if (feature) query = query.eq("feature", feature);
    return query;
  });

  if (error && error !== "supabase_not_configured") {
    console.warn("[SupabaseJobs] getQueuedJobs failed:", error);
  }

  return data || [];
}

/**
 * Build a "processing" status response for long-running jobs.
 * Use this when an AI request is queued instead of waiting synchronously.
 */
export function buildProcessingResponse(jobId, tenantId, feature) {
  return {
    status: "processing",
    job_id: jobId,
    tenant_id: tenantId,
    feature,
    message: "Your request is being processed. You will be notified when results are ready.",
    poll_url: jobId ? `/api/ai/jobs/${jobId}` : null,
  };
}
