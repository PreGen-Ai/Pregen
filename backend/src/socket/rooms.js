import { normalizeRole } from "../middleware/authMiddleware.js";

function normalizeId(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function normalizeIdList(values) {
  const items = Array.isArray(values) ? values : values ? [values] : [];
  return Array.from(
    new Set(items.map((value) => normalizeId(value)).filter(Boolean)),
  );
}

function normalizeRoleList(values) {
  const items = Array.isArray(values) ? values : values ? [values] : [];
  return Array.from(
    new Set(items.map((value) => normalizeRole(value)).filter(Boolean)),
  );
}

export const userRoom = (userId) => {
  const normalized = normalizeId(userId);
  return normalized ? `user:${normalized}` : null;
};

export const teacherRoom = (teacherId) => {
  const normalized = normalizeId(teacherId);
  return normalized ? `teacher:${normalized}` : null;
};

export const studentRoom = (studentId) => {
  const normalized = normalizeId(studentId);
  return normalized ? `student:${normalized}` : null;
};

export const courseRoom = (courseId) => {
  const normalized = normalizeId(courseId);
  return normalized ? `course:${normalized}` : null;
};

export const classroomRoom = (classroomId) => {
  const normalized = normalizeId(classroomId);
  return normalized ? `classroom:${normalized}` : null;
};

export const tenantRoom = (tenantId) => {
  const normalized = normalizeId(tenantId);
  return normalized ? `tenant:${normalized}` : null;
};

export const roleRoom = (role) => {
  const normalized = normalizeRole(role);
  return normalized ? `role:${normalized.toLowerCase()}` : null;
};

export function deriveRoomsFromAuth(authContext = {}) {
  const rooms = new Set();
  const role = normalizeRole(authContext.role);

  for (const room of [
    userRoom(authContext.userId),
    tenantRoom(authContext.tenantId),
    roleRoom(role),
  ]) {
    if (room) rooms.add(room);
  }

  if (role === "TEACHER") {
    const room = teacherRoom(authContext.userId);
    if (room) rooms.add(room);
  }

  if (role === "STUDENT") {
    const room = studentRoom(authContext.userId);
    if (room) rooms.add(room);
  }

  for (const courseId of normalizeIdList(authContext.courseIds)) {
    rooms.add(courseRoom(courseId));
  }

  for (const classroomId of normalizeIdList(authContext.classroomIds)) {
    rooms.add(classroomRoom(classroomId));
  }

  return Array.from(rooms);
}

export function buildRoomsFromTargets(targets = {}) {
  const rooms = new Set();

  for (const userId of normalizeIdList(targets.userIds)) {
    rooms.add(userRoom(userId));
  }

  for (const teacherId of normalizeIdList(targets.teacherIds)) {
    rooms.add(userRoom(teacherId));
    rooms.add(teacherRoom(teacherId));
  }

  for (const studentId of normalizeIdList(targets.studentIds)) {
    rooms.add(userRoom(studentId));
    rooms.add(studentRoom(studentId));
  }

  for (const courseId of normalizeIdList(targets.courseIds)) {
    rooms.add(courseRoom(courseId));
  }

  for (const classroomId of normalizeIdList(targets.classroomIds)) {
    rooms.add(classroomRoom(classroomId));
  }

  for (const tenantId of normalizeIdList(targets.tenantIds)) {
    rooms.add(tenantRoom(tenantId));
  }

  for (const role of normalizeRoleList(targets.roleNames)) {
    rooms.add(roleRoom(role));
  }

  return Array.from(rooms).filter(Boolean);
}
