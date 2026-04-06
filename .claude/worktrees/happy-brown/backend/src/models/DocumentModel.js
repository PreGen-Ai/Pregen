import mongoose from "mongoose";
const { Schema } = mongoose;

const documentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 255 },

    type: { type: String, required: true, trim: true, maxlength: 120 },

    // Current active version URL (pointer)
    url: { type: String, required: true, trim: true },

    size: { type: Number, default: 0, min: 0 },

    cloudinary_id: { type: String, default: null, trim: true },

    description: { type: String, trim: true, default: "", maxlength: 5000 },

    version: { type: Number, default: 1, min: 1 },

    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },

    // AI / tagging
    tags: { type: [String], default: [], index: true },
    aiTags: { type: [String], default: [], index: true },

    classification: {
      type: String,
      enum: ["confidential", "public", "restricted", "internal"],
      default: "public",
      index: true,
    },

    // Keep metadata small. Large AI outputs should go elsewhere.
    metadata: { type: Schema.Types.Mixed, default: {} },

    // AI/search pointers (optional but very useful)
    textExtractRef: { type: String, default: null, trim: true }, // e.g. S3 key or DB ref
    embeddingRef: { type: String, default: null, trim: true }, // vector store key
    lastIndexedAt: { type: Date, default: null },

    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    restoredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Query-driven indexes
documentSchema.index({ courseId: 1, deleted: 1, createdAt: -1 }); // course docs list
documentSchema.index({ ownerId: 1, deleted: 1, createdAt: -1 }); // "my docs"
documentSchema.index({ classification: 1, courseId: 1, createdAt: -1 }); // compliance lists

// Optional: basic text search (Atlas Search is better)
documentSchema.index({ name: "text", description: "text", tags: "text" });

documentSchema.methods.softDelete = function () {
  this.deleted = true;
  this.deletedAt = new Date();
  return this.save();
};

documentSchema.methods.restore = function () {
  this.deleted = false;
  this.restoredAt = new Date();
  this.deletedAt = null;
  return this.save();
};

documentSchema.query.notDeleted = function () {
  return this.where({ deleted: false });
};

export default mongoose.model("Document", documentSchema);
