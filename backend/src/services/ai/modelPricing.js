const DEFAULT_CURRENCY = "USD";

// Default rates are USD per 1M tokens.
// Verified on April 22, 2026 from official provider pricing pages.
const DEFAULT_MODEL_PRICING = {
  openai: {
    "gpt-5.4": { input: 2.5, output: 15.0 },
    "gpt-5.4-mini": { input: 0.75, output: 4.5 },
    "gpt-5.4-nano": { input: 0.2, output: 1.25 },
    "gpt-5": { input: 1.25, output: 10.0 },
    "gpt-5-mini": { input: 0.25, output: 2.0 },
    "gpt-5-nano": { input: 0.05, output: 0.4 },
  },
  gemini: {
    "gemini-2.5-flash": { input: 0.3, output: 2.5 },
    "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  },
};

function normalizeProvider(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeModel(value) {
  return String(value || "").trim().toLowerCase();
}

function cloneCatalog(catalog) {
  const cloned = {};
  for (const [provider, models] of Object.entries(catalog || {})) {
    cloned[provider] = {};
    for (const [model, spec] of Object.entries(models || {})) {
      cloned[provider][model] = { ...spec };
    }
  }
  return cloned;
}

function coerceSpec(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const inputRate =
    raw.input ?? raw.input_per_million ?? raw.input_price_per_million;
  const outputRate =
    raw.output ?? raw.output_per_million ?? raw.output_price_per_million;

  const input = Number(inputRate);
  const output = Number(outputRate);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null;

  return {
    input: Math.max(0, input),
    output: Math.max(0, output),
    currency: String(raw.currency || DEFAULT_CURRENCY).toUpperCase(),
  };
}

let cachedCatalog = null;

function getPricingCatalog() {
  if (cachedCatalog) return cachedCatalog;

  const catalog = cloneCatalog(DEFAULT_MODEL_PRICING);
  const raw = String(process.env.AI_MODEL_PRICING_JSON || "").trim();
  if (!raw) {
    cachedCatalog = catalog;
    return catalog;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [provider, models] of Object.entries(parsed)) {
        const providerKey = normalizeProvider(provider);
        if (!providerKey || !models || typeof models !== "object" || Array.isArray(models)) {
          continue;
        }

        catalog[providerKey] = catalog[providerKey] || {};
        for (const [model, rawSpec] of Object.entries(models)) {
          const spec = coerceSpec(rawSpec);
          if (!spec) continue;
          catalog[providerKey][normalizeModel(model)] = {
            ...spec,
            _source: "env:AI_MODEL_PRICING_JSON",
          };
        }
      }
    }
  } catch {
    // Ignore malformed override and fall back to built-in defaults.
  }

  cachedCatalog = catalog;
  return catalog;
}

export function resolvePricing({ provider, model }) {
  const modelKey = normalizeModel(model);
  if (!modelKey) return null;

  const providerKey = normalizeProvider(provider);
  const catalog = getPricingCatalog();
  const candidateProviders = providerKey ? [providerKey] : Object.keys(catalog);

  for (const currentProvider of candidateProviders) {
    const providerCatalog = catalog[currentProvider] || {};
    if (providerCatalog[modelKey]) {
      const spec = providerCatalog[modelKey];
      return {
        ...spec,
        provider: currentProvider,
        canonicalModel: modelKey,
        source: spec._source || "default_catalog",
      };
    }

    const candidateModels = Object.keys(providerCatalog).sort(
      (a, b) => b.length - a.length,
    );
    for (const candidateModel of candidateModels) {
      if (modelKey.startsWith(candidateModel)) {
        const spec = providerCatalog[candidateModel];
        return {
          ...spec,
          provider: currentProvider,
          canonicalModel: candidateModel,
          source: spec._source || "default_catalog",
        };
      }
    }
  }

  return null;
}

export function estimateUsageCost({
  provider,
  model,
  inputTokens = 0,
  outputTokens = 0,
}) {
  const pricing = resolvePricing({ provider, model });
  if (!pricing) return null;

  const inTok = Math.max(0, Number(inputTokens || 0));
  const outTok = Math.max(0, Number(outputTokens || 0));

  const inputCost = (inTok * pricing.input) / 1_000_000;
  const outputCost = (outTok * pricing.output) / 1_000_000;

  return {
    provider: pricing.provider,
    canonicalModel: pricing.canonicalModel,
    currency: pricing.currency || DEFAULT_CURRENCY,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    source: pricing.source || "default_catalog",
  };
}
