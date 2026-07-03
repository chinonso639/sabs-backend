import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { User } from "../models/User";
import { Admin } from "../models/Admin";
import { JWT_COOKIE_NAME, ADMIN_JWT_COOKIE_NAME } from "../config/constants";
import { sendVerificationEmail } from "../services/emailService";
import { createError } from "../middleware/errorHandler";

const signToken = (id: string, extra: object = {}): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");
  return jwt.sign({ id, ...extra }, secret, {
    expiresIn: (process.env.JWT_EXPIRES_IN ||
      "7d") as jwt.SignOptions["expiresIn"],
  });
};

const cookieOptions = (days = 7) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: (process.env.NODE_ENV === "production" ? "none" : "lax") as
    | "none"
    | "lax",
  maxAge: days * 24 * 60 * 60 * 1000,
  path: "/",
});

// ── User Registration ──────────────────────────────────────────────────────────
export const register = async (req: Request, res: Response): Promise<void> => {
  const {
    displayName,
    email,
    password,
    phone,
    whatsappNumber,
    location,
    role,
  } = req.body;

  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) {
    throw createError("An account with this email already exists.", 409);
  }

  const verificationToken = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const user = await User.create({
    displayName,
    email,
    password,
    phone,
    whatsappNumber,
    location,
    role: role === "creator" ? "creator" : "user",
    emailVerificationToken: verificationToken,
    emailVerificationExpiry: expiry,
  });

  // Send email asynchronously (fire-and-forget) to avoid blocking response
  sendVerificationEmail(user.email, verificationToken, user.displayName).catch(
    (e) => console.error("Failed to send verification email:", e),
  );

  const token = signToken(user._id.toString());
  res.cookie(JWT_COOKIE_NAME, token, cookieOptions(7));

  res.status(201).json({
    success: true,
    message: "Account created. Please verify your email.",
    data: { user, token },
  });
};

// ── User Login ─────────────────────────────────────────────────────────────────
export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+password",
  );
  if (!user || !(await user.comparePassword(password))) {
    throw createError("Invalid email or password.", 401);
  }

  if (!user.isActive) {
    throw createError(
      "Your account has been deactivated. Please contact support.",
      403,
    );
  }

  const token = signToken(user._id.toString());
  res.cookie(JWT_COOKIE_NAME, token, cookieOptions(7));

  // Refresh user without password
  const safeUser = await User.findById(user._id);
  res.json({ success: true, data: { user: safeUser, token } });
};

// ── Logout ─────────────────────────────────────────────────────────────────────
export const logout = (_req: Request, res: Response): void => {
  res.clearCookie(JWT_COOKIE_NAME, { path: "/" });
  res.json({ success: true, message: "Logged out successfully." });
};

// ── Get Current User ───────────────────────────────────────────────────────────
export const getMe = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: { user: req.user } });
};

// ── Verify Email ───────────────────────────────────────────────────────────────
export const verifyEmail = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { token } = req.body;

  const user = await User.findOne({
    emailVerificationToken: token,
    emailVerificationExpiry: { $gt: new Date() },
  }).select("+emailVerificationToken +emailVerificationExpiry");

  if (!user) {
    throw createError("Invalid or expired verification link.", 400);
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = null;
  user.emailVerificationExpiry = null;
  await user.save();

  res.json({ success: true, message: "Email verified successfully." });
};

// ── Admin Login ────────────────────────────────────────────────────────────────
export const adminLogin = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ email: email.toLowerCase() }).select(
    "+password",
  );
  if (!admin || !(await admin.comparePassword(password))) {
    throw createError("Invalid admin credentials.", 401);
  }

  if (!admin.isActive) {
    throw createError("Admin account deactivated.", 403);
  }

  admin.lastLogin = new Date();
  await admin.save();

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");

  const token = jwt.sign({ id: admin._id, isAdmin: true }, secret, {
    expiresIn: "12h",
  });
  res.cookie(ADMIN_JWT_COOKIE_NAME, token, cookieOptions(0.5));

  res.json({ success: true, data: { admin, token } });
};

// ── Admin Logout ───────────────────────────────────────────────────────────────
export const adminLogout = (_req: Request, res: Response): void => {
  res.clearCookie(ADMIN_JWT_COOKIE_NAME, { path: "/" });
  res.json({ success: true, message: "Admin logged out." });
};
