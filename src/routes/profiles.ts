import { Router } from "express";
import { body } from "express-validator";
import {
  getProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  adminSetProfileEnabled,
  uploadGalleryMedia,
  deleteGalleryItem,
  getMyProfile,
  createMyProfile,
  uploadMyGallery,
  getBoostStatus,
  createBoostRequest,
  uploadBoostReceipt,
  adminGetBoostRequests,
  adminApproveBoost,
  adminRejectBoost,
} from "../controllers/profileController";
import { optionalAuth, protect } from "../middleware/auth";
import { adminProtect } from "../middleware/adminAuth";
import { uploadImage, uploadMedia } from "../middleware/upload";
import { validate } from "../middleware/validate";
import { generalLimiter } from "../middleware/rateLimiter";

const router = Router();

// Public routes
router.get("/", generalLimiter, optionalAuth, getProfiles);

// Creator routes (logged-in creator managing their own profile)
router.get("/mine", protect, getMyProfile);
router.post(
  "/mine",
  protect,
  uploadImage.fields([{ name: "profileImage", maxCount: 1 }]),
  createMyProfile,
);
router.post(
  "/mine/gallery",
  protect,
  uploadMedia.array("media", 20),
  uploadMyGallery,
);

router.get("/:id", generalLimiter, optionalAuth, getProfile);

// Admin-only routes
router.post(
  "/",
  adminProtect,
  uploadImage.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  [
    body("displayName").trim().notEmpty(),
    body("age").isInt({ min: 18, max: 80 }),
    body("location").trim().notEmpty(),
    body("shortBio").trim().notEmpty().isLength({ max: 160 }),
    body("whatsappNumber").trim().notEmpty(),
  ],
  validate,
  createProfile,
);

router.put(
  "/:id",
  adminProtect,
  uploadImage.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  updateProfile,
);

router.delete("/:id", adminProtect, deleteProfile);

// Enable/disable profile — simple JSON PATCH (no multipart), reliable on all browsers
router.patch(
  "/:id/enabled",
  adminProtect,
  [body("isEnabled").isBoolean()],
  validate,
  adminSetProfileEnabled,
);

// Gallery
router.post(
  "/:id/gallery",
  adminProtect,
  uploadMedia.array("media", 20),
  uploadGalleryMedia,
);

router.delete("/:id/gallery/:itemId", adminProtect, deleteGalleryItem);

// Boost Profile routes (creator)
router.get("/boost/status", protect, getBoostStatus);
router.post("/boost/request", protect, createBoostRequest);
router.post(
  "/boost/receipt",
  protect,
  uploadMedia.single("receipt"),
  uploadBoostReceipt,
);

// Boost Profile routes (admin)
router.get("/admin/boosts", adminProtect, adminGetBoostRequests);
router.put("/admin/boosts/:id/approve", adminProtect, adminApproveBoost);
router.put(
  "/admin/boosts/:id/reject",
  adminProtect,
  [body("reason").optional().trim()],
  validate,
  adminRejectBoost,
);

export default router;
