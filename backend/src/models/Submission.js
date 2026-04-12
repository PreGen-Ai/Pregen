import mongoose from "mongoose";

const { Schema } = mongoose;

const fileSchema = new Schema(
  {
    name: { type: String, default: "", trim: true, maxlength: 255 },
    path: { type: String, default: "", trim: true },
    mimetype: { type: String, default: "", trim: true, maxlength: 120 },
    size: { type: Number, default: 0, min: 0 },
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

const SubmissionSchema = new Schema(
  {
    tenantId: { type: String, index: true, required: false, default: null },

    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
      index: true,
    },

    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    classroomId: {
      type: Schema.Types.ObjectId,
      ref: "Classroom",
      default: null,
      index: true,
    },

    files: { type: [fileSchema], default: [] },
    answers: { type: Schema.Types.Mixed, default: null },
    textSubmission: { type: String, default: "", maxlength: 50000 },
    submittedAt: { type: Date, default: Date.now, index: true },

    score: { type: Number, default: 0, min: 0, max: 100, index: true },
    grade: { type: Number, default: null, min: 0, max: 100, index: true },
    gradedBy: {
      type: String,
      enum: ["AI", "TEACHER", "NONE"],
      default: "NONE",
      index: true,
    },
    gradingStatus: {
      type: String,
      enum: [
        "submitted",
        "ai_graded",
        "pending_teacher_review",
        "grading_delayed",
        "final",
        "failed",
      ],
      default: "submitted",
      index: true,
    },
    gradedAt: { type: Date, default: null, index: true },
    feedback: { type: String, default: "", maxlength: 10000 },

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
    timeSavedSeconds: { type: Number, default: 0, min: 0 },

    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

SubmissionSchema.set("toJSON", { virtuals: true });
SubmissionSchema.set("toObject", { virtuals: true });

SubmissionSchema.pre("validate", function (next) {
  const hasFinalScore =
    this.finalScore !== null && this.finalScore !== undefined;
  const hasTeacherAdjustedScore =
    this.teacherAdjustedScore !== null &&
    this.teacherAdjustedScore !== undefined;
  const hasAiScore = this.aiScore !== null && this.aiScore !== undefined;

  if (hasFinalScore) {
    this.grade = Number(this.finalScore) || 0;
    this.score = Number(this.finalScore) || 0;
    this.feedback =
      this.finalFeedback ||
      this.teacherAdjustedFeedback ||
      this.aiFeedback ||
      this.feedback;
    this.gradingStatus = "final";
    if (!this.gradedAt) {
      this.gradedAt = this.teacherApprovedAt || this.aiGradedAt || new Date();
    }
  } else if (hasTeacherAdjustedScore || hasAiScore) {
    const workingScore = Number(
      hasTeacherAdjustedScore ? this.teacherAdjustedScore : this.aiScore,
    );
    this.score = Number.isFinite(workingScore) ? workingScore : 0;
    this.grade = null;
    this.feedback =
      this.teacherAdjustedFeedback || this.aiFeedback || this.feedback;

    if (
      ![
        "submitted",
        "ai_graded",
        "pending_teacher_review",
        "grading_delayed",
        "failed",
      ].includes(String(this.gradingStatus || ""))
    ) {
      this.gradingStatus = hasAiScore
        ? "pending_teacher_review"
        : "submitted";
    }
  } else if (!this.gradingStatus) {
    this.gradingStatus = "submitted";
  }

  next();
});

SubmissionSchema.index(
  { workspaceId: 1, assignmentId: 1, studentId: 1 },
  { unique: true },
);
SubmissionSchema.index({ workspaceId: 1, assignmentId: 1, submittedAt: -1 });
SubmissionSchema.index({ workspaceId: 1, studentId: 1, submittedAt: -1 });
SubmissionSchema.index({ workspaceId: 1, gradingStatus: 1, submittedAt: -1 });
SubmissionSchema.index({ workspaceId: 1, deleted: 1, submittedAt: -1 });
SubmissionSchema.index({ tenantId: 1, submittedAt: -1 });

SubmissionSchema.query.notDeleted = function () {
  return this.where({ deleted: false });
};

SubmissionSchema.virtual("courseId")
  .get(function () {
    return this.workspaceId || null;
  })
  .set(function (value) {
    this.workspaceId = value;
  });

SubmissionSchema.virtual("released")
  .get(function () {
    return (
      String(this.gradingStatus || "").toLowerCase() === "final" ||
      !!this.teacherApprovedAt
    );
  });

export default mongoose.models.Submission ||
  mongoose.model("Submission", SubmissionSchema);
