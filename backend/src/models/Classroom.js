import mongoose from "mongoose";

const ClassroomSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      required: false,
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
