import mongoose from "mongoose";
const { Schema } = mongoose;

const courseActivitySchema = new Schema(
  {
    // What kind of activity
    type: {
      type: String,
      enum: ["assignment", "quiz", "resource"],
      required: true,
      index: true,
    },

    // Who triggered it (needed for user feed & auditing)
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // What it points to (only one should be set based on `type`)
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assignment",
      default: null,
      index: true,
    },
    quizId: {
      type: Schema.Types.ObjectId,
      ref: "Quiz",
      default: null,
      index: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      default: null,
      index: true,
    },

    // Scope
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    sectionId: {
      type: Schema.Types.ObjectId,
      ref: "CourseSection",
      default: null,
      index: true,
    },

    // Visibility rules
    visibility: { type: Boolean, default: true, index: true },

    // Optional: extra metadata (keep small)
    meta: { type: Schema.Types.Mixed, default: {} },

    // Soft delete (optional but recommended)
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/** -------------------------
 * Indexes (query-driven)
 * ------------------------ */

// ✅ Your requested feed index:
courseActivitySchema.index({ userId: 1, createdAt: -1 });

// ✅ Course timeline (what happened in this course)
courseActivitySchema.index({ courseId: 1, visibility: 1, createdAt: -1 });

// ✅ Section timeline
courseActivitySchema.index({ sectionId: 1, visibility: 1, createdAt: -1 });

// ✅ Type-specific listing (optional but handy)
courseActivitySchema.index({ courseId: 1, type: 1, createdAt: -1 });

// ✅ Soft-delete safe lists
courseActivitySchema.index({ courseId: 1, deleted: 1, createdAt: -1 });

/** -------------------------
 * Validation: ensure correct reference is set
 * ------------------------ */
courseActivitySchema.pre("validate", function (next) {
  // Normalize empties
  if (!this.assignmentId) this.assignmentId = null;
  if (!this.quizId) this.quizId = null;
  if (!this.documentId) this.documentId = null;

  const hasAssignment = !!this.assignmentId;
  const hasQuiz = !!this.quizId;
  const hasDocument = !!this.documentId;

  const count = [hasAssignment, hasQuiz, hasDocument].filter(Boolean).length;

  // only one target allowed
  if (count > 1) {
    return next(
      new Error(
        "CourseActivity must reference only one of assignmentId/quizId/documentId.",
      ),
    );
  }

  // enforce type→target consistency
  if (this.type === "assignment" && !hasAssignment) {
    return next(new Error("type=assignment requires assignmentId."));
  }
  if (this.type === "quiz" && !hasQuiz) {
    return next(new Error("type=quiz requires quizId."));
  }
  if (this.type === "resource" && !hasDocument) {
    return next(new Error("type=resource requires documentId."));
  }

  next();
});

/** -------------------------
 * Query helper
 * ------------------------ */
courseActivitySchema.query.notDeleted = function () {
  return this.where({ deleted: false });
};

export default mongoose.model("CourseActivity", courseActivitySchema);
