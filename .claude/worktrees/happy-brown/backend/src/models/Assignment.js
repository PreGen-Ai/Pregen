// models/assignmentModel.js
import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  answers: {
    type: mongoose.Schema.Types.Mixed, // Can be text, file paths, etc.
    required: true,
  },
  submittedFiles: [
    {
      filename: String,
      filePath: String,
      originalName: String,
      size: Number,
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  score: {
    type: Number,
    min: 0,
    max: 100,
    default: null,
  },
  graded: {
    type: Boolean,
    default: false,
  },
  feedback: String,
  submittedAt: {
    type: Date,
    default: Date.now,
  },
  gradedAt: Date,
});

const assignmentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  instructions: String,
  dueDate: {
    type: Date,
    required: true,
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Workspace",
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Class",
  },
  // File-based assignments
  materials: [
    {
      filename: String,
      filePath: String,
      originalName: String,
      fileType: String,
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  // Assignment type: file_upload, text, quiz, etc.
  type: {
    type: String,
    enum: ["file_upload", "text_submission", "quiz", "mixed"],
    default: "text_submission",
  },
  maxScore: {
    type: Number,
    default: 100,
  },
  // For file upload assignments
  allowedFileTypes: [String],
  maxFileSize: {
    type: Number, // in MB
    default: 10,
  },
  maxFiles: {
    type: Number,
    default: 5,
  },
  submissions: [submissionSchema],
  // Students assigned to this assignment
  assignedStudents: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  status: {
    type: String,
    enum: ["draft", "published", "closed"],
    default: "draft",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

assignmentSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model("Assignment", assignmentSchema);
