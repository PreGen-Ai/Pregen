import mongoose from "mongoose";

const { Schema } = mongoose;

const announcementSchema = new Schema(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10000,
    },
    scope: {
      type: String,
      enum: ["tenant", "course", "classroom"],
      required: true,
      index: true,
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      default: null,
      index: true,
    },
    classroomId: {
      type: Schema.Types.ObjectId,
      ref: "Classroom",
      default: null,
      index: true,
    },
    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "Subject",
      default: null,
      index: true,
    },
    audienceRoles: {
      type: [String],
      default: ["STUDENT"],
    },
    category: {
      type: String,
      enum: ["general", "deadline", "update", "reminder"],
      default: "general",
      index: true,
    },
    pinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
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

announcementSchema.pre("validate", function (next) {
  this.audienceRoles = Array.from(
    new Set(
      (this.audienceRoles || [])
        .map((role) => String(role || "").trim().toUpperCase())
        .filter((role) =>
          ["STUDENT", "TEACHER", "ADMIN", "SUPERADMIN", "PARENT"].includes(
            role,
          ),
        ),
    ),
  );

  if (!this.audienceRoles.length) {
    this.audienceRoles = ["STUDENT"];
  }

  if (this.scope === "tenant") {
    this.courseId = null;
    this.classroomId = null;
  } else if (this.scope === "course") {
    this.classroomId = null;
  } else if (this.scope === "classroom") {
    this.courseId = null;
  }

  next();
});

announcementSchema.index({ tenantId: 1, scope: 1, pinned: -1, publishedAt: -1 });
announcementSchema.index({ courseId: 1, pinned: -1, publishedAt: -1 });
announcementSchema.index({ classroomId: 1, pinned: -1, publishedAt: -1 });

export default mongoose.models.Announcement ||
  mongoose.model("Announcement", announcementSchema);
