import mongoose from "mongoose";

const ClassroomSchema = new mongoose.Schema(
  {
    tenantId: {
      type: String,
      index: true,
      required: false,
      default: null,
    },
    name: { type: String, required: true, trim: true },
    grade: { type: String, default: "" },
    section: { type: String, default: "" },

    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("Classroom", ClassroomSchema);
