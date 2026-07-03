import { Router } from "express";
import { body } from "express-validator";
import {
  submitReport,
  adminGetReports,
  adminUpdateReport,
} from "../controllers/reportController";
import { protect } from "../middleware/auth";
import { adminProtect } from "../middleware/adminAuth";
import { validate } from "../middleware/validate";
import { REPORT_REASONS } from "../config/constants";

const router = Router();

// User: submit report
router.post(
  "/",
  protect,
  [
    body("profileId").notEmpty(),
    body("reason").isIn(REPORT_REASONS),
    body("description").optional().trim().isLength({ max: 1000 }),
  ],
  validate,
  submitReport,
);

// Admin: manage reports
router.get("/admin", adminProtect, adminGetReports);
router.patch(
  "/admin/:id",
  adminProtect,
  [
    body("status").isIn(["pending", "reviewed", "resolved", "dismissed"]),
    body("adminNotes").optional().trim(),
  ],
  validate,
  adminUpdateReport,
);

export default router;
