/**
 * backend/src/repositories/SupabaseAuditRepository.js
 *
 * Repository for ai_audit_events in Supabase.
 * Provides immutable audit trail for admin actions and AI grade overrides.
 * All methods degrade gracefully if Supabase is not configured.
 */

import { withSupabase } from "../config/supabase.js";

const TABLE = "ai_audit_events";

/**
 * Log an audit event.
 * Non-blocking safe — never throws.
 *
 * @param {Object} event
 * @param {string} event.tenantId
 * @param {string} [event.actorUserId]
 * @param {string} [event.actorRole]
 * @param {string} [event.entityType]   — quiz | submission | tenant_ai_settings | grade
 * @param {string} [event.entityId]     — MongoDB ObjectId string
 * @param {string} event.action         — published | grade_override | ai_settings_change | quiz_unpublished
 * @param {Object} [event.beforeJson]   — state before (keep small, omit large blobs)
 * @param {Object} [event.afterJson]    — state after
 * @param {Object} [event.metadata]     — extra context e.g. { requestId, ipHash }
 */
export async function logAuditEvent(event = {}) {
  // Sanitize: strip any fields that look like API keys or passwords
  const safe = (obj) => {
    if (!obj || typeof obj !== "object") return obj;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const lk = k.toLowerCase();
      if (lk.includes("key") || lk.includes("password") || lk.includes("secret") || lk.includes("token")) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = v;
      }
    }
    return out;
  };

  const record = {
    tenant_id:      String(event.tenantId || "unknown"),
    actor_user_id:  event.actorUserId ? String(event.actorUserId) : null,
    actor_role:     event.actorRole || null,
    entity_type:    event.entityType || null,
    entity_id:      event.entityId ? String(event.entityId) : null,
    action:         event.action || "unknown",
    before_json:    event.beforeJson ? safe(event.beforeJson) : null,
    after_json:     event.afterJson ? safe(event.afterJson) : null,
    metadata:       event.metadata ? safe(event.metadata) : null,
  };

  const { error } = await withSupabase((client) => client.from(TABLE).insert(record));

  if (error && error !== "supabase_not_configured") {
    console.warn("[SupabaseAudit] logAuditEvent failed:", error);
  }
}

/**
 * Get audit events for a tenant with optional filters.
 * Returns { data: [], total: 0 } on failure.
 */
export async function getAuditEvents({
  tenantId,
  entityType,
  entityId,
  actorUserId,
  action,
  startDate,
  endDate,
  limit = 50,
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

    if (entityType)   query = query.eq("entity_type", entityType);
    if (entityId)     query = query.eq("entity_id", entityId);
    if (actorUserId)  query = query.eq("actor_user_id", actorUserId);
    if (action)       query = query.eq("action", action);
    if (startDate)    query = query.gte("created_at", startDate);
    if (endDate)      query = query.lte("created_at", endDate);

    return query;
  });

  if (error && error !== "supabase_not_configured") {
    console.warn("[SupabaseAudit] getAuditEvents failed:", error);
  }

  return { data: data?.data || [], total: data?.count || 0 };
}

// ------------------------------------------------------------------
// Convenience helpers for common audit events
// ------------------------------------------------------------------

export function auditQuizPublished({ tenantId, actorUserId, actorRole, quizId, quizTitle, enrolledCount }) {
  return logAuditEvent({
    tenantId, actorUserId, actorRole,
    entityType: "quiz",
    entityId: String(quizId),
    action: "quiz_published",
    afterJson: { title: quizTitle, enrolled_count: enrolledCount },
  });
}

export function auditGradeOverride({ tenantId, actorUserId, actorRole, submissionId, before, after, reason }) {
  return logAuditEvent({
    tenantId, actorUserId, actorRole,
    entityType: "submission",
    entityId: String(submissionId),
    action: "grade_override",
    beforeJson: { score: before.score, feedback: before.feedback },
    afterJson: { score: after.score, feedback: after.feedback, reason },
  });
}

export function auditAISettingsChange({ tenantId, actorUserId, actorRole, before, after }) {
  return logAuditEvent({
    tenantId, actorUserId, actorRole,
    entityType: "tenant_ai_settings",
    entityId: tenantId,
    action: "ai_settings_changed",
    beforeJson: before,
    afterJson: after,
  });
}

export function auditAdminUserChange({ tenantId, actorUserId, actorRole, targetUserId, action, changes }) {
  return logAuditEvent({
    tenantId, actorUserId, actorRole,
    entityType: "user",
    entityId: String(targetUserId),
    action,  // user_created | user_role_changed | user_deleted | user_deactivated
    afterJson: changes,
  });
}
