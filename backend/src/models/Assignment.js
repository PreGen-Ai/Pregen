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
  tenantId: {
    type: String,
    default: null,
    index: true,
  },
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
    index: true,
  },
  workspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
    default: null,
    index: true,
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Classroom",
    default: null,
    index: true,
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
    index: true,
  },
  deleted: {
    type: Boolean,
    default: false,
    index: true,
  },
  deletedAt: {
    type: Date,
    default: null,
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

assignmentSchema.set("toJSON", { virtuals: true });
assignmentSchema.set("toObject", { virtuals: true });

assignmentSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

assignmentSchema.virtual("teacherId")
  .get(function () {
    return this.teacher || null;
  })
  .set(function (value) {
    this.teacher = value;
  });

assignmentSchema.virtual("courseId")
  .get(function () {
    return this.workspace || null;
  })
  .set(function (value) {
    this.workspace = value;
  });

assignmentSchema.virtual("workspaceId")
  .get(function () {
    return this.workspace || null;
  })
  .set(function (value) {
    this.workspace = value;
  });

assignmentSchema.virtual("classroomId")
  .get(function () {
    return this.class || null;
  })
  .set(function (value) {
    this.class = value;
  });

assignmentSchema.virtual("classId")
  .get(function () {
    return this.class || null;
  })
  .set(function (value) {
    this.class = value;
  });

assignmentSchema.index({ teacher: 1, deleted: 1, createdAt: -1 });
assignmentSchema.index({
  tenantId: 1,
  workspace: 1,
  deleted: 1,
  status: 1,
  dueDate: 1,
});

export default mongoose.model("Assignment", assignmentSchema);
