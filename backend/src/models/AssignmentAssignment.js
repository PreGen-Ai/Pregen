// models/AssignmentAssignment.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const assignmentAssignmentSchema = new Schema(
  {
    tenantId: {
      type: String,
      default: null,
      index: true,
    },
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
      index: true,
    },

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

assignmentAssignmentSchema.set("toJSON", { virtuals: true });
assignmentAssignmentSchema.set("toObject", { virtuals: true });

// Prevent duplicates
assignmentAssignmentSchema.index(
  { assignmentId: 1, workspaceId: 1, classId: 1, studentId: 1 },
  { unique: true, sparse: true },
);

// Student dashboard
assignmentAssignmentSchema.index({ studentId: 1, dueDate: 1 });
assignmentAssignmentSchema.index({ tenantId: 1, workspaceId: 1, dueDate: 1 });

assignmentAssignmentSchema.virtual("courseId")
  .get(function () {
    return this.workspaceId || null;
  })
  .set(function (value) {
    this.workspaceId = value;
  });

assignmentAssignmentSchema.virtual("classroomId")
  .get(function () {
    return this.classId || null;
  })
  .set(function (value) {
    this.classId = value;
  });

export default mongoose.model(
  "AssignmentAssignment",
  assignmentAssignmentSchema,
);
