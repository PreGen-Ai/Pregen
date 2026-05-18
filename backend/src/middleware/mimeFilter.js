/**
 * backend/src/middleware/mimeFilter.js
 *
 * Reusable multer fileFilter factories with MIME type allowlists.
 *
 * Usage:
 *   import { createMimeFilter, ALLOWED_MIME } from "../middleware/mimeFilter.js";
 *
 *   const upload = multer({
 *     storage: multer.memoryStorage(),
 *     limits: { fileSize: 10 * 1024 * 1024 },
 *     fileFilter: createMimeFilter(ALLOWED_MIME.DOCUMENTS_AND_IMAGES),
 *   });
 *
 * Safe error behaviour:
 *   - Rejected files return a 400 error via multer's cb mechanism.
 *   - The error message does NOT echo the uploaded MIME type back to the client
 *     (avoids leaking internal detection details).
 *   - Use multer's built-in error handler in your Express error middleware to
 *     catch MulterError and return a clean JSON 400 response.
 */

// ------------------------------------------------------------------
// MIME type sets
// ------------------------------------------------------------------

/** Common document types accepted across the platform */
const DOCUMENT_TYPES = [
  "application/pdf",
  // Word documents
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/msword",                                                       // .doc (legacy)
  // Plain text
  "text/plain",
  // Spreadsheets (for admin imports)
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       // .xlsx
  "application/vnd.ms-excel",                                                // .xls (legacy)
  // Presentations
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
];

/** Image types */
const IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",   // some browsers send this alias
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

/** Logo/branding — images only (no SVG for security) */
const LOGO_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

export const ALLOWED_MIME = Object.freeze({
  /** Full document + image set — used by AI routes, tutor, assignment uploads */
  DOCUMENTS_AND_IMAGES: [...DOCUMENT_TYPES, ...IMAGE_TYPES],

  /** Documents only — PDFs, DOCX, TXT, XLSX (admin imports) */
  DOCUMENTS_ONLY: DOCUMENT_TYPES,

  /** Images only with SVG — general image uploads */
  IMAGES: IMAGE_TYPES,

  /** Images without SVG — branding/logo uploads (SVG can carry JS) */
  LOGO_IMAGES: LOGO_TYPES,

  /** Profile photos — JPEG/PNG only (matches existing usercontroller.js) */
  PROFILE_PHOTOS: ["image/jpeg", "image/png"],
});

// Human-readable labels for error messages (no MIME details exposed)
const TYPE_LABELS = {
  [ALLOWED_MIME.DOCUMENTS_AND_IMAGES.join()]: "PDF, Word document, plain text, or image (JPEG, PNG, GIF, WebP)",
  [ALLOWED_MIME.DOCUMENTS_ONLY.join()]:       "PDF, Word document, plain text, or spreadsheet",
  [ALLOWED_MIME.IMAGES.join()]:               "JPEG, PNG, GIF, WebP, or SVG image",
  [ALLOWED_MIME.LOGO_IMAGES.join()]:          "JPEG, PNG, GIF, or WebP image",
  [ALLOWED_MIME.PROFILE_PHOTOS.join()]:       "JPEG or PNG image",
};

// ------------------------------------------------------------------
// Factory
// ------------------------------------------------------------------

/**
 * Create a multer fileFilter that accepts only the given MIME types.
 *
 * @param {string[]} allowedTypes  — array of allowed MIME type strings
 * @param {string} [label]         — optional human-readable label for error messages
 * @returns {Function}             — multer-compatible fileFilter function
 */
export function createMimeFilter(allowedTypes, label) {
  const allowed = new Set(allowedTypes);
  const typeLabel =
    label ||
    TYPE_LABELS[allowedTypes.join()] ||
    "an accepted file type";

  return function mimeFilter(req, file, cb) {
    if (!allowed.has(file.mimetype)) {
      const err = new Error(`Invalid file type. Please upload: ${typeLabel}.`);
      err.status = 400;
      err.code = "MIME_TYPE_NOT_ALLOWED";
      return cb(err, false);
    }
    cb(null, true);
  };
}
