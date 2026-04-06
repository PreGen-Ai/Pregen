import mongoose from "mongoose";
const { Schema } = mongoose;

const documentVersionSchema = new Schema(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },

    versionNumber: { type: Number, required: true, min: 1 },

    url: { type: String, required: true, trim: true },

    modifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    metadata: { type: Schema.Types.Mixed, default: {} },

    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

// Uniqueness: one versionNumber per document
documentVersionSchema.index(
  { documentId: 1, versionNumber: 1 },
  { unique: true },
);

// Fast version history
documentVersionSchema.index({ documentId: 1, timestamp: -1 });

export default mongoose.model("DocumentVersion", documentVersionSchema);
