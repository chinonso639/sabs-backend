import { Request, Response } from "express";
import mongoose from "mongoose";
import { User } from "../models/User";
import { Admin } from "../models/Admin";
import { CompanionProfile } from "../models/CompanionProfile";
import { Subscription } from "../models/Subscription";
import { PaymentReceipt } from "../models/PaymentReceipt";
import { Report } from "../models/Report";
import { createError } from "../middleware/errorHandler";

// ── Dashboard Stats ────────────────────────────────────────────────────────────
export const getDashboardStats = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    totalProfiles,
    activeProfiles,
    pendingReceipts,
    activeSubscriptions,
    totalRevenue,
    monthlyRevenue,
    pendingReports,
    recentUsers,
  ] = await Promise.all([
    User.countDocuments(),
    CompanionProfile.countDocuments(),
    CompanionProfile.countDocuments({ isActive: true, isEnabled: true }),
    PaymentReceipt.countDocuments({ status: "pending" }),
    Subscription.countDocuments({ status: "active", endDate: { $gt: now } }),
    Subscription.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: null, total: { $sum: "$price" } } },
    ]),
    Subscription.aggregate([
      { $match: { status: "active", approvedAt: { $gte: thirtyDaysAgo } } },
      { $group: { _id: null, total: { $sum: "$price" } } },
    ]),
    Report.countDocuments({ status: "pending" }),
    User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("displayName email createdAt role"),
  ]);

  res.json({
    success: true,
    data: {
      stats: {
        totalUsers,
        totalProfiles,
        activeProfiles,
        pendingReceipts,
        activeSubscriptions,
        totalRevenue: totalRevenue[0]?.total ?? 0,
        monthlyRevenue: monthlyRevenue[0]?.total ?? 0,
        pendingReports,
      },
      recentUsers,
    },
  });
};

// ── Get All Users ──────────────────────────────────────────────────────────────
export const getUsers = async (req: Request, res: Response): Promise<void> => {
  const { page = 1, limit = 20, search, role } = req.query;
  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, parseInt(limit as string));

  const filter: mongoose.FilterQuery<typeof User> = {};
  if (search) {
    filter.$or = [
      { displayName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }
  if (role) filter.role = role;

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .select("-password"),
    User.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { users, pagination: { total, page: pageNum, limit: limitNum } },
  });
};

// ── Toggle User Status ─────────────────────────────────────────────────────────
export const toggleUserStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    throw createError("Invalid user ID.", 400);

  const user = await User.findById(id);
  if (!user) throw createError("User not found.", 404);

  user.isActive = !user.isActive;
  await user.save();

  res.json({
    success: true,
    message: `User ${user.isActive ? "activated" : "deactivated"}.`,
  });
};

// ── Create Admin ───────────────────────────────────────────────────────────────
export const createAdmin = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { name, email, password } = req.body;

  // Check if admin with email already exists
  const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
  if (existingAdmin) {
    throw createError("An admin with this email already exists.", 409);
  }

  // Create new admin
  const admin = await Admin.create({
    name,
    email: email.toLowerCase(),
    password,
    isActive: true,
  });

  res.status(201).json({
    success: true,
    message: "Admin created successfully.",
    data: { admin },
  });
};
