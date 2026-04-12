import { randomUUID } from "crypto";

import { normalizeRole } from "../middleware/authMiddleware.js";
import { getIo } from "./index.js";
import { buildRoomsFromTargets, userRoom } from "./rooms.js";

const GENERIC_OPERATION_STATUSES = new Set(["started", "success", "failed"]);

function looksLikeHtml(value) {
  const text = String(value || "").trimStart();
  return text.startsWith("<!") || /^<html[\s>]/i.test(text);
}

function sanitizeMessage(value, fallback = "A realtime update is available") {
  if (!value) return fallback;
  const text = String(value).trim();
  if (!text || looksLikeHtml(text)) return fallback;
  return text.slice(0, 500);
}

function sanitizeMetaValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 3) return undefined;

  if (typeof value === "string") {
    return looksLikeHtml(value) ? undefined : value.slice(0, 500);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => sanitizeMetaValue(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    const entries = Object.entries(value).slice(0, 50);
    return entries.reduce((acc, [key, entryValue]) => {
      const sanitized = sanitizeMetaValue(entryValue, depth + 1);
      if (sanitized !== undefined) acc[key] = sanitized;
      return acc;
    }, {});
  }

  return undefined;
}

function normalizeStatus(status) {
  return String(status || "updated").trim().toLowerCase();
}

function normalizeType(type) {
  return String(type || "operation")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function defaultSeverityForStatus(status) {
  if (status === "failed") return "error";
  if (status === "success") return "success";
  if (status === "started") return "info";
  return "info";
}

export function buildActorFromUser(user) {
  if (!user) return null;

  const id = String(user._id || user.id || "").trim();
  if (!id) return null;

  return {
    id,
    username: user.username || "",
    email: user.email || "",
    role: normalizeRole(user.role),
  };
}

export function buildActorFromRequest(req) {
  return buildActorFromUser(req?.user);
}

export function emitRealtimeEvent({
  type,
  status,
  requestId = null,
  entityId = null,
  entityType = "operation",
  message,
  severity,
  targets = {},
  meta = {},
  actor = null,
  includeNotification = true,
}) {
  const io = getIo();
  if (!io) return null;

  const normalizedType = normalizeType(type);
  const normalizedStatus = normalizeStatus(status);
  const rooms = new Set(buildRoomsFromTargets(targets));

  if (!rooms.size && actor?.id) {
    rooms.add(userRoom(actor.id));
  }

  if (!rooms.size) return null;

  const domainEvent = `${normalizedType}:${normalizedStatus}`;
  const payload = {
    event: domainEvent,
    notificationId: randomUUID(),
    type: normalizedType,
    status: normalizedStatus,
    requestId: requestId ? String(requestId) : null,
    entityId: entityId ? String(entityId) : null,
    entityType: String(entityType || "operation"),
    message: sanitizeMessage(message),
    severity: severity || defaultSeverityForStatus(normalizedStatus),
    timestamp: new Date().toISOString(),
    actor: sanitizeMetaValue(actor),
    meta: sanitizeMetaValue(meta) || {},
  };

  let broadcaster = io;
  for (const room of rooms) {
    broadcaster = broadcaster.to(room);
  }

  if (includeNotification) {
    broadcaster.emit("notification:new", payload);
  }

  broadcaster.emit(domainEvent, payload);

  if (GENERIC_OPERATION_STATUSES.has(normalizedStatus)) {
    broadcaster.emit(`operation:${normalizedStatus}`, payload);
  }

  return payload;
}
