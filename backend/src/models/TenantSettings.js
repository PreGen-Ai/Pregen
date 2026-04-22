import mongoose from "mongoose";

const AiFeaturesSchema = new mongoose.Schema(
  {
    aiGrading: { type: Boolean, default: true },
    aiQuizGen: { type: Boolean, default: true },
    aiTutor: { type: Boolean, default: true },
    aiSummaries: { type: Boolean, default: true },
  },
  { _id: false },
);

const AiSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },
    feedbackTone: {
      type: String,
      enum: ["strict", "neutral", "encouraging"],
      default: "neutral",
    },
    minTokens: { type: Number, default: 256 },
    maxTokens: { type: Number, default: 4096 },
    softCapDaily: { type: Number, default: 50000 },
    softCapWeekly: { type: Number, default: 250000 },
    features: {
      type: AiFeaturesSchema,
      default: () => ({}),
    },
  },
  { _id: false },
);

const AiOverrideFeaturesSchema = new mongoose.Schema(
  {
    aiGrading: { type: Boolean, default: undefined },
    aiQuizGen: { type: Boolean, default: undefined },
    aiTutor: { type: Boolean, default: undefined },
    aiSummaries: { type: Boolean, default: undefined },
  },
  { _id: false },
);

const AiOverrideSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: undefined },
    feedbackTone: {
      type: String,
      enum: ["strict", "neutral", "encouraging"],
      default: undefined,
    },
    minTokens: { type: Number, default: undefined },
    maxTokens: { type: Number, default: undefined },
    softCapDaily: { type: Number, default: undefined },
    softCapWeekly: { type: Number, default: undefined },
    features: {
      type: AiOverrideFeaturesSchema,
      default: undefined,
    },
  },
  { _id: false },
);

const TenantSettingsSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      index: true,
      required: false,
      unique: true,
    },

    // Platform defaults live on the global doc (tenantId null / absent).
    // Tenant docs may still carry legacy full ai settings; the runtime resolver
    // only treats them as overrides when they differ from platform defaults.
    ai: {
      type: AiSettingsSchema,
      default: () => ({}),
    },

    // Canonical tenant-specific override storage.
    aiOverride: {
      type: AiOverrideSchema,
      default: undefined,
    },

    branding: {
      institutionName: { type: String, default: "PreGen" },
      primaryColor: { type: String, default: "#D4AF37" },
      logoUrl: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

export default mongoose.model("TenantSettings", TenantSettingsSchema);
