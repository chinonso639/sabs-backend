import { Router } from "express";
import { body } from "express-validator";
import {
  getDashboardStats,
  getUsers,
  toggleUserStatus,
  createAdmin,
} from "../controllers/adminController";
import { adminProtect } from "../middleware/adminAuth";
import { validate } from "../middleware/validate";

const router = Router();

router.use(adminProtect);

router.get("/dashboard", getDashboardStats);
router.get("/users", getUsers);
router.patch("/users/:id/status", validate, toggleUserStatus);

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
