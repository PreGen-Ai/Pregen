#!/usr/bin/env python3
"""
scripts/diagnose_openai.py
──────────────────────────
Full OpenAI configuration diagnostic for the PreGen LMS AI service.

What it checks
──────────────
  1. Which .env file is being loaded and what OPENAI_* vars it sets
  2. Whether OPENAI_API_KEY exists and looks well-formed (no quotes/spaces)
  3. Whether OPENAI_BASE_URL is set (proxy/custom endpoint detection)
  4. GET /v1/models — lists all models the key can access
  5. Whether OPENAI_MODEL (configured model) is in the accessible list
  6. Whether OPENAI_SAFE_MODEL (fallback) is accessible
  7. Minimal chat completion with OPENAI_MODEL — end-to-end latency
  8. Minimal chat completion with gpt-4o-mini — known-good comparison

Usage
──────
  cd services
  python scripts/diagnose_openai.py

Exits 0 if both the key and the configured model work.
Exits 1 if the key is missing or the configured model is inaccessible.
Prints no secrets.
"""

import os
import sys
import time
from pathlib import Path

# ── Load .env ──────────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)
        print(f"[diag] Loaded env: {env_path}")
    else:
        print(f"[diag] No .env found at {env_path}  — relying on shell environment")
        print(f"[diag] Tip: copy services/.env.example → services/.env and fill in your keys.")
except ImportError:
    print("[diag] python-dotenv not installed — relying on shell environment")


def _clean(name: str) -> str:
    """Read env var and strip leading/trailing whitespace and surrounding quotes."""
    v = (os.getenv(name) or "").strip()
    if len(v) >= 2 and v[0] in ('"', "'") and v[-1] == v[0]:
        v = v[1:-1].strip()
    return v


def _redact(key: str, show: int = 8) -> str:
    if not key:
        return "[NOT SET]"
    return f"{key[:show]}...({'*' * 6})"


# ── Resolve config ─────────────────────────────────────────────────────────────
OPENAI_API_KEY   = _clean("OPENAI_API_KEY") or _clean("OPENAI_KEY") or ""
OPENAI_MODEL     = _clean("OPENAI_MODEL") or "gpt-4o-mini"
OPENAI_SAFE_MODEL = _clean("OPENAI_SAFE_MODEL") or ""
OPENAI_BASE_URL  = _clean("OPENAI_BASE_URL") or ""

KNOWN_SAFE_MODEL = "gpt-4o-mini"   # universally accessible baseline for comparison

print()
print("=" * 60)
print("  OpenAI Configuration Diagnostic")
print("=" * 60)
print(f"  API key:    {_redact(OPENAI_API_KEY)}")
print(f"  Model:      {OPENAI_MODEL}")
print(f"  Safe model: {OPENAI_SAFE_MODEL or '(not set — in-model fallback disabled)'}")
print(f"  Base URL:   {OPENAI_BASE_URL or 'https://api.openai.com/v1 (default)'}")
print("=" * 60)

# ── Guard: key required ────────────────────────────────────────────────────────
if not OPENAI_API_KEY:
    print()
    print("✗  OPENAI_API_KEY is not set.")
    print("   → Set OPENAI_API_KEY in services/.env")
    sys.exit(1)

# ── Common quote-in-key warning ────────────────────────────────────────────────
raw_key = os.getenv("OPENAI_API_KEY", "")
if raw_key != raw_key.strip() or (raw_key and raw_key[0] in ('"', "'")):
    print()
    print("⚠  OPENAI_API_KEY appears to have leading/trailing whitespace or quotes.")
    print("   Raw value starts with:", repr(raw_key[:3]))
    print("   This can cause auth failures. Remove the quotes from your .env file.")

if OPENAI_BASE_URL:
    print()
    print(f"⚠  Custom OPENAI_BASE_URL detected: {OPENAI_BASE_URL}")
    print("   If this is an Azure endpoint, OpenRouter, or LiteLLM proxy, ensure")
    print("   the endpoint supports Chat Completions and the configured model.")

