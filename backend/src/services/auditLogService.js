import AuditLog from "../models/AuditLog.js";

function sanitizeMeta(meta = {}) {
  if (!meta || typeof meta !== "object") return {};

  return Object.entries(meta).reduce((acc, [key, value]) => {
    if (value === undefined) return acc;
    acc[key] = value;
    return acc;
  }, {});
}

export async function writeAuditLog({
  tenantId = null,
  level = "info",
  type = "SYSTEM",
  actor = "system",
  message,
  meta = {},
}) {
  if (!message) return null;

  try {
    return await AuditLog.create({
      tenantId,
      level,
      type,
      actor: actor ? String(actor) : "system",
      message: String(message),
      meta: sanitizeMeta(meta),
    });
  } catch (error) {
    console.error("Audit log write failed:", error);
    return null;
  }
}
