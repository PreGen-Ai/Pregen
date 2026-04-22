import { getTenantId } from "../../middleware/authMiddleware.js";
import {
  resetTenantAiSettings,
  resolveAiSettingsBundle,
  savePlatformAiSettings,
  saveTenantAiSettings,
} from "../../services/ai/tenantAiSettingsService.js";

function serializeAiSettingsBundle(bundle) {
  return {
    settings: bundle.effective,
    effective: bundle.effective,
    platformDefaults: bundle.platformDefaults,
    override: bundle.override,
    inheritance: bundle.inheritance,
    hasOverride: bundle.hasOverride,
    scope: {
      mode: bundle.scope,
      tenantId: bundle.tenantId,
    },
  };
}

export async function getAiSettings(req, res) {
  try {
    const tenantId = getTenantId(req);
    const bundle = await resolveAiSettingsBundle({
      tenantId,
      createPlatformIfMissing: true,
    });
    return res.json(serializeAiSettingsBundle(bundle));
  } catch (e) {
    return res
      .status(e?.status || 500)
      .json({ message: "Failed to load AI settings", error: String(e) });
  }
}

export async function updateAiSettings(req, res) {
  try {
    const tenantId = getTenantId(req);
    const bundle = tenantId
      ? await saveTenantAiSettings({
          tenantId,
          payload: req.body || {},
        })
      : await savePlatformAiSettings(req.body || {});

    return res.json({
      message: tenantId
        ? "Tenant AI override saved"
        : "Platform AI defaults saved",
      ...serializeAiSettingsBundle(bundle),
    });
  } catch (e) {
    return res
      .status(e?.status || 500)
      .json({ message: "Failed to save AI settings", error: String(e) });
  }
}

export async function resetAiSettings(req, res) {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        message: "Tenant scope is required to reset AI overrides",
      });
    }

    const bundle = await resetTenantAiSettings(tenantId);
    return res.json({
      message: "Tenant AI override reset to inherited platform defaults",
      ...serializeAiSettingsBundle(bundle),
    });
  } catch (e) {
    return res
      .status(e?.status || 500)
      .json({ message: "Failed to reset AI settings", error: String(e) });
  }
}
