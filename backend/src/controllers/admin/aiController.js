import TenantSettings from "../../models/TenantSettings.js";
import { getTenantId } from "../../middleware/authMiddleware.js";

export async function getAiSettings(req, res) {
  try {
    const tenantId = getTenantId(req);
    const filter = tenantId ? { tenantId } : {};

    let doc = await TenantSettings.findOne(filter).lean();
    if (!doc) {
      doc = await TenantSettings.create({ ...(tenantId ? { tenantId } : {}) });
      doc = doc.toObject();
    }

    return res.json({ settings: doc.ai });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to load AI settings", error: String(e) });
  }
}

export async function updateAiSettings(req, res) {
  try {
    const tenantId = getTenantId(req);
    const filter = tenantId ? { tenantId } : {};

    const ai = req.body;
    const doc = await TenantSettings.findOneAndUpdate(
      filter,
      { $set: { ai } },
      { upsert: true, new: true },
    ).lean();

    return res.json({ message: "Saved", settings: doc.ai });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to save AI settings", error: String(e) });
  }
}
