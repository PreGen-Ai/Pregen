import mongoose from "mongoose";

const { Schema } = mongoose;

const attemptFileSchema = new Schema(
  {
    filename: { type: String, default: "", trim: true, maxlength: 255 },
    filePath: { type: String, default: "", trim: true },
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

const gradingAuditEntrySchema = new Schema(
  {
    action: { type: String, default: "updated", trim: true, maxlength: 80 },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    actorRole: { type: String, default: "", trim: true, maxlength: 40 },
    source: { type: String, default: "teacher", trim: true, maxlength: 40 },
    statusFrom: { type: String, default: "submitted", trim: true, maxlength: 40 },
    statusTo: { type: String, default: "submitted", trim: true, maxlength: 40 },
    score: { type: Number, default: null, min: 0, max: 100 },
    feedback: { type: String, default: "", maxlength: 10000 },
    error: { type: String, default: "", maxlength: 2000 },
    metadata: { type: Schema.Types.Mixed, default: {} },
    at: { type: Date, default: Date.now },
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
    pointsEarnedTotal: { type: Number, default: 0, min: 0 },
    maxScore: { type: Number, default: 0, min: 0 },
    score: { type: Number, min: 0, max: 100, default: null, index: true },
    timeSpent: { type: Number, default: 0, min: 0 },
    startedAt: { type: Date, default: Date.now, index: true },
    submittedAt: { type: Date, default: null, index: true },

    status: {
      type: String,
      enum: [
        "in_progress",
        "submitted",
        "ai_graded",
        "pending_teacher_review",
        "grading_delayed",
        "final",
        "failed",
      ],
      default: "in_progress",
      index: true,
    },

    aiScore: { type: Number, default: null, min: 0, max: 100 },
    aiFeedback: { type: String, default: "", maxlength: 10000 },
    aiGradedAt: { type: Date, default: null, index: true },
    aiReportId: { type: String, default: "", trim: true, maxlength: 255 },

    teacherAdjustedScore: { type: Number, default: null, min: 0, max: 100 },
    teacherAdjustedFeedback: {
      type: String,
      default: "",
      maxlength: 10000,
    },
    finalScore: { type: Number, default: null, min: 0, max: 100, index: true },
    finalFeedback: { type: String, default: "", maxlength: 10000 },
    adjustedByTeacher: { type: Boolean, default: false, index: true },
    teacherAdjustedAt: { type: Date, default: null },
    teacherApprovedAt: { type: Date, default: null, index: true },
    teacherApprovedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    latestGradingError: { type: String, default: "", maxlength: 2000 },
    gradingAudit: { type: [gradingAuditEntrySchema], default: [] },

    aiRunId: {
      type: Schema.Types.ObjectId,
      ref: "AiRun",
      default: null,
      index: true,
    },
    gradedAt: { type: Date, default: null },
    feedback: { type: String, default: "", maxlength: 10000 },
    locked: { type: Boolean, default: false, index: true },
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

quizAttemptSchema.set("toJSON", { virtuals: true });
quizAttemptSchema.set("toObject", { virtuals: true });

quizAttemptSchema.pre("validate", function (next) {
  const hasFinalScore =
    this.finalScore !== null && this.finalScore !== undefined;
  const hasTeacherAdjustedScore =
    this.teacherAdjustedScore !== null &&
    this.teacherAdjustedScore !== undefined;
  const hasAiScore = this.aiScore !== null && this.aiScore !== undefined;

  if (hasFinalScore) {
    this.score = Number(this.finalScore) || 0;
    this.feedback =
      this.finalFeedback ||
      this.teacherAdjustedFeedback ||
      this.aiFeedback ||
      this.feedback;
    this.status = "final";
    if (!this.gradedAt) {
      this.gradedAt = this.teacherApprovedAt || this.aiGradedAt || new Date();
    }
  } else if (hasTeacherAdjustedScore || hasAiScore) {
    const workingScore = Number(
      hasTeacherAdjustedScore ? this.teacherAdjustedScore : this.aiScore,
    );
    this.score = Number.isFinite(workingScore) ? workingScore : this.score;
    this.feedback =
      this.teacherAdjustedFeedback || this.aiFeedback || this.feedback;

    if (
      ![
        "in_progress",
        "submitted",
        "ai_graded",
        "pending_teacher_review",
        "grading_delayed",
        "failed",
      ].includes(String(this.status || ""))
    ) {
      this.status = hasAiScore ? "pending_teacher_review" : "submitted";
    }
  }

  next();
});

quizAttemptSchema.index({ quizId: 1, studentId: 1 }, { unique: true });
quizAttemptSchema.index({ studentId: 1, createdAt: -1 });
quizAttemptSchema.index({ quizId: 1, submittedAt: -1 });
quizAttemptSchema.index({ workspaceId: 1, quizId: 1, submittedAt: -1 });
quizAttemptSchema.index({ tenantId: 1, studentId: 1, createdAt: -1 });

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

quizAttemptSchema.virtual("gradingStatus")
  .get(function () {
    return this.status || null;
  })
  .set(function (value) {
    this.status = value;
  });

quizAttemptSchema.virtual("released")
  .get(function () {
    return (
      String(this.status || "").toLowerCase() === "final" ||
      !!this.teacherApprovedAt
    );
  });

export default mongoose.models.QuizAttempt ||
  mongoose.model("QuizAttempt", quizAttemptSchema);
