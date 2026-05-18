/**
 * backend/src/middleware/uploadSecurity.js
 *
 * Centralised file-upload security helpers for the PreGen LMS.
 *
 * Exports:
 *   sanitizeUploadFilename(original)          — strip traversal, sanitize filename
 *   validateExtensionMatchesMime(file)         — detect MIME/extension mismatch
 *   uploadErrorHandler(err, req, res, next)    — central Express error handler for multer errors
 *   virusScanPlaceholder(file)                 — async hook for future AV scanning
 *   createSecureMulterConfig(options)          — factory for fully hardened multer config
 */

import path from "path";
import multer from "multer";

// ------------------------------------------------------------------
// MIME → expected extensions map (not exhaustive; covers project types)
// ------------------------------------------------------------------
const MIME_TO_EXTENSIONS = new Map([
  ["application/pdf", [".pdf"]],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", [".docx"]],
  ["application/msword", [".doc"]],
  ["text/plain", [".txt"]],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", [".xlsx"]],
  ["application/vnd.ms-excel", [".xls"]],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", [".pptx"]],
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/jpg",  [".jpg", ".jpeg"]],
  ["image/png",  [".png"]],
  ["image/gif",  [".gif"]],
  ["image/webp", [".webp"]],
  ["image/svg+xml", [".svg"]],
]);

// Characters disallowed in safe filenames
const UNSAFE_FILENAME_RE = /[^a-zA-Z0-9._\-]/g;
const TRAVERSAL_RE = /\.\.(\/|\\)/;

// ------------------------------------------------------------------
// sanitizeUploadFilename
// ------------------------------------------------------------------

/**
 * Sanitize an uploaded filename to prevent path traversal and injection.
 *
 * - Strips directory components (basenames only)
 * - Removes leading dots beyond the extension (e.g. ".htaccess" → "htaccess")
 * - Replaces non-alphanumeric characters (except . - _) with underscores
 * - Prevents empty result: falls back to "upload"
 *
 * @param {string} original — file.originalname from multer
 * @param {{ maxLength?: number }} [opts]
 * @returns {string} sanitized filename (without directory parts)
 */
export function sanitizeUploadFilename(original, { maxLength = 200 } = {}) {
  if (!original || typeof original !== "string") return "upload";

  // Never trust the caller's path separators
  let name = path.basename(original);

  // Guard: reject traversal patterns even after basename (shouldn't be reachable, belt-and-suspenders)
  if (TRAVERSAL_RE.test(name)) name = "upload";

  // Strip leading dots (hidden files: .htaccess, .env, etc.)
  name = name.replace(/^\.+/, "");

  // Separate extension
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext);

  // Sanitize base: replace unsafe characters with underscores
  const safeBase = (base || "upload")
    .replace(UNSAFE_FILENAME_RE, "_")
    .slice(0, maxLength - ext.length - 10);  // leave room for timestamp suffix

  return safeBase + ext;
}

// ------------------------------------------------------------------
// validateExtensionMatchesMime
// ------------------------------------------------------------------

/**
 * Check that the file extension is consistent with the MIME type.
 *
 * Returns { ok: true } or { ok: false, reason: string }.
 * Does NOT reject the file itself — caller decides what to do.
 *
 * Attackers may rename "evil.exe" → "document.pdf".
 * This check adds a lightweight defence layer:
 *   - If MIME is known and extension doesn't match → likely mismatch
 *   - If MIME is unknown → we still accept (unknown MIME may be caught by fileFilter)
 *
 * @param {{ mimetype: string, originalname: string }} file
 */
export function validateExtensionMatchesMime(file) {
  if (!file || !file.mimetype || !file.originalname) {
    return { ok: false, reason: "missing file metadata" };
  }

  const allowed = MIME_TO_EXTENSIONS.get(file.mimetype.toLowerCase());
  if (!allowed) {
    // Unknown MIME — we don't block here, fileFilter should have blocked it already
    return { ok: true };
  }

  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowed.includes(ext)) {
    return {
      ok: false,
      reason: `Extension mismatch: MIME type suggests ${allowed.join("/")} but got ${ext || "(none)"}`,
    };
  }

  return { ok: true };
}

// ------------------------------------------------------------------
// uploadErrorHandler
// ------------------------------------------------------------------

/**
 * Central Express error handler for multer upload errors.
 *
 * Place AFTER the route that uses multer:
 *   router.post("/upload", upload.single("file"), handler, uploadErrorHandler);
 *
 * OR register globally in server.js after all routes:
 *   app.use(uploadErrorHandler);
 *
 * Returns safe, generic messages. Never leaks:
 *   - MIME type of rejected file
 *   - Internal filesystem paths
 *   - Cloudinary/provider error details
 *   - Stack traces
 */
