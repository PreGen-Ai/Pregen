import mongoose from "mongoose";
const { Schema } = mongoose;

const courseSectionSchema = new Schema(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true, // list sections by course fast
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    summary: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },

    // ordering in course outline
    position: {
      type: Number,
      required: true,
      min: 1,
      index: true,
    },

    // Optional status fields (useful later)
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "published",
      index: true,
    },

    // Soft delete (optional but recommended)
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/** -------------------------
 * Indexes (query-driven)
 * ------------------------ */

// ✅ enforce unique ordering per course
courseSectionSchema.index({ courseId: 1, position: 1 }, { unique: true });

// ✅ list sections in course outline order
courseSectionSchema.index({ courseId: 1, deleted: 1, position: 1 });

// Optional: quick search within a course
courseSectionSchema.index({ courseId: 1, title: 1 });

courseSectionSchema.query.notDeleted = function () {
  return this.where({ deleted: false });
};

export default mongoose.model("CourseSection", courseSectionSchema);
