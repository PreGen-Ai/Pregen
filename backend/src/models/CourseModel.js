import mongoose from "mongoose";
const { Schema } = mongoose;

const courseSchema = new Schema(
  {
    // Basic
    title: { type: String, required: true, trim: true, maxlength: 200 },
    shortName: { type: String, trim: true, maxlength: 50, default: "" },
    description: { type: String, default: "", trim: true, maxlength: 10000 },
    tenantId: { type: String, default: null, index: true },
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "Subject",
      default: null,
      index: true,
    },
    classroomId: {
      type: Schema.Types.ObjectId,
      ref: "Classroom",
      default: null,
      index: true,
    },

    // Join code (generated)
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },

    // Ownership
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Settings
    settings: {
      allowStudentJoin: { type: Boolean, default: true },
      maxStudents: { type: Number, default: 50, min: 1 },
    },

    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "private",
      index: true,
    },

    archived: { type: Boolean, default: false, index: true },
    deleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },

    lastModified: { type: Date, default: Date.now, index: true },

    type: {
      type: String,
      enum: ["course", "workspace"],
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

// Indexes (query-driven)
courseSchema.index({ createdBy: 1, createdAt: -1 });
courseSchema.index({ tenantId: 1, deleted: 1, createdAt: -1 });
courseSchema.index({ tenantId: 1, subjectId: 1, deleted: 1, createdAt: -1 });
courseSchema.index({ tenantId: 1, classroomId: 1, deleted: 1, createdAt: -1 });
courseSchema.index({ visibility: 1, archived: 1, createdAt: -1 });
courseSchema.index({ deleted: 1, createdAt: -1 });

// lastModified
courseSchema.pre("save", function (next) {
  this.lastModified = Date.now();
  next();
});

// Safer unique code generation (still simple)
courseSchema.pre("validate", async function (next) {
  if (this.code) return next();

  const CourseModel = mongoose.models.Course || mongoose.model("Course", courseSchema);

  for (let i = 0; i < 10; i++) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const exists = await CourseModel.exists({ code });
    if (!exists) {
      this.code = code;
      return next();
    }
  }

  // fallback
  this.code = (Date.now().toString(36) + Math.random().toString(36).slice(2, 4))
    .toUpperCase()
    .slice(0, 8);

  next();
});

const Course = mongoose.models.Course || mongoose.model("Course", courseSchema);

export default Course;
