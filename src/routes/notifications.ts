import { Router } from "express";
import { body } from "express-validator";
import {
  getPushStatus,
  getAccountNotifications,
  recordPWAInstallation,
  removePushSubscription,
  savePushSubscription,
} from "../controllers/notificationController";
import { protect } from "../middleware/auth";
import { validate } from "../middleware/validate";

const router = Router();

router.get("/push/status", getPushStatus);
router.use(protect);
router.get("/in-app", getAccountNotifications);
router.post("/pwa/installation", recordPWAInstallation);
router.post(
  "/push/subscription",
  [
    body("endpoint").isString().isLength({ min: 1, max: 2048 }),
    body("keys.p256dh").isString().isLength({ min: 1, max: 256 }),
    body("keys.auth").isString().isLength({ min: 1, max: 256 }),
  ],
  validate,
  savePushSubscription,
);
router.delete(
  "/push/subscription",
  [body("endpoint").isString().isLength({ min: 1, max: 2048 })],
  validate,
  removePushSubscription,
);

export default router;
