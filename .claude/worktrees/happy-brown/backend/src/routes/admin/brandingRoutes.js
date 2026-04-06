import express from "express";
import multer from "multer";
import path from "path";
import { requireAdmin } from "../../middleware/authMiddleware.js";
import {
  getBranding,
  setLogoUrl,
  updateBranding,
} from "../../controllers/admin/brandingController.js";

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
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
