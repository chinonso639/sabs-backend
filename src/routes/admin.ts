import { Router } from "express";
import { body } from "express-validator";
import {
  getDashboardStats,
  getUsers,
  toggleUserStatus,
} from "../controllers/adminController";
import { adminProtect } from "../middleware/adminAuth";
import { validate } from "../middleware/validate";

const router = Router();

router.use(adminProtect);

router.get("/dashboard", getDashboardStats);
router.get("/users", getUsers);
router.patch("/users/:id/status", validate, toggleUserStatus);

export default router;
