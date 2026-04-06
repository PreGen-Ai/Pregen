// models/AiUsage.js
import mongoose from "mongoose";

/**
 * ✅ Merged schema: AIUsageLogSchema + AiUsageSchema
 * - Keeps old fields: tokens, cost, requests
 * - Adds new breakdown: input/output tokens + cost, provider/model, endpoint, etc.
 * - Keeps indexes (tenant/time, feature/time) + adds useful ones
 * - Hot-reload safe export (prevents OverwriteModelError)
 */
const AiUsageSchema = new mongoose.Schema(
  {
    // -------- Multi-tenant (support BOTH styles) --------
    // old: ObjectId optional
    tenantId: {
      type: mongoose.Schema.Types.Mixed, // supports ObjectId OR string
      index: true,
      required: false,
    },

    // -------- Who / where --------
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    sessionId: { type: String, index: true },

    // -------- Provider / model --------
    provider: { type: String, default: "gemini", index: true },
    model: { type: String, default: "", index: true },

    // -------- Feature / endpoint --------
    feature: { type: String, default: "unknown", index: true }, // old default preserved
    endpoint: { type: String, index: true }, // e.g. POST /api/ai/quiz

    // -------- Correlation --------
    requestId: { type: String, index: true },

    // -------- Old counters --------
    requests: { type: Number, default: 1 },

    // old single-token accounting (compat)
    tokens: { type: Number, default: 0 }, // legacy total tokens
    cost: { type: Number, default: 0 }, // legacy total cost

    // -------- New token accounting --------
    inputTokens: { type: Number, default: 0 }, // aka tokensInput
    outputTokens: { type: Number, default: 0 }, // aka tokensOutput
    totalTokens: { type: Number, default: 0 }, // preferred total

    // -------- New cost accounting --------
    inputCost: { type: Number, default: 0 },
    outputCost: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 }, // preferred total (aka cost)
    currency: { type: String, default: "USD" },

    // -------- Performance + status --------
    latencyMs: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["ok", "error"],
      default: "ok",
      index: true,
    },
    success: { type: Boolean, default: true, index: true }, // legacy-friendly
    error: {
      message: String,
      code: String,
    },

    // -------- Debugging (NO prompts stored) --------
    promptChars: { type: Number, default: 0 },
    completionChars: { type: Number, default: 0 },

    // explicit timestamp for old code compatibility
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

/**
 * Compatibility/normalization:
 * - status <-> success sync
 * - totalTokens calc
 * - totalCost calc
 * - keep legacy tokens/cost in sync with totals (so old code still works)
 */
AiUsageSchema.pre("validate", function (next) {
  // status <-> success
  if (typeof this.success === "boolean") {
    this.status = this.success ? "ok" : "error";
  } else if (this.status) {
    this.success = this.status === "ok";
  }

  // tokens totals
  const inT = Number(this.inputTokens || 0);
  const outT = Number(this.outputTokens || 0);

  if (!this.totalTokens) this.totalTokens = inT + outT;

  // legacy tokens field: if empty, mirror totalTokens; if set, prefer it and mirror totals
  if (!this.tokens && this.totalTokens) this.tokens = this.totalTokens;
  if (this.tokens && !this.totalTokens)
    this.totalTokens = Number(this.tokens || 0);

  // cost totals
  const inC = Number(this.inputCost || 0);
  const outC = Number(this.outputCost || 0);

  if (!this.totalCost) this.totalCost = inC + outC;

  // legacy cost field: if empty, mirror totalCost; if set, prefer it and mirror totals
  if (!this.cost && this.totalCost) this.cost = this.totalCost;
  if (this.cost && !this.totalCost) this.totalCost = Number(this.cost || 0);

  next();
});

// indexes from both schemas
AiUsageSchema.index({ tenantId: 1, timestamp: -1 });
AiUsageSchema.index({ feature: 1, timestamp: -1 });

// extra helpful indexes
AiUsageSchema.index({ userId: 1, timestamp: -1 });
AiUsageSchema.index({ provider: 1, model: 1, timestamp: -1 });

export default mongoose.models.AiUsage ||
  mongoose.model("AiUsage", AiUsageSchema);
