import Classroom from "../../models/Classroom.js";
import User from "../../models/userModel.js";
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
    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }
    const { name, grade = "", section = "" } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: "Class name is required" });

    const doc = await Classroom.create({
      tenantId,
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
    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }
    const { id } = req.params;
    const { teacherId } = req.body;
    if (!teacherId)
      return res.status(400).json({ message: "teacherId is required" });

    // Validate teacher exists and has TEACHER role
    const teacher = await User.findOne({
      _id: teacherId,
      deleted: { $ne: true },
    }).lean();

    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }
    if (teacher.role !== "TEACHER") {
      return res
        .status(400)
        .json({ message: "User is not a teacher. Only users with role TEACHER can be assigned." });
    }

    const filter = {
      _id: id,
      tenantId,
      deletedAt: null,
    };
    const doc = await Classroom.findOneAndUpdate(
      filter,
      { teacherId },
      { new: true },
    );
    if (!doc) return res.status(404).json({ message: "Class not found" });

    // Add this tenant to the teacher's tenantIds (teachers can be in multiple tenants)
    await User.updateOne(
      { _id: teacherId },
      { $addToSet: { tenantIds: tenantId } },
    );

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
    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId" });
    }
    const { id } = req.params;
    const { studentIds } = req.body;
    if (!Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({ message: "studentIds[] is required" });
    }

    // Validate all students exist, are STUDENT role, and belong to this tenant
    const students = await User.find({
      _id: { $in: studentIds },
      deleted: { $ne: true },
    }).lean();

    if (students.length !== studentIds.length) {
      return res.status(404).json({
        message: `Some students not found. Expected ${studentIds.length}, found ${students.length}.`,
      });
    }

    const invalidRoles = students.filter((s) => s.role !== "STUDENT");
    if (invalidRoles.length > 0) {
      return res.status(400).json({
        message: `Some users are not students: ${invalidRoles.map((u) => u.email).join(", ")}`,
      });
    }

    // Students are single-tenant: verify they all belong to this tenant
    const wrongTenant = students.filter((s) => s.tenantId !== tenantId);
    if (wrongTenant.length > 0) {
      return res.status(400).json({
        message: `Some students do not belong to this tenant: ${wrongTenant.map((u) => u.email).join(", ")}`,
      });
    }

    const filter = {
      _id: id,
      tenantId,
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

/**
 * DELETE /api/admin/classes/:id/unenroll
 * Remove student(s) from a class
 * Body: { studentIds: [id, ...] }
 */
export async function unenrollStudents(req, res) {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) return res.status(400).json({ message: "Missing tenantId" });

    const { id } = req.params;
    const { studentIds } = req.body;
    if (!Array.isArray(studentIds) || !studentIds.length) {
      return res.status(400).json({ message: "studentIds[] is required" });
    }

    const doc = await Classroom.findOneAndUpdate(
      { _id: id, tenantId, deletedAt: null },
      { $pullAll: { studentIds } },
      { new: true },
    );
    if (!doc) return res.status(404).json({ message: "Class not found" });

    return res.json({ message: "Students removed", class: doc });
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Failed to unenroll students", error: String(e) });
  }
}