# ── Import openai SDK ──────────────────────────────────────────────────────────
try:
    import openai
    print(f"\n[diag] openai SDK version: {openai.__version__}")
except ImportError:
    print("\n✗  openai package not installed. Run: pip install openai")
    sys.exit(1)

# ── Build client ──────────────────────────────────────────────────────────────
client_kwargs = {"api_key": OPENAI_API_KEY}
if OPENAI_BASE_URL:
    client_kwargs["base_url"] = OPENAI_BASE_URL
client = openai.OpenAI(**client_kwargs)

# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — List accessible models
# ─────────────────────────────────────────────────────────────────────────────
print("\n── Step 1: Listing accessible models (GET /v1/models) ──")
accessible_models: set[str] = set()

try:
    t0 = time.perf_counter()
    models_resp = client.models.list()
    latency_ms = int((time.perf_counter() - t0) * 1000)
    accessible_models = {m.id for m in models_resp.data}
    print(f"   ✓ /v1/models responded in {latency_ms}ms — {len(accessible_models)} models accessible")

    gpt_models = sorted(m for m in accessible_models if "gpt" in m or m.startswith("o"))
    if gpt_models:
        print(f"   GPT/o-series models: {', '.join(gpt_models[:15])}")
        if len(gpt_models) > 15:
            print(f"   ... and {len(gpt_models) - 15} more")
    else:
        print("   No GPT/o-series models found. Check your API key's project access.")

except openai.AuthenticationError:
    print("   ✗ AuthenticationError — API key is invalid or expired.")
    print("     Check OPENAI_API_KEY in services/.env.")
    sys.exit(1)
except openai.APIConnectionError as e:
    print(f"   ✗ APIConnectionError — cannot reach OpenAI API.")
    print(f"     Base URL: {OPENAI_BASE_URL or 'default'}")
    print(f"     Check network/firewall. Error: {str(e)[:100]}")
    sys.exit(1)
except Exception as e:
    print(f"   ✗ Unexpected error listing models: {str(e)[:150]}")

# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — Check configured model vs accessible models
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n── Step 2: Model accessibility check ──")

def check_model(model_id: str, label: str) -> bool:
    if not model_id:
        print(f"   {label}: (not configured)")
        return False
    if accessible_models and model_id in accessible_models:
        print(f"   ✓ {label} ({model_id}): accessible via /v1/models")
        return True
    elif accessible_models:
        print(f"   ✗ {label} ({model_id}): NOT in your accessible models list")
        print(f"     This does NOT mean the model doesn't exist globally.")
        print(f"     It means your API key / project does not have access to it.")
        print(f"     → Contact OpenAI support or switch to a model you do have access to.")
        return False
    else:
        print(f"   ? {label} ({model_id}): could not verify (model list unavailable)")
        return None

configured_ok = check_model(OPENAI_MODEL, "OPENAI_MODEL")
check_model(OPENAI_SAFE_MODEL, "OPENAI_SAFE_MODEL")
check_model(KNOWN_SAFE_MODEL, f"Baseline ({KNOWN_SAFE_MODEL})")

# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — Live chat completion with OPENAI_MODEL
# ─────────────────────────────────────────────────────────────────────────────
print(f"\n── Step 3: Live completion — OPENAI_MODEL={OPENAI_MODEL} ──")

