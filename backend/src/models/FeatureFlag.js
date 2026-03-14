import mongoose from "mongoose";

const FeatureFlagSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    scope: {
      type: String,
      enum: ["global", "tenant"],
      default: "global",
      index: true,
    },
    defaultEnabled: { type: Boolean, default: false },

    // Tenant overrides (sparse)
    tenantOverrides: [
      {
        tenantId: { type: String, index: true },
        enabled: { type: Boolean, default: false },
      },
    ],

    updatedBy: { type: String }, // userId
  },
  { timestamps: true },
);

export default mongoose.model("FeatureFlag", FeatureFlagSchema);
