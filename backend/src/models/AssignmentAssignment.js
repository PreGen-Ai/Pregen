// models/AssignmentAssignment.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const assignmentAssignmentSchema = new Schema(
  {
    assignmentId: {
      type: Schema.Types.ObjectId,
      ref: "Assignment",
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
      ref: "Class",
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

// Prevent duplicates
assignmentAssignmentSchema.index(
  { assignmentId: 1, workspaceId: 1, classId: 1, studentId: 1 },
  { unique: true, sparse: true },
);

// Student dashboard
assignmentAssignmentSchema.index({ studentId: 1, dueDate: 1 });

export default mongoose.model(
  "AssignmentAssignment",
  assignmentAssignmentSchema,
);
