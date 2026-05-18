/**
 * backend/src/config/supabase.js
 *
 * Server-side Supabase client — uses the SERVICE ROLE KEY.
 * Must NEVER be imported by any frontend bundle.
 * Must NEVER expose the service role key in API responses or logs.
 *
 * Architecture:
 *   MongoDB  → primary LMS operational data (users, classes, quizzes, submissions…)
 *   Supabase → parallel structured platform layer (AI settings, audit logs, token budgets…)
 *
 * Graceful degradation:
 *   If SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are missing the client returns null.
 *   Core MongoDB LMS flows continue normally — only AI analytics/audit logging degrades.
 *   In production, missing config emits an error log (not a crash).
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";

let _client = null;
let _initialized = false;

function buildClient() {
  if (_initialized) return _client;
  _initialized = true;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    if (IS_PROD) {
      console.error(
        "[supabase] CRITICAL: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in production. " +
        "AI audit logging, token budgets, and tenant AI settings will be unavailable."
      );
    } else {
      console.warn(
        "[supabase] Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing). " +
        "AI audit/usage logging disabled for this environment. Set them in .env to enable."
      );
    }
    return null;
  }

  try {
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          // Identify backend requests for Supabase logging
          "x-client-info": "pregen-lms-backend/1.0",
        },
      },
    });
    console.info("[supabase] Client initialized — AI analytics layer active.");
    return _client;
  } catch (err) {
    console.error("[supabase] Failed to create client:", err?.message || err);
    return null;
  }
}

/**
 * Returns the server-side Supabase client, or null if not configured.
 * Never throws — callers must handle null gracefully.
 */
export function getSupabaseClient() {
  return buildClient();
}

/**
 * Returns true if Supabase is configured and the client was created.
 */
export function isSupabaseConfigured() {
  return buildClient() !== null;
}

/**
 * Safe wrapper: executes a Supabase operation and returns { data, error }.
 * On null client returns { data: null, error: "supabase_not_configured" }.
 * Never throws — callers can check error field and degrade gracefully.
 *
 * @param {(client: import('@supabase/supabase-js').SupabaseClient) => Promise<{data, error}>} fn
 */
export async function withSupabase(fn) {
  const client = getSupabaseClient();
  if (!client) {
    return { data: null, error: "supabase_not_configured" };
  }
  try {
    return await fn(client);
  } catch (err) {
    console.error("[supabase] Unexpected error:", err?.message || err);
    return { data: null, error: err?.message || "supabase_error" };
  }
}
