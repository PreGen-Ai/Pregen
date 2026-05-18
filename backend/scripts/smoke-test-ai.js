#!/usr/bin/env node
/**
 * scripts/smoke-test-ai.js
 * ─────────────────────────
 * Tests that the Node.js backend can reach the FastAPI AI service
 * and that the AI service can successfully call the primary LLM provider.
 *
 * Usage:
 *   node scripts/smoke-test-ai.js
 *   # or via npm:
 *   npm run smoke-test-ai
 *
 * Exits 0 on success, 1 on failure.
 * Never logs AI_SERVICE_SHARED_SECRET, OPENAI_API_KEY, or GEMINI_API_KEY.
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------
// Load .env from backend root
// ------------------------------------------------------------------
const envPath = resolve(__dirname, "../.env");
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
  console.log("[smoke] Loaded env from", envPath);
} else {
  console.log("[smoke] No .env found — relying on shell environment");
}

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const AI_SERVICE_SHARED_SECRET = process.env.AI_SERVICE_SHARED_SECRET || "";

if (!AI_SERVICE_SHARED_SECRET) {
  console.warn("[smoke] AI_SERVICE_SHARED_SECRET is not set — request may be rejected by the AI service");
}

// ------------------------------------------------------------------
// 1. Health check (does not require full LLM call)
// ------------------------------------------------------------------
async function checkHealth() {
  const url = `${AI_SERVICE_URL}/health`;
  console.log(`[smoke] Checking health → ${url}`);

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const body = await res.json();

  console.log(`[smoke] Health status: ${body.status || "unknown"}`);
  console.log(`[smoke]   active_provider: ${body.active_provider || "none"}`);
  console.log(`[smoke]   openai_configured: ${body.openai_configured}`);
  console.log(`[smoke]   gemini_configured: ${body.gemini_configured}`);

  if (body.status !== "healthy") {
    console.error("[smoke] ✗ AI service reports unhealthy status");
    return false;
  }
  return true;
}

// ------------------------------------------------------------------
// 2. Provider live probe (calls LLM, requires internal auth)
// ------------------------------------------------------------------
async function probeProviders() {
  const url = `${AI_SERVICE_URL}/api/admin/providers/health`;
  console.log(`\n[smoke] Live provider probe → ${url}`);

  const headers = { "Content-Type": "application/json" };
  if (AI_SERVICE_SHARED_SECRET) headers["x-internal-api-key"] = AI_SERVICE_SHARED_SECRET;

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    console.error(`[smoke] ✗ Provider health probe returned HTTP ${res.status}`);
    return false;
  }

  const body = await res.json();
  console.log(`[smoke] overall_ready: ${body.overall_ready}`);
  console.log(`[smoke] active_provider: ${body.active_provider}`);

  const openai = body.openai || {};
  const gemini = body.gemini || {};

  console.log(`\n[smoke] OpenAI:`);
  console.log(`[smoke]   configured: ${openai.api_key_present}`);
  console.log(`[smoke]   reachable:  ${openai.reachable}`);
  console.log(`[smoke]   latency_ms: ${openai.latency_ms ?? "n/a"}`);
  if (openai.last_error_safe) console.log(`[smoke]   error:      ${openai.last_error_safe}`);

  console.log(`\n[smoke] Gemini:`);
  console.log(`[smoke]   configured: ${gemini.api_key_present}`);
  console.log(`[smoke]   reachable:  ${gemini.reachable}`);
  console.log(`[smoke]   latency_ms: ${gemini.latency_ms ?? "n/a"}`);
  if (gemini.last_error_safe) console.log(`[smoke]   error:      ${gemini.last_error_safe}`);

  return body.overall_ready;
}

// ------------------------------------------------------------------
// Run
// ------------------------------------------------------------------
(async () => {
  let ok = false;
  try {
    const healthy = await checkHealth();
    if (!healthy) process.exit(1);

    const ready = await probeProviders();
    ok = ready;
  } catch (err) {
    // Never print full error — may contain key fragments
    const safe = String(err.message || err).slice(0, 200);
    console.error(`\n[smoke] ✗ Error: ${safe}`);
    if (safe.includes("ECONNREFUSED") || safe.includes("fetch failed")) {
      console.error(`[smoke]   Hint: Is the AI service running at ${AI_SERVICE_URL}?`);
      console.error(`[smoke]   Start it with: cd services && uvicorn main:app --port 8000`);
    }
    process.exit(1);
  }

  if (ok) {
    console.log("\n[smoke] ✓ AI service is reachable and provider is live");
    process.exit(0);
  } else {
    console.error("\n[smoke] ✗ AI service is reachable but no provider is ready");
    console.error("[smoke]   Check OPENAI_API_KEY and GEMINI_API_KEY in services/.env");
    process.exit(1);
  }
})();
