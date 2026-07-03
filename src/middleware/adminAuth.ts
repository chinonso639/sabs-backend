import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Admin } from "../models/Admin";
import { ADMIN_JWT_COOKIE_NAME } from "../config/constants";

interface AdminJwtPayload {
  id: string;
  isAdmin: true;
}

export const adminProtect = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  let token: string | undefined;

  if (req.cookies?.[ADMIN_JWT_COOKIE_NAME]) {
    token = req.cookies[ADMIN_JWT_COOKIE_NAME] as string;
  } else if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    res
      .status(401)
      .json({ success: false, message: "Admin authentication required." });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");

  let decoded: AdminJwtPayload;
  try {
    decoded = jwt.verify(token, secret) as AdminJwtPayload;
  } catch {
    res
      .status(401)
      .json({ success: false, message: "Invalid or expired admin token." });
    return;
  }

  if (!decoded.isAdmin) {
    res.status(403).json({ success: false, message: "Access denied." });
    return;
  }

  const admin = await Admin.findById(decoded.id);
  if (!admin || !admin.isActive) {
    res
      .status(401)
      .json({
        success: false,
        message: "Admin account not found or deactivated.",
      });
    return;
  }

  req.admin = admin;
  next();
};
