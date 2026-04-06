import mongoose from "mongoose";

const AuditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: String, index: true },
    level: {
      type: String,
      enum: ["info", "warn", "error", "security"],
      default: "info",
      index: true,
    },
    type: { type: String, default: "SYSTEM", index: true },
    actor: { type: String, default: "" }, // userId or "system"
    message: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed }, // sanitized metadata only
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

export default mongoose.model("AuditLog", AuditLogSchema);
