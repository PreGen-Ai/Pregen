#!/usr/bin/env python3
"""
scripts/smoke_test_openai.py
────────────────────────────
Quick smoke test for the OpenAI API key and model configured in the environment.

Usage:
  python scripts/smoke_test_openai.py

Exits 0 on success, 1 on failure.
Never prints the API key or any sensitive data.
"""

import os
import sys
import time
from pathlib import Path

# Load .env from the services/ directory
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)
        print(f"[smoke] Loaded env from {env_path}")
    else:
        print(f"[smoke] No .env found at {env_path} — relying on shell environment")
except ImportError:
    print("[smoke] python-dotenv not installed; relying on shell environment")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

if not OPENAI_API_KEY:
    print("[smoke] ✗ OPENAI_API_KEY is not set. Cannot run smoke test.")
    sys.exit(1)

# Redact key for display
key_preview = f"{OPENAI_API_KEY[:8]}...{OPENAI_API_KEY[-4:]}" if len(OPENAI_API_KEY) > 12 else "***"
print(f"[smoke] OPENAI_API_KEY present: {key_preview}")
print(f"[smoke] OPENAI_MODEL: {OPENAI_MODEL}")

try:
    import openai
except ImportError:
    print("[smoke] ✗ openai package not installed. Run: pip install openai")
    sys.exit(1)

print(f"[smoke] openai SDK version: {openai.__version__}")
print(f"[smoke] Sending probe to model={OPENAI_MODEL} ...")

client = openai.OpenAI(api_key=OPENAI_API_KEY)

t0 = time.perf_counter()
try:
    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[{"role": "user", "content": "Reply with the single word: OK"}],
        max_completion_tokens=5,
        temperature=0.0,
    )
    latency_ms = int((time.perf_counter() - t0) * 1000)

    text = (response.choices[0].message.content or "").strip() if response.choices else ""
    usage = response.usage
    in_tok = getattr(usage, "prompt_tokens", 0) or 0
    out_tok = getattr(usage, "completion_tokens", 0) or 0

    print(f"[smoke] ✓ Success in {latency_ms}ms")
    print(f"[smoke]   Model used: {response.model}")
    print(f"[smoke]   Response: {text!r}")
    print(f"[smoke]   Tokens — input: {in_tok}, output: {out_tok}")
    sys.exit(0)

except openai.AuthenticationError:
    latency_ms = int((time.perf_counter() - t0) * 1000)
    print(f"[smoke] ✗ AuthenticationError ({latency_ms}ms) — API key is invalid or expired.")
    sys.exit(1)

except openai.NotFoundError as e:
    latency_ms = int((time.perf_counter() - t0) * 1000)
    print(f"[smoke] ✗ NotFoundError ({latency_ms}ms) — model '{OPENAI_MODEL}' not found.")
    print(f"[smoke]   Hint: Check OPENAI_MODEL env var. Current value: {OPENAI_MODEL}")
    print(f"[smoke]   Valid models include: gpt-4o-mini, gpt-4o, gpt-4.1-mini, gpt-3.5-turbo")
    sys.exit(1)

except openai.RateLimitError:
    latency_ms = int((time.perf_counter() - t0) * 1000)
    print(f"[smoke] ✗ RateLimitError ({latency_ms}ms) — quota or rate limit exceeded.")
    print(f"[smoke]   Check your OpenAI usage dashboard.")
    sys.exit(1)

except openai.APIConnectionError as e:
    latency_ms = int((time.perf_counter() - t0) * 1000)
    print(f"[smoke] ✗ APIConnectionError ({latency_ms}ms) — cannot reach OpenAI API.")
    print(f"[smoke]   Check network/firewall on this host.")
    sys.exit(1)

except Exception as e:
    latency_ms = int((time.perf_counter() - t0) * 1000)
    # Never print full exception in case it contains key fragments
    safe_msg = str(e)[:200]
    print(f"[smoke] ✗ Unexpected error ({latency_ms}ms): {safe_msg}")
    sys.exit(1)
