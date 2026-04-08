// backend/src/cron/aiServiceKeepalive.js
//
// Pings the FastAPI AI service every 14 minutes so it never sleeps on
// Render free tier (which spins down after 15 minutes of inactivity).
// Also fires once on Node startup to pre-warm the service.

import cron from "node-cron";
import { AI_SERVICE_URL } from "../config/env.js";

const HEALTH_URL = `${AI_SERVICE_URL}/health`;
const PING_TIMEOUT_MS = 20000; // 20 s is enough for a health check

async function pingAiService() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

  try {
    const res = await fetch(HEALTH_URL, {
      method: "GET",
      signal: controller.signal,
    });
    console.log(`[ai-keepalive] health ping → ${res.status}`);
  } catch (err) {
    // AbortError (timeout) or network error — service may be waking up
    const msg = err?.name === "AbortError" ? "timed out" : (err?.message || String(err));
    console.warn(`[ai-keepalive] health ping failed: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

// Fire once immediately on startup so the service is warm before the first user request
pingAiService();

// Then every 14 minutes — one minute before Render's 15-minute inactivity threshold
cron.schedule("*/14 * * * *", () => {
  pingAiService();
});
