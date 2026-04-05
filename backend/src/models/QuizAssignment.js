import mongoose from "mongoose";
const { Schema } = mongoose;

const quizAssignmentSchema = new Schema(
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

    // Assign scope (pick one or both depending on your system)
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      default: null,
      index: true,
    },
    classId: {
      type: Schema.Types.ObjectId,
      ref: "Classroom",
      default: null,
      index: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    assignedAt: { type: Date, default: Date.now, index: true },
    dueDate: { type: Date, default: null, index: true },

    status: {
      type: String,
      enum: ["assigned", "closed"],
      default: "assigned",
      index: true,
    },
  },
  { timestamps: true },
);

quizAssignmentSchema.set("toJSON", { virtuals: true });
quizAssignmentSchema.set("toObject", { virtuals: true });

// Prevent duplicate assignments for same target
quizAssignmentSchema.index(
  { quizId: 1, workspaceId: 1, classId: 1, studentId: 1 },
  { unique: true, sparse: true },
);

// Fast dashboards
quizAssignmentSchema.index({ studentId: 1, dueDate: 1 });
quizAssignmentSchema.index({ workspaceId: 1, dueDate: 1 });
quizAssignmentSchema.index({ tenantId: 1, workspaceId: 1, dueDate: 1 });

quizAssignmentSchema.virtual("courseId")
  .get(function () {
    return this.workspaceId || null;
  })
  .set(function (value) {
    this.workspaceId = value;
  });

quizAssignmentSchema.virtual("classroomId")
  .get(function () {
    return this.classId || null;
  })
  .set(function (value) {
    this.classId = value;
  });

export default mongoose.model("QuizAssignment", quizAssignmentSchema);
