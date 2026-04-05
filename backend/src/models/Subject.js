import mongoose from "mongoose";

const { Schema } = mongoose;

const subjectSchema = new Schema(
  {
    tenantId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    nameKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    code: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 4000,
    },
    teacherIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    classroomIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Classroom",
      },
    ],
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
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

subjectSchema.pre("validate", function (next) {
  this.name = String(this.name || "").trim();
  this.nameKey = this.name.toLowerCase();
  this.code = String(this.code || "")
    .trim()
    .toUpperCase();
  next();
});

subjectSchema.index(
  { tenantId: 1, nameKey: 1, deleted: 1 },
  { unique: true },
);

subjectSchema.index(
  { tenantId: 1, code: 1, deleted: 1 },
  {
    unique: true,
    partialFilterExpression: {
      code: { $exists: true, $ne: "" },
      deleted: false,
    },
  },
);

subjectSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

export default mongoose.models.Subject ||
  mongoose.model("Subject", subjectSchema);
