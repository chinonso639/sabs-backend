import { Router } from "express";
import { body } from "express-validator";
import {
  register,
  login,
  logout,
  getMe,
  verifyEmail,
  adminLogin,
  adminLogout,
} from "../controllers/authController";
import { protect } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { authLimiter } from "../middleware/rateLimiter";

const router = Router();

router.post(
  "/register",
  authLimiter,
  [
    body("displayName").trim().notEmpty().isLength({ max: 50 }),
    body("email").isEmail().normalizeEmail(),
    body("password")
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
    body("phone").trim().notEmpty(),
    body("whatsappNumber").trim().notEmpty(),
    body("location").trim().notEmpty(),
  ],
  validate,
  register,
);

router.post(
  "/login",
  authLimiter,
  [body("email").isEmail().normalizeEmail(), body("password").notEmpty()],
  validate,
  login,
);

router.post("/logout", logout);
router.get("/me", protect, getMe);

router.post("/verify-email", [body("token").notEmpty()], validate, verifyEmail);

// Admin auth
router.post(
  "/admin/login",
  authLimiter,
  [body("email").isEmail().normalizeEmail(), body("password").notEmpty()],
  validate,
  adminLogin,
);

router.post("/admin/logout", adminLogout);

export default router;
