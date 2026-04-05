import mongoose from "mongoose";
const { Schema } = mongoose;

// ------------------------
// QUESTION SUBSCHEMA
// ------------------------
const optionSchema = new Schema(
  {
    text: { type: String, default: "", trim: true, maxlength: 500 },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: false },
);

const fileUploadConfigSchema = new Schema(
  {
    allowedTypes: { type: [String], default: [] },
    maxSize: { type: Number, default: 0, min: 0 }, // MB
  },
  { _id: false },
);

const questionSchema = new Schema(
  {
    questionText: { type: String, required: true, trim: true, maxlength: 5000 },

    questionType: {
      type: String,
      enum: [
        "multiple_choice",
        "true_false",
        "short_answer",
        "essay",
        "file_upload",
      ],
      required: true,
      index: true,
    },

    options: { type: [optionSchema], default: [] },

    // NOTE: If you show quiz to students, NEVER send correctAnswer.
    correctAnswer: { type: Schema.Types.Mixed, default: null, select: false },

    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard", "expert"],
      default: "medium",
      index: true,
    },

    explanation: { type: String, default: "", trim: true, maxlength: 20000 },

    points: { type: Number, default: 1, min: 0, max: 1000 },

    fileUploadConfig: { type: fileUploadConfigSchema, default: () => ({}) },
  },
  { _id: true }, // keep question _id so attempts can reference it
);

// ------------------------
// QUIZ SCHEMA (definition)
// ------------------------
const quizSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true, maxlength: 5000 },
    tenantId: {
      type: String,
      default: null,
      index: true,
    },

    teacher: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    curriculum: {
      type: String,
      default: "General",
      trim: true,
      maxlength: 120,
      index: true,
    },
    gradeLevel: {
      type: String,
      default: "All",
      trim: true,
      maxlength: 60,
      index: true,
    },

    workspace: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      default: null,
      index: true,
    },
    class: {
      type: Schema.Types.ObjectId,
      ref: "Classroom",
      default: null,
      index: true,
    },

    questions: { type: [questionSchema], default: [] },

    timeLimit: { type: Number, default: 30, min: 0 }, // minutes
    maxAttempts: { type: Number, default: 1, min: 1 },
    totalPoints: { type: Number, default: 0, min: 0 },
    passingScore: { type: Number, default: 60, min: 0, max: 100 },

    shuffleQuestions: { type: Boolean, default: false },
    showResults: { type: Boolean, default: true },

    pythonQuizPath: { type: String, default: "", trim: true },

    status: {
      type: String,
      enum: ["draft", "published", "closed"],
      default: "draft",
      index: true,
    },

    // Optional soft delete (recommended for admin systems)
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

quizSchema.set("toJSON", { virtuals: true });
quizSchema.set("toObject", { virtuals: true });

// Auto-calc total points
quizSchema.pre("save", function (next) {
  if (!this.createdBy) this.createdBy = this.teacher || null;
  this.totalPoints = (this.questions || []).reduce(
    (sum, q) => sum + (q.points || 0),
    0,
  );
  next();
});

// Indexes (query-driven)
quizSchema.index({ workspace: 1, status: 1, createdAt: -1 });
quizSchema.index({ teacher: 1, status: 1, createdAt: -1 });
quizSchema.index({ tenantId: 1, workspace: 1, deleted: 1, createdAt: -1 });

// Basic text search (optional). Atlas Search is better if you have it.
quizSchema.index({ title: "text", description: "text", subject: "text" });

quizSchema.query.notDeleted = function () {
  return this.where({ deleted: false });
};

quizSchema.virtual("teacherId")
  .get(function () {
    return this.teacher || null;
  })
  .set(function (value) {
    this.teacher = value;
  });

quizSchema.virtual("courseId")
  .get(function () {
    return this.workspace || null;
  })
  .set(function (value) {
    this.workspace = value;
  });

quizSchema.virtual("classroomId")
  .get(function () {
    return this.class || null;
  })
  .set(function (value) {
    this.class = value;
  });

export default mongoose.model("Quiz", quizSchema);
