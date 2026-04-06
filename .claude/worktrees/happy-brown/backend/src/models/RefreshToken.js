// models/RefreshToken.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // store ONLY a hash of the token
    tokenHash: { type: String, required: true, unique: true, index: true },

    // rotation chain (optional but useful)
    replacedByTokenHash: { type: String, default: null },
    revokedAt: { type: Date, default: null },
    revokeReason: { type: String, default: "" },

    createdByIp: { type: String, default: "" },
    userAgent: { type: String, default: "" },

    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// list sessions by user
refreshTokenSchema.index({ userId: 1, createdAt: -1 });

// TTL cleanup (auto delete after expiry)
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("RefreshToken", refreshTokenSchema);
