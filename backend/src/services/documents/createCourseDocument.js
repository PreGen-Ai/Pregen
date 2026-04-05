import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import Document from "../../models/DocumentModel.js";
import DocumentACL from "../../models/DocumentACL.js";
import DocumentVersion from "../../models/DocumentVersion.js";
import { uploadToCloudinary } from "../../middleware/documentMiddleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, "../../uploads/documents");

if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

function sanitizeBaseName(name = "document") {
  return String(name)
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

async function persistLocalFile(file) {
  if (file?.path) {
    return file.path;
  }

  if (!file?.buffer) {
    throw new Error("Uploaded file buffer is missing");
  }

  const ext = path.extname(file.originalname || "") || "";
  const filename = `${Date.now()}-${sanitizeBaseName(
    path.basename(file.originalname || "document", ext),
  )}${ext}`;
  const targetPath = path.join(uploadsRoot, filename);
  await fs.promises.writeFile(targetPath, file.buffer);
  return targetPath;
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => String(tag).trim())
      .filter(Boolean)
      .slice(0, 30);
  }

  return String(tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 30);
}

export async function createCourseDocument({
  file,
  courseId,
  userId,
  description = "",
  tags = [],
}) {
  if (!file) throw new Error("No file provided");
  if (!courseId) throw new Error("courseId is required");
  if (!userId) throw new Error("userId is required");

  let url = "";
  let cloudinary_id = null;

  if (process.env.USE_CLOUDINARY === "true") {
    const uploaded = await uploadToCloudinary(file);
    url = uploaded.secure_url;
    cloudinary_id = uploaded.public_id;
  } else {
    url = await persistLocalFile(file);
  }

  const doc = await Document.create({
    name: file.originalname,
    type: file.mimetype,
    url,
    size: file.size || 0,
    cloudinary_id,
    description: String(description || "").slice(0, 5000),
    ownerId: userId,
    courseId,
    tags: normalizeTags(tags),
    deleted: false,
    deletedAt: null,
    restoredAt: null,
    version: 1,
  });

  await DocumentVersion.create({
    documentId: doc._id,
    versionNumber: 1,
    url: doc.url,
    modifiedBy: userId,
    metadata: doc.metadata || {},
    timestamp: new Date(),
  });

  await DocumentACL.create({
    documentId: doc._id,
    userId,
    permission: "admin",
  });

  return doc;
}