export function uploadErrorHandler(err, req, res, next) {
  // Only handle multer errors and our own MIME errors here
  if (!err) return next();

  const IS_PROD = (process.env.NODE_ENV || "").toLowerCase() === "production";

  // Multer size limit
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "File is too large.",
      code: "FILE_TOO_LARGE",
    });
  }

  // Multer unexpected field, count, etc.
  if (err instanceof multer.MulterError) {
    // Log internally but return generic message
    console.warn("[upload] multer error:", err.code, err.field);
    return res.status(400).json({
      success: false,
      message: "Invalid file upload.",
      code: "UPLOAD_ERROR",
    });
  }

  // Our custom MIME filter error
  if (err && err.code === "MIME_TYPE_NOT_ALLOWED") {
    return res.status(400).json({
      success: false,
      message: "Invalid file upload.",
      code: "INVALID_FILE_TYPE",
    });
  }

  // Other errors thrown by a fileFilter (e.g. older "Only PNG and JPEG allowed")
  if (
    err instanceof Error &&
    (err.status === 400 || err.message?.toLowerCase().includes("only") || err.message?.toLowerCase().includes("allowed"))
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid file upload.",
      code: "INVALID_FILE_TYPE",
    });
  }

  // Pass non-upload errors to the next error handler
  return next(err);
}

// ------------------------------------------------------------------
// virusScanPlaceholder
// ------------------------------------------------------------------

/**
 * Placeholder for virus/malware scanning hook.
 *
 * TODO: Integrate a real AV library here when available, e.g.:
 *   - ClamAV via clamscan npm package
 *   - VirusTotal API for cloud scanning
 *   - MinIO/S3 with on-upload Lambda scanning
 *
 * Current behaviour: logs the intent and resolves immediately (no-op).
 * Replace the body when AV integration is ready.
 *
 * @param {{ buffer?: Buffer, path?: string, originalname?: string, mimetype?: string }} file
 * @returns {Promise<{ clean: boolean, skipped: boolean, reason?: string }>}
 */
export async function virusScanPlaceholder(file) {
  // TODO [AV]: Replace with real antivirus integration
  // Example with clamav: const result = await clamscan.isInfected(file.path);
  console.debug("[upload:av] virus scan placeholder called for:", file?.originalname || "(unknown)");
  return { clean: true, skipped: true, reason: "AV scanning not yet configured" };
}

// ------------------------------------------------------------------
// createSecureMulterConfig
// ------------------------------------------------------------------

/**
 * Factory: create a fully-hardened multer config object (not a multer instance).
 * Pass the result to multer():
 *
 *   const upload = multer(createSecureMulterConfig({
 *     storage: multer.memoryStorage(),
 *     allowedTypes: ALLOWED_MIME.DOCUMENTS_AND_IMAGES,
 *     maxFileSizeMb: 10,
 *   }));
 *
 * @param {Object} opts
 * @param {import('multer').StorageEngine} opts.storage
 * @param {string[]} opts.allowedTypes        — MIME types to allow
 * @param {number} [opts.maxFileSizeMb=10]    — max file size in MB
 * @param {string} [opts.label]               — label for error messages
 */
export function createSecureMulterConfig({
  storage,
  allowedTypes,
  maxFileSizeMb = 10,
  label,
}) {
  if (!storage) throw new Error("createSecureMulterConfig: storage is required");
  if (!Array.isArray(allowedTypes) || allowedTypes.length === 0) {
    throw new Error("createSecureMulterConfig: allowedTypes must be a non-empty array");
  }

  const allowed = new Set(allowedTypes);
  const typeLabel = label || "an accepted file type";

  return {
    storage,
    limits: {
      fileSize: maxFileSizeMb * 1024 * 1024,
    },
    fileFilter(req, file, cb) {
      // 1. MIME type check
      if (!allowed.has(file.mimetype)) {
        const err = new Error(`Invalid file type. Please upload: ${typeLabel}.`);
        err.status = 400;
        err.code = "MIME_TYPE_NOT_ALLOWED";
        return cb(err, false);
      }

      // 2. Extension consistency check (non-blocking warning + log)
      const extCheck = validateExtensionMatchesMime(file);
      if (!extCheck.ok) {
        console.warn("[upload:security] extension/MIME mismatch:", {
          originalname: file.originalname,
          mimetype: file.mimetype,
          reason: extCheck.reason,
        });
        // Reject mismatches — belt-and-suspenders
        const err = new Error("Invalid file upload.");
        err.status = 400;
        err.code = "MIME_TYPE_NOT_ALLOWED";
        return cb(err, false);
      }

      cb(null, true);
    },
  };
}
