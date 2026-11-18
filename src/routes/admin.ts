import { Router } from "express";
import { body } from "express-validator";
import {
  getDashboardStats,
  getUsers,
  toggleUserStatus,
  createAdmin,
} from "../controllers/adminController";
import {
  getPushAudienceCounts,
  getPushCampaigns,
  sendTestPush,
  sendPushCampaign,
} from "../controllers/notificationController";
import { adminProtect } from "../middleware/adminAuth";
import { validate } from "../middleware/validate";

const router = Router();

router.use(adminProtect);

router.get("/dashboard", getDashboardStats);
router.get("/users", getUsers);
router.patch("/users/:id/status", validate, toggleUserStatus);
router.get("/push/audiences", getPushAudienceCounts);
router.get("/push/campaigns", getPushCampaigns);
router.post(
  "/push/test",
  [
    body("title").trim().notEmpty().isLength({ max: 80 }),
    body("message").trim().notEmpty().isLength({ max: 240 }),
    body("url").isString().isLength({ min: 1, max: 500 }),
    body("email").isEmail().normalizeEmail(),
  ],
  validate,
  sendTestPush,
);
router.post(
  "/push/campaigns",
  [
    body("title").trim().notEmpty().isLength({ max: 80 }),
    body("message").trim().notEmpty().isLength({ max: 240 }),
    body("url").isString().isLength({ min: 1, max: 500 }),
    body("audience").isIn(["all", "creators", "members"]),
  ],
  validate,
  sendPushCampaign,
);

router.post(
  "/create-admin",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
  ],
  validate,
  createAdmin,
);

export default router;
