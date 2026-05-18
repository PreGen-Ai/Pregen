-- ============================================================
-- Migration 002: AI RPC Helper Functions
-- ============================================================
-- Atomic token usage increment to avoid race conditions.
-- Called by SupabaseAISettingsRepository.incrementTokenUsage().

CREATE OR REPLACE FUNCTION increment_tenant_token_usage(
    p_tenant_id TEXT,
    p_tokens    INTEGER
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Insert a default row if tenant has no settings yet, then increment.
    INSERT INTO tenant_ai_settings (tenant_id, used_tokens_month)
    VALUES (p_tenant_id, GREATEST(0, p_tokens))
    ON CONFLICT (tenant_id) DO UPDATE
        SET used_tokens_month = tenant_ai_settings.used_tokens_month + GREATEST(0, p_tokens),
            updated_at        = NOW();
END;
$$;

-- ============================================================
-- Reset monthly token counters (run via pg_cron or manual job
-- at the start of each billing month).
-- ============================================================
CREATE OR REPLACE FUNCTION reset_monthly_token_budgets()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE tenant_ai_settings
    SET    used_tokens_month = 0,
           budget_reset_at   = date_trunc('month', NOW()) + INTERVAL '1 month',
           updated_at        = NOW()
    WHERE  budget_reset_at IS NOT NULL
      AND  NOW() >= budget_reset_at;
END;
$$;
