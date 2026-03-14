import Classroom from "../../models/Classroom.js";
import { getTenantId } from "../../middleware/authMiddleware.js";

export async function listClasses(req, res) {
  try {
    const tenantId = getTenantId(req);
    const filter = { ...(tenantId ? { tenantId } : {}), deletedAt: null };

    const items = await Classroom.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ items });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to list classes", error: String(e) });
  }
}

export async function createClass(req, res) {
  try {
    const tenantId = getTenantId(req);
    const { name, grade = "", section = "" } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: "Class name is required" });

    const doc = await Classroom.create({
      ...(tenantId ? { tenantId } : {}),
      name: name.trim(),
      grade,
      section,
      studentIds: [],
      deletedAt: null,
    });

    return res.status(201).json({ message: "Created", class: doc });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to create class", error: String(e) });
  }
}

export async function assignTeacher(req, res) {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { teacherId } = req.body;
    if (!teacherId)
      return res.status(400).json({ message: "teacherId is required" });

    const filter = {
      _id: id,
      ...(tenantId ? { tenantId } : {}),
      deletedAt: null,
    };
    const doc = await Classroom.findOneAndUpdate(
      filter,
      { teacherId },
      { new: true },
    );
    if (!doc) return res.status(404).json({ message: "Class not found" });

    return res.json({ message: "Teacher assigned", class: doc });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to assign teacher", error: String(e) });
  }
}

export async function enrollStudents(req, res) {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { studentIds } = req.body;
    if (!Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({ message: "studentIds[] is required" });
    }

    const filter = {
      _id: id,
      ...(tenantId ? { tenantId } : {}),
      deletedAt: null,
    };
    const doc = await Classroom.findOneAndUpdate(
      filter,
      { $addToSet: { studentIds: { $each: studentIds } } },
      { new: true },
    );
    if (!doc) return res.status(404).json({ message: "Class not found" });

    return res.json({ message: "Enrolled", class: doc });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to enroll students", error: String(e) });
  }
}
