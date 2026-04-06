import TenantSettings from "../../models/TenantSettings.js";
import { getTenantId } from "../../middleware/authMiddleware.js";

export async function getBranding(req, res) {
  try {
    const tenantId = getTenantId(req);
    const filter = tenantId ? { tenantId } : {};

    let doc = await TenantSettings.findOne(filter).lean();
    if (!doc) {
      doc = await TenantSettings.create({ ...(tenantId ? { tenantId } : {}) });
      doc = doc.toObject();
    }

    return res.json({ branding: doc.branding });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to load branding", error: String(e) });
  }
}

export async function updateBranding(req, res) {
  try {
    const tenantId = getTenantId(req);
    const filter = tenantId ? { tenantId } : {};
    const branding = req.body;

    const doc = await TenantSettings.findOneAndUpdate(
      filter,
      { $set: { branding } },
      { upsert: true, new: true },
    ).lean();

    return res.json({ message: "Saved", branding: doc.branding });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to save branding", error: String(e) });
  }
}

export async function setLogoUrl(req, res) {
  try {
    const tenantId = getTenantId(req);
    const filter = tenantId ? { tenantId } : {};

    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    // You will likely store on S3/Cloudinary; this is local/static compatible:
    const logoUrl = `/uploads/${req.file.filename}`;

    const doc = await TenantSettings.findOneAndUpdate(
      filter,
      { $set: { "branding.logoUrl": logoUrl } },
      { upsert: true, new: true },
    ).lean();

    return res.json({ message: "Uploaded", logoUrl: doc.branding.logoUrl });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to upload logo", error: String(e) });
  }
}
