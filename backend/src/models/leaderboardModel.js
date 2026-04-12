import mongoose from "mongoose";

const { Schema } = mongoose;

const leaderboardSchema = new Schema(
  {
    tenantId: {
      type: String,
      default: null,
      index: true,
    },

    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      default: null,
      index: true,
    },
    classId: {
      type: Schema.Types.ObjectId,
      ref: "Classroom",
      default: null,
      index: true,
    },
    className: {
      type: String,
      default: null,
      trim: true,
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
    points: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    lastUpdatedFrom: {
      type: String,
      enum: ["quiz", "assignment", "manual", "import"],
      default: "quiz",
    },
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

leaderboardSchema.index(
  {
    tenantId: 1,
    studentId: 1,
    workspaceId: 1,
    classId: 1,
    courseId: 1,
    subject: 1,
  },
  { unique: true },
);

leaderboardSchema.index({ tenantId: 1, courseId: 1, points: -1, updatedAt: -1 });
leaderboardSchema.index({ tenantId: 1, classId: 1, points: -1, updatedAt: -1 });
leaderboardSchema.index({
  tenantId: 1,
  workspaceId: 1,
  points: -1,
  updatedAt: -1,
});
leaderboardSchema.index({ tenantId: 1, subject: 1, points: -1, updatedAt: -1 });
leaderboardSchema.index({ tenantId: 1, className: 1, points: -1 });
leaderboardSchema.index({ tenantId: 1, points: -1, _id: -1 });

leaderboardSchema.query.notDeleted = function () {
  return this.where({ deleted: false });
};

leaderboardSchema.virtual("student")
  .get(function () {
    return this.studentId || null;
  })
  .set(function (value) {
    this.studentId = value;
  });

export default mongoose.models.Leaderboard ||
  mongoose.model("Leaderboard", leaderboardSchema);
