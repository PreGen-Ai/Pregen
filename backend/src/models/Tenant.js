import mongoose from "mongoose";

const { Schema, Types } = mongoose;

const TenantSchema = new Schema(
  {
    tenantId: { type: String, required: true, unique: true },
    name: { type: String, required: true },

    status: {
      type: String,
      enum: ["active", "suspended", "trial"],
      default: "trial",
      index: true,
    },

    plan: { type: String, default: "basic", index: true },

    limits: {
      aiHardCapTokensPerMonth: { type: Number, default: 0 },
      aiSoftCapTokensPerMonth: { type: Number, default: 0 },
      studentLimit: { type: Number, default: 0 },
    },

    branding: {
      logoUrl: { type: String },
      primaryColor: { type: String },
      subdomain: { type: String, index: true },
    },

    members: {
      admins: [
        {
          type: Types.ObjectId,
          ref: "User",
        },
      ],
      teachers: [
        {
          type: Types.ObjectId,
          ref: "User",
        },
      ],
      students: [
        {
          type: Types.ObjectId,
          ref: "User",
        },
      ],
    },
  },
  { timestamps: true },
);

export default mongoose.model("Tenant", TenantSchema);
