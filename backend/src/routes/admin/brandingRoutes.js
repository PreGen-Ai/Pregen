import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { requireAdmin } from "../../middleware/authMiddleware.js";
import {
  getBranding,
  setLogoUrl,
  updateBranding,
} from "../../controllers/admin/brandingController.js";

const router = express.Router();

// Use an absolute path so the destination is correct regardless of CWD.
// server.js also derives its uploadsDir from __dirname so both resolve to
// the same backend/uploads/ directory.
const __filename = fileURLToPath(import.meta.url);
const __rdir = path.dirname(__filename); // backend/src/routes/admin
const UPLOADS_DIR = path.resolve(__rdir, "../../../uploads"); // backend/uploads

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".png");
    cb(null, `logo_${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });

router.get("/", requireAdmin, getBranding);
router.put("/", requireAdmin, updateBranding);
router.post("/logo", requireAdmin, upload.single("logo"), setLogoUrl);

export default router;
