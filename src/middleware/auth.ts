import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { JWT_COOKIE_NAME } from "../config/constants";

interface JwtPayload {
  id: string;
  role: string;
}

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  let token: string | undefined;

  // Check HTTP-only cookie first, then Authorization header as fallback
  if (req.cookies?.[JWT_COOKIE_NAME]) {
    token = req.cookies[JWT_COOKIE_NAME] as string;
  } else if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    res
      .status(401)
      .json({ success: false, message: "Not authenticated. Please log in." });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");

  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(token, secret) as JwtPayload;
  } catch {
    res
      .status(401)
      .json({ success: false, message: "Invalid or expired token." });
    return;
  }

  const user = await User.findById(decoded.id).select("-password");
  if (!user || !user.isActive) {
    res
      .status(401)
      .json({ success: false, message: "Account not found or deactivated." });
    return;
  }

  req.user = user;
  next();
};

export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  let token: string | undefined;

  if (req.cookies?.[JWT_COOKIE_NAME]) {
    token = req.cookies[JWT_COOKIE_NAME] as string;
  } else if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    next();
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    next();
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    const user = await User.findById(decoded.id).select("-password");
    if (user && user.isActive) req.user = user;
  } catch {
    // Token invalid, continue as guest
  }

  next();
};
