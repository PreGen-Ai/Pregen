import mongoose from "mongoose";
const { Schema } = mongoose;

const leaderboardSchema = new Schema(
  {
    // Who
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Scope (pick what you need — all optional but indexed)
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
      index: true,
    },

    classId: {
      type: Schema.Types.ObjectId,
      ref: "Class",
      default: null,
      index: true,
    },

    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      default: null,
      index: true,
    },

    subject: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    // Ranking
    points: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },

    // Optional metadata
    lastUpdatedFrom: {
      type: String,
      enum: ["quiz", "assignment", "manual", "import"],
      default: "quiz",
    },

    // Soft delete
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/** -------------------------
 * Enforce uniqueness
 * ------------------------ */
// One leaderboard row per student per scope
leaderboardSchema.index(
  {
    studentId: 1,
    workspaceId: 1,
    classId: 1,
    courseId: 1,
    subject: 1,
  },
  { unique: true },
);

/** -------------------------
 * Fast ranking queries
 * ------------------------ */
// Top students in course / class / workspace
leaderboardSchema.index({ courseId: 1, points: -1, updatedAt: -1 });
leaderboardSchema.index({ classId: 1, points: -1, updatedAt: -1 });
leaderboardSchema.index({ workspaceId: 1, points: -1, updatedAt: -1 });
leaderboardSchema.index({ subject: 1, points: -1, updatedAt: -1 });
leaderboardSchema.index({ points: -1, _id: -1 });
leaderboardSchema.index({ className: 1, points: -1 });
leaderboardSchema.index({ student: 1 });

/** -------------------------
 * Query helper
 * ------------------------ */
leaderboardSchema.query.notDeleted = function () {
  return this.where({ deleted: false });
};

export default mongoose.model("Leaderboard", leaderboardSchema);
