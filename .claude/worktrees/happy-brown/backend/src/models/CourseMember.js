import mongoose from "mongoose";
const { Schema } = mongoose;

const courseMemberSchema = new Schema(
  {
    courseId: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    role: {
      type: String,
      enum: ["admin", "teacher", "student"],
      default: "student",
      index: true,
    },

    joinedAt: { type: Date, default: Date.now, index: true },

    status: {
      type: String,
      enum: ["active", "removed", "blocked"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

// One membership row per user per course
courseMemberSchema.index({ courseId: 1, userId: 1 }, { unique: true });

// Fast lists
courseMemberSchema.index({ courseId: 1, role: 1, joinedAt: -1 });
courseMemberSchema.index({ userId: 1, joinedAt: -1 });

export default mongoose.model("CourseMember", courseMemberSchema);
