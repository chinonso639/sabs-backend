import { Router } from "express";
import { body } from "express-validator";
import {
  getPlans,
  createSubscription,
  uploadReceipt,
  getMySubscription,
  adminGetSubscriptions,
  adminApproveSubscription,
  adminRejectSubscription,
} from "../controllers/subscriptionController";
import { protect } from "../middleware/auth";
import { adminProtect } from "../middleware/adminAuth";
import { uploadReceipt as uploadReceiptMiddleware } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { uploadLimiter } from "../middleware/rateLimiter";

const router = Router();

// Public
router.get("/plans", getPlans);

// User (authenticated)
router.get("/me", protect, getMySubscription);
router.post(
  "/",
  protect,
  [body("planId").isIn(["plan1", "plan2"])],
  validate,
  createSubscription,
);
router.post(
  "/receipt",
  protect,
  uploadLimiter,
  uploadReceiptMiddleware.single("receipt"),
  [body("subscriptionId").notEmpty()],
  validate,
  uploadReceipt,
);

// Admin
router.get("/admin", adminProtect, adminGetSubscriptions);
router.put("/admin/:id/approve", adminProtect, adminApproveSubscription);
router.put(
  "/admin/:id/reject",
  adminProtect,
  [body("reason").optional().trim()],
  validate,
  adminRejectSubscription,
);

export default router;
