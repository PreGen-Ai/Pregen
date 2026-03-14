// models/Submission.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * ✅ Merged Submission schema (simple analytics fields + full assignment submission model)
 * - Keeps old fields: tenantId, teacherId, score, gradedBy, timeSavedSeconds
 * - Keeps full fields: assignmentId, workspaceId, files, feedback, gradingStatus, aiRunId, soft delete, indexes
 * - Hot-reload safe export
 */

const fileSchema = new Schema(
  {
    name: { type: String, default: "", trim: true, maxlength: 255 },
    path: { type: String, default: "", trim: true }, // prefer key/signed URL in prod
    mimetype: { type: String, default: "", trim: true, maxlength: 120 },
    size: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const SubmissionSchema = new Schema(
  {
    // -------- Multi-tenant (old) --------
    tenantId: { type: Schema.Types.ObjectId, index: true, required: false },

    // -------- Core relations --------
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
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
    }, // from old schema

    // -------- Submission payload --------
    files: { type: [fileSchema], default: [] },

    submittedAt: { type: Date, default: Date.now, index: true },

    // -------- Grading (merged) --------
    // old: score (0..100) + gradedBy
    // new: grade + feedback + gradingStatus
    score: { type: Number, default: 0, min: 0, max: 100, index: true }, // legacy
    grade: { type: Number, default: null, min: 0, max: 100, index: true }, // preferred

    gradedBy: {
      type: String,
      enum: ["AI", "TEACHER", "NONE"],
      default: "NONE",
      index: true,
    },
    gradingStatus: {
      type: String,
      enum: ["pending", "submitted", "grading", "graded", "failed"],
      default: "submitted",
      index: true,
    },
    gradedAt: { type: Date, default: null, index: true },

    feedback: { type: String, default: "", maxlength: 10000 },

    // -------- AI pipeline hooks --------
    aiRunId: {
      type: Schema.Types.ObjectId,
      ref: "AiRun",
      default: null,
      index: true,
    },

    // old: time saved if AI graded
    timeSavedSeconds: { type: Number, default: 0, min: 0 },

    // -------- Soft delete --------
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

/* -------------------------
 * Compatibility normalization
 * ------------------------ */
SubmissionSchema.pre("validate", function (next) {
  // Keep score <-> grade consistent
  const hasGrade = this.grade !== null && this.grade !== undefined;
  const hasScore = this.score !== null && this.score !== undefined;

  // If only grade is provided, mirror to score
  if (hasGrade && (!hasScore || this.score === 0)) {
    this.score = Number(this.grade) || 0;
  }

  // If only score is meaningful, mirror to grade (but keep grade null if you want "ungraded")
  if (!hasGrade && hasScore && this.gradedBy !== "NONE") {
    this.grade = Number(this.score) || 0;
  }

  // gradingStatus inference
  if (this.deleted) {
    // leave status as-is
  } else if (this.gradedBy && this.gradedBy !== "NONE") {
    if (!this.gradedAt) this.gradedAt = this.gradedAt || new Date();
    this.gradingStatus = "graded";
  } else if (!this.gradingStatus) {
    this.gradingStatus = "submitted";
  }

  next();
});

/** -------------------------
 * Indexes (query-driven)
 * ------------------------ */

// Prevent duplicate submissions by same student for same assignment (per workspace)
SubmissionSchema.index(
  { workspaceId: 1, assignmentId: 1, studentId: 1 },
  { unique: true },
);

// Fast listing: all submissions for an assignment (teacher view)
SubmissionSchema.index({ workspaceId: 1, assignmentId: 1, submittedAt: -1 });

// Fast listing: a student's submissions (student dashboard)
SubmissionSchema.index({ workspaceId: 1, studentId: 1, submittedAt: -1 });

// Reports/analytics: filter by status/time
SubmissionSchema.index({ workspaceId: 1, gradingStatus: 1, submittedAt: -1 });

// Soft-delete filters
SubmissionSchema.index({ workspaceId: 1, deleted: 1, submittedAt: -1 });

// Optional: tenant-based listings
SubmissionSchema.index({ tenantId: 1, submittedAt: -1 });

/** -------------------------
 * Query helper
 * ------------------------ */
SubmissionSchema.query.notDeleted = function () {
  return this.where({ deleted: false });
};

/**
 * IMPORTANT: nodemon / hot-reload safe export
 */
export default mongoose.models.Submission ||
  mongoose.model("Submission", SubmissionSchema);
