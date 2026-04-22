from __future__ import annotations

import json
import os
from functools import lru_cache
from typing import Any, Dict, Optional

DEFAULT_CURRENCY = "USD"

# Default rates are in USD per 1M tokens.
# Verified on April 22, 2026 from official pricing pages:
# - OpenAI API pricing: gpt-5.4-nano input $0.20 / output $1.25 per 1M tokens
# - Gemini Developer API pricing: gemini-2.5-flash standard input $0.30 / output $2.50 per 1M tokens
DEFAULT_MODEL_PRICING: Dict[str, Dict[str, Dict[str, Any]]] = {
    "openai": {
        "gpt-5.4": {"input": 2.50, "output": 15.00},
        "gpt-5.4-mini": {"input": 0.75, "output": 4.50},
        "gpt-5.4-nano": {"input": 0.20, "output": 1.25},
        "gpt-5": {"input": 1.25, "output": 10.00},
        "gpt-5-mini": {"input": 0.25, "output": 2.00},
        "gpt-5-nano": {"input": 0.05, "output": 0.40},
    },
    "gemini": {
        "gemini-2.5-flash": {"input": 0.30, "output": 2.50},
        "gemini-2.5-flash-lite": {"input": 0.10, "output": 0.40},
    },
}


def _normalize_provider(value: Optional[str]) -> str:
    return str(value or "").strip().lower()


def _normalize_model(value: Optional[str]) -> str:
    return str(value or "").strip().lower()


def _clone_catalog(catalog: Dict[str, Dict[str, Dict[str, Any]]]) -> Dict[str, Dict[str, Dict[str, Any]]]:
    return {
        provider: {
            model: dict(spec)
            for model, spec in models.items()
        }
        for provider, models in catalog.items()
    }


def _coerce_spec(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None

    input_rate = raw.get("input")
    if input_rate is None:
        input_rate = raw.get("input_per_million")
    if input_rate is None:
        input_rate = raw.get("input_price_per_million")

    output_rate = raw.get("output")
    if output_rate is None:
        output_rate = raw.get("output_per_million")
    if output_rate is None:
        output_rate = raw.get("output_price_per_million")

    try:
        input_rate = float(input_rate)
        output_rate = float(output_rate)
    except (TypeError, ValueError):
        return None

    return {
        "input": max(0.0, input_rate),
        "output": max(0.0, output_rate),
        "currency": str(raw.get("currency") or DEFAULT_CURRENCY).upper(),
    }


def _apply_override(
    catalog: Dict[str, Dict[str, Dict[str, Any]]],
    provider: str,
    model: str,
    spec: Dict[str, Any],
    source: str,
) -> None:
    provider_key = _normalize_provider(provider)
    model_key = _normalize_model(model)
    if not provider_key or not model_key:
        return

    catalog.setdefault(provider_key, {})
    merged = dict(spec)
    merged["_source"] = source
    catalog[provider_key][model_key] = merged


@lru_cache(maxsize=1)
def get_pricing_catalog() -> Dict[str, Dict[str, Dict[str, Any]]]:
    catalog = _clone_catalog(DEFAULT_MODEL_PRICING)

    raw = (os.getenv("AI_MODEL_PRICING_JSON") or "").strip()
    if not raw:
        return catalog

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return catalog

    if not isinstance(parsed, dict):
        return catalog

    for provider, models in parsed.items():
        provider_key = _normalize_provider(provider)
        if not provider_key or not isinstance(models, dict):
            continue

        for model, raw_spec in models.items():
            spec = _coerce_spec(raw_spec)
            if spec:
                _apply_override(catalog, provider_key, str(model), spec, "env:AI_MODEL_PRICING_JSON")

    return catalog


def resolve_pricing(provider: Optional[str], model: Optional[str]) -> Optional[Dict[str, Any]]:
    provider_key = _normalize_provider(provider)
    model_key = _normalize_model(model)
    if not model_key:
        return None

    catalog = get_pricing_catalog()
    candidate_providers = [provider_key] if provider_key else list(catalog.keys())

    for provider_name in candidate_providers:
        provider_catalog = catalog.get(provider_name) or {}
        if not provider_catalog:
            continue

        if model_key in provider_catalog:
            spec = dict(provider_catalog[model_key])
            spec["provider"] = provider_name
            spec["canonical_model"] = model_key
            spec["source"] = spec.pop("_source", "default_catalog")
            return spec

        for candidate_model in sorted(provider_catalog.keys(), key=len, reverse=True):
            if model_key.startswith(candidate_model):
                spec = dict(provider_catalog[candidate_model])
                spec["provider"] = provider_name
                spec["canonical_model"] = candidate_model
                spec["source"] = spec.pop("_source", "default_catalog")
                return spec

    return None


def estimate_usage_cost(
    *,
    provider: Optional[str],
    model: Optional[str],
    input_tokens: Optional[int],
    output_tokens: Optional[int],
) -> Optional[Dict[str, Any]]:
    pricing = resolve_pricing(provider, model)
    if pricing is None:
        return None

    try:
        in_tok = max(0, int(input_tokens or 0))
        out_tok = max(0, int(output_tokens or 0))
    except (TypeError, ValueError):
        return None

    input_cost = (in_tok * float(pricing["input"])) / 1_000_000
    output_cost = (out_tok * float(pricing["output"])) / 1_000_000

    return {
        "provider": pricing["provider"],
        "canonical_model": pricing["canonical_model"],
        "currency": pricing.get("currency", DEFAULT_CURRENCY),
        "input_cost": input_cost,
        "output_cost": output_cost,
        "total_cost": input_cost + output_cost,
        "source": pricing.get("source", "default_catalog"),
    }
