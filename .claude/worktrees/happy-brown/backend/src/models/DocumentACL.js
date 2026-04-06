import mongoose from "mongoose";
const { Schema } = mongoose;

const documentAclSchema = new Schema(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    permission: {
      type: String,
      enum: ["read", "write", "admin"],
      default: "read",
      index: true,
    },
  },
  { timestamps: true },
);

// One ACL row per (document, user)
documentAclSchema.index({ documentId: 1, userId: 1 }, { unique: true });

// “Docs I can access”
documentAclSchema.index({ userId: 1, permission: 1 });

export default mongoose.model("DocumentACL", documentAclSchema);
