import express from "express";
import {
  createSubject,
  deleteSubject,
  listSubjects,
  updateSubject,
} from "../../controllers/admin/subjectsController.js";

const router = express.Router();

router.get("/", listSubjects);
router.post("/", createSubject);
router.put("/:id", updateSubject);
router.delete("/:id", deleteSubject);

export default router;
