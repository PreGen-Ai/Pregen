import mongoose from "mongoose";

const TenantSettingsSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      required: false,
      unique: true,
    },

    ai: {
      enabled: { type: Boolean, default: true },
      feedbackTone: {
        type: String,
        enum: ["strict", "neutral", "encouraging"],
        default: "neutral",
      },
      softCapDaily: { type: Number, default: 50000 },
      softCapWeekly: { type: Number, default: 250000 },
      features: {
        aiGrading: { type: Boolean, default: true },
        aiQuizGen: { type: Boolean, default: true },
        aiTutor: { type: Boolean, default: true },
        aiSummaries: { type: Boolean, default: true },
      },
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