def _do_completion(model_id: str) -> dict:
    """Run a minimal chat completion. Returns dict with ok, latency_ms, text, error."""
    t0 = time.perf_counter()
    try:
        resp = client.chat.completions.create(
            model=model_id,
            messages=[{"role": "user", "content": "Reply with the single word: OK"}],
            max_completion_tokens=5,
            temperature=0.0,
        )
        latency_ms = int((time.perf_counter() - t0) * 1000)
        text = (resp.choices[0].message.content or "").strip() if resp.choices else ""
        usage = resp.usage
        in_tok = getattr(usage, "prompt_tokens", 0) or 0
        out_tok = getattr(usage, "completion_tokens", 0) or 0
        return {"ok": True, "latency_ms": latency_ms, "text": text,
                "in_tok": in_tok, "out_tok": out_tok, "model_used": resp.model}
    except openai.NotFoundError as e:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {"ok": False, "latency_ms": latency_ms,
                "error_type": "model_not_found",
                "error": (
                    f"model_not_found for '{model_id}'. "
                    "This means your API key/project does not have access to this model. "
                    "It may exist globally but not be available on your plan. "
                    "→ Try gpt-4o-mini or gpt-4.1-mini."
                )}
    except openai.AuthenticationError:
        return {"ok": False, "error_type": "auth", "error": "API key invalid or expired."}
    except openai.RateLimitError:
        return {"ok": False, "error_type": "rate_limit",
                "error": "Rate limit exceeded — transient, retry later."}
    except Exception as e:
        return {"ok": False, "error_type": "unknown", "error": str(e)[:200]}


result = _do_completion(OPENAI_MODEL)
configured_live_ok = result["ok"]

if result["ok"]:
    print(f"   ✓ Success — {result['latency_ms']}ms | model_used={result['model_used']}")
    print(f"     Response: {result['text']!r} | tokens: in={result['in_tok']} out={result['out_tok']}")
else:
    print(f"   ✗ Failed ({result['error_type']}) — {result['error']}")
    if result.get("error_type") == "model_not_found" and OPENAI_SAFE_MODEL:
        print(f"\n   Retrying with OPENAI_SAFE_MODEL={OPENAI_SAFE_MODEL} ...")
        safe_result = _do_completion(OPENAI_SAFE_MODEL)
        if safe_result["ok"]:
            print(f"   ✓ Safe model works — {safe_result['latency_ms']}ms")
            print(f"     → Set OPENAI_MODEL={OPENAI_SAFE_MODEL} in your .env, or get plan access for {OPENAI_MODEL}")
        else:
            print(f"   ✗ Safe model also failed: {safe_result['error']}")

# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — Baseline comparison (gpt-4o-mini)
# ─────────────────────────────────────────────────────────────────────────────
if OPENAI_MODEL != KNOWN_SAFE_MODEL:
    print(f"\n── Step 4: Baseline comparison — {KNOWN_SAFE_MODEL} ──")
    baseline = _do_completion(KNOWN_SAFE_MODEL)
    if baseline["ok"]:
        print(f"   ✓ {KNOWN_SAFE_MODEL} works — {baseline['latency_ms']}ms")
        if not configured_live_ok:
            print(f"   → Your key CAN call OpenAI but NOT {OPENAI_MODEL}.")
            print(f"   → This is a model-access issue, not an API key issue.")
            print(f"   → Set OPENAI_MODEL=gpt-4o-mini or request access to {OPENAI_MODEL}.")
    else:
        print(f"   ✗ {KNOWN_SAFE_MODEL} also failed: {baseline['error']}")
        print(f"   → Baseline model unavailable — likely an auth or network issue.")

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 60)
print("  Summary")
print("=" * 60)
print(f"  OPENAI_API_KEY present:   {'yes' if OPENAI_API_KEY else 'NO'}")
print(f"  OPENAI_MODEL={OPENAI_MODEL}")
print(f"  Model in accessible list: {configured_ok}")
print(f"  Live completion works:    {configured_live_ok}")
print(f"  Base URL (custom):        {OPENAI_BASE_URL or 'no (using openai default)'}")
print()

if configured_live_ok:
    print("✓ OpenAI is working correctly with the configured model.")
    sys.exit(0)
else:
    print("✗ OpenAI is NOT working with the configured model.")
    print()
    print("Troubleshooting checklist:")
    print("  1. Check OPENAI_API_KEY — no quotes, no leading spaces in .env")
    print("  2. Check OPENAI_MODEL — is it accessible on your API key's plan?")
    print("  3. Try: OPENAI_MODEL=gpt-4o-mini (always available on standard keys)")
    print("  4. Check OPENAI_BASE_URL — leave blank for standard OpenAI API")
    print("  5. Visit platform.openai.com/account/limits to check model access")
    sys.exit(1)
