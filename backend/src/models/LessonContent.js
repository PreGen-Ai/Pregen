import mongoose from "mongoose";

const { Schema } = mongoose;

const lessonContentSchema = new Schema(
  {
    tenantId: {
      type: String,
      default: null,
      index: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    sectionId: {
      type: Schema.Types.ObjectId,
      ref: "CourseSection",
      required: true,
      index: true,
    },
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
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 5000,
    },
    contentType: {
      type: String,
      enum: ["document", "link", "video", "embed", "text"],
      required: true,
      index: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      default: null,
      index: true,
    },
    url: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    textContent: {
      type: String,
      default: "",
      maxlength: 50000,
    },
    position: {
      type: Number,
      required: true,
      min: 1,
      index: true,
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "published",
      index: true,
    },
    downloadable: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
  },
  { timestamps: true },
);

lessonContentSchema.index(
  { sectionId: 1, position: 1, deleted: 1 },
  { unique: true },
);
lessonContentSchema.index({ courseId: 1, deleted: 1, createdAt: -1 });
lessonContentSchema.index({ tenantId: 1, courseId: 1, status: 1, position: 1 });

export default mongoose.models.LessonContent ||
  mongoose.model("LessonContent", lessonContentSchema);
