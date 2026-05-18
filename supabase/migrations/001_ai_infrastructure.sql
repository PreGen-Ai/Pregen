-- ============================================================
-- Migration 001: AI Infrastructure Tables
-- Project: PreGen LMS — Supabase Parallel AI Layer
-- ============================================================
-- Purpose:
--   Adds structured SQL tables for the AI analytics/audit layer.
--   MongoDB remains the primary LMS operational database.
--   These tables store AI-specific structured data that benefits
--   from SQL: token budgets, audit trails, request logs, job queues.
--
-- Access pattern:
--   All writes come from the backend via the service role key.
--   RLS is defined but service role bypasses it by default.
--   If direct Supabase auth is added in future, RLS applies.
--
-- Run with: supabase db push  OR  psql -f 001_ai_infrastructure.sql
-- ============================================================

-- Enable UUID extension if not already active
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. tenant_ai_settings
--    Per-tenant AI feature controls and token budget config.
--    Mirrors + extends the MongoDB TenantSettings.ai structure.
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_ai_settings (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               TEXT NOT NULL UNIQUE,

    -- Master enable/disable
    ai_enabled              BOOLEAN NOT NULL DEFAULT TRUE,

    -- Provider routing
    primary_provider        TEXT NOT NULL DEFAULT 'openai',
    fallback_provider       TEXT NOT NULL DEFAULT 'gemini',
    report_provider         TEXT NOT NULL DEFAULT 'openai',

    -- Model overrides (null = use service default)
    openai_model            TEXT DEFAULT 'gpt-4o-mini',
    gemini_model            TEXT DEFAULT 'gemini-2.5-flash',
    qwen_model              TEXT DEFAULT 'qwen3:4b',       -- future, not active

    -- Per-request token limits
    min_tokens_per_request  INTEGER NOT NULL DEFAULT 1 CHECK (min_tokens_per_request >= 0),
    max_tokens_per_request  INTEGER NOT NULL DEFAULT 4000 CHECK (max_tokens_per_request > 0),

    -- Monthly budget enforcement
    monthly_token_budget    INTEGER NOT NULL DEFAULT 1000000 CHECK (monthly_token_budget >= 0),
    used_tokens_month       INTEGER NOT NULL DEFAULT 0 CHECK (used_tokens_month >= 0),
    budget_reset_at         TIMESTAMPTZ DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
    hard_limit_enabled      BOOLEAN NOT NULL DEFAULT TRUE,

    -- Feedback tone for AI grading/tutoring
    feedback_tone           TEXT NOT NULL DEFAULT 'neutral' CHECK (feedback_tone IN ('strict', 'neutral', 'encouraging')),

    -- Feature-level toggles (mirrors MongoDB TenantSettings.ai.features)
    feature_ai_grading      BOOLEAN NOT NULL DEFAULT TRUE,
    feature_ai_quiz_gen     BOOLEAN NOT NULL DEFAULT TRUE,
    feature_ai_tutor        BOOLEAN NOT NULL DEFAULT TRUE,
    feature_ai_summaries    BOOLEAN NOT NULL DEFAULT TRUE,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_ai_settings_updated_at
    BEFORE UPDATE ON tenant_ai_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. ai_request_logs
--    Every AI request, outcome, and token count.
--    Queryable for cost analytics, debugging, and audits.
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_request_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           TEXT NOT NULL,
    user_id             TEXT,
    role                TEXT,                          -- STUDENT, TEACHER, ADMIN, SUPERADMIN
    feature             TEXT NOT NULL,                 -- quiz_generation, grading, tutoring…
    provider            TEXT NOT NULL,                 -- openai, gemini, qwen
    model               TEXT NOT NULL,
    prompt_version      TEXT,                          -- e.g. "quiz_v3"
    status              TEXT NOT NULL,                 -- ok, error, timeout, fallback, blocked
    input_tokens        INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens       INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    total_tokens        INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
    latency_ms          INTEGER CHECK (latency_ms >= 0),
    error_code          TEXT,                          -- model_not_found, rate_limit, budget_exceeded…
    error_message_safe  TEXT,                          -- sanitized, no keys/PII
    request_id          TEXT,                          -- x-request-id for tracing
    fallback_from       TEXT,                          -- if fallback triggered: original provider
    cache_hit           BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_request_logs_tenant_created
    ON ai_request_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_request_logs_feature_provider
    ON ai_request_logs (feature, provider, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_request_logs_status
    ON ai_request_logs (status, created_at DESC);

-- ============================================================
-- 3. ai_prompt_versions
--    Track prompt template versions for reproducibility/debugging.
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_prompt_versions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    feature         TEXT NOT NULL,          -- quiz_generation, grading, tutoring…
    version         TEXT NOT NULL,          -- semver or date-based, e.g. "quiz_v3"
    provider        TEXT,                   -- null = all providers
    template_hash   TEXT NOT NULL,          -- SHA-256 of prompt template text
    description     TEXT,                  -- human-readable change summary
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (feature, version)
);

-- ============================================================
-- 4. ai_audit_events
--    Immutable audit trail for admin actions and grade overrides.
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_audit_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       TEXT NOT NULL,
    actor_user_id   TEXT,
    actor_role      TEXT,
    entity_type     TEXT,                   -- quiz, submission, tenant_ai_settings, grade…
    entity_id       TEXT,                   -- MongoDB ObjectId or Supabase UUID
    action          TEXT NOT NULL,          -- published, grade_override, ai_settings_change…
    before_json     JSONB,                  -- state before action (omit large blobs)
    after_json      JSONB,                  -- state after action
    metadata        JSONB,                  -- extra context (request_id, ip_hash…)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_audit_events_tenant_created
    ON ai_audit_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_audit_events_entity
    ON ai_audit_events (entity_type, entity_id, created_at DESC);

-- ============================================================
-- 5. ai_jobs
--    Background job queue for long-running AI tasks.
--    Used for class-wide grading, report generation, etc.
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_jobs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           TEXT NOT NULL,
    user_id             TEXT,
    feature             TEXT NOT NULL,              -- grading_batch, report_generation…
    status              TEXT NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued','processing','completed','failed','cancelled')),
    priority            INTEGER NOT NULL DEFAULT 5, -- lower = higher priority
    provider            TEXT,
    model               TEXT,
    input_json          JSONB,                      -- sanitized job input (no student PII names)
    output_json         JSONB,                      -- job result
    error_message_safe  TEXT,
    retry_count         INTEGER NOT NULL DEFAULT 0,
    max_retries         INTEGER NOT NULL DEFAULT 2,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ
);

CREATE TRIGGER ai_jobs_updated_at
    BEFORE UPDATE ON ai_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS ai_jobs_status_priority
    ON ai_jobs (status, priority, created_at);
CREATE INDEX IF NOT EXISTS ai_jobs_tenant_status
    ON ai_jobs (tenant_id, status, created_at DESC);

-- ============================================================
-- RLS Policies
-- ============================================================
-- The Node.js backend always uses the SERVICE ROLE KEY which bypasses RLS.
-- Policies below apply only if you ever add direct client-side access
-- (e.g. a Supabase Auth-backed admin dashboard).
-- Document: service-role-only access is the intended pattern.

ALTER TABLE tenant_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_request_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_audit_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_jobs            ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS — no additional policies needed for backend writes.
-- Add tenant-scoped policies here when/if a direct Supabase admin panel is built:
-- CREATE POLICY "tenant_isolation" ON tenant_ai_settings
--     USING (tenant_id = current_setting('app.current_tenant_id', true));
