/**
 * frontend/src/utils/supabase.js
 *
 * Frontend Supabase client — uses the PUBLISHABLE (anon) key only.
 * This key is safe to expose in the browser bundle.
 *
 * NEVER import or use the service role key on the frontend.
 * All privileged operations (AI settings, audit logs, token budgets) go
 * through the Node.js backend which holds the service role key server-side.
 *
 * Current use cases for the frontend client:
 *   - Future: real-time subscriptions to AI job status
 *   - Future: direct read-only queries if RLS permits
 *   - Currently: not actively queried — backend REST APIs are the primary path
 *
 * Env vars (set in frontend/.env or frontend/.env.local):
 *   REACT_APP_SUPABASE_URL
 *   REACT_APP_SUPABASE_PUBLISHABLE_KEY
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabasePublishableKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY;

let _client = null;

function buildClient() {
  if (_client) return _client;

  if (!supabaseUrl || !supabasePublishableKey) {
    if (process.env.NODE_ENV !== "production") {
      // Only warn in dev — in production the missing keys just disable the client
      console.warn(
        "[supabase] REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_PUBLISHABLE_KEY not set. " +
        "Supabase client disabled."
      );
    }
    return null;
  }

  _client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      // The LMS uses its own JWT/session auth (Node.js backend).
      // Supabase Auth is not used on the frontend at this time.
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return _client;
}

/**
 * Returns the frontend Supabase client, or null if not configured.
 * Callers must handle null gracefully.
 */
export function getSupabaseClient() {
  return buildClient();
}

/**
 * Returns true if the frontend Supabase client is configured.
 */
export function isSupabaseReady() {
  return buildClient() !== null;
}

// Named export for direct use (matches the pattern shown in Supabase docs)
export const supabase = buildClient();

export default supabase;
