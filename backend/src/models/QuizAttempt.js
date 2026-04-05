import mongoose from "mongoose";
const { Schema } = mongoose;

const attemptFileSchema = new Schema(
  {
    filename: { type: String, default: "", trim: true, maxlength: 255 },
    filePath: { type: String, default: "", trim: true }, // ideally storage key/URL
    originalName: { type: String, default: "", trim: true, maxlength: 255 },
  },
  { _id: false },
);

const attemptAnswerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true, index: true },
    answer: { type: Schema.Types.Mixed, default: null },
    uploadedFiles: { type: [attemptFileSchema], default: [] },

    isCorrect: { type: Boolean, default: null },
    pointsEarned: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const quizAttemptSchema = new Schema(
  {
    tenantId: {
      type: String,
      default: null,
      index: true,
    },
    quizId: {
      type: Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true,
    },
    quizAssignmentId: {
      type: Schema.Types.ObjectId,
      ref: "QuizAssignment",
      default: null,
      index: true,
    },
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      default: null,
      index: true,
    },

    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    answers: { type: [attemptAnswerSchema], default: [] },

    // You can store raw points + percent score:
    pointsEarnedTotal: { type: Number, default: 0, min: 0 },
    maxScore: { type: Number, default: 0, min: 0 },

    // If you still want a % score:
    score: { type: Number, min: 0, max: 100, default: null, index: true },

    timeSpent: { type: Number, default: 0, min: 0 }, // seconds

    startedAt: { type: Date, default: Date.now, index: true },
    submittedAt: { type: Date, default: null, index: true },

    status: {
      type: String,
      enum: ["in_progress", "submitted", "grading", "graded", "failed"],
      default: "in_progress",
      index: true,
    },

    // async grading hooks (BullMQ / AI)
    aiRunId: {
      type: Schema.Types.ObjectId,
      ref: "AiRun",
      default: null,
      index: true,
    },
    gradedAt: { type: Date, default: null },
    feedback: { type: String, default: "", maxlength: 10000 },

    // Optional: block re-entry once submitted
    locked: { type: Boolean, default: false, index: true },

    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

quizAttemptSchema.set("toJSON", { virtuals: true });
quizAttemptSchema.set("toObject", { virtuals: true });

/** -------------------------
 * Enforce "1 attempt total"
 * ------------------------ */
//  Exactly one attempt document per (quizId, studentId)
quizAttemptSchema.index({ quizId: 1, studentId: 1 }, { unique: true });

// Fast dashboards / analytics
quizAttemptSchema.index({ studentId: 1, createdAt: -1 });
quizAttemptSchema.index({ quizId: 1, submittedAt: -1 });
quizAttemptSchema.index({ workspaceId: 1, quizId: 1, submittedAt: -1 });
quizAttemptSchema.index({ tenantId: 1, studentId: 1, createdAt: -1 });

// Optional helper
quizAttemptSchema.query.notDeleted = function () {
  return this.where({ deleted: false });
};

quizAttemptSchema.virtual("courseId")
  .get(function () {
    return this.workspaceId || null;
  })
  .set(function (value) {
    this.workspaceId = value;
  });

export default mongoose.model("QuizAttempt", quizAttemptSchema);
