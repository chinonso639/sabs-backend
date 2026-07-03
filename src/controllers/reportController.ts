import { Request, Response } from "express";
import mongoose from "mongoose";
import { Report } from "../models/Report";
import { CompanionProfile } from "../models/CompanionProfile";
import { createError } from "../middleware/errorHandler";

// ── Submit Report (user) ──────────────────────────────────────────────────────
export const submitReport = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { profileId, reason, description } = req.body;
  const user = req.user!;

  if (!mongoose.Types.ObjectId.isValid(profileId))
    throw createError("Invalid profile ID.", 400);

  const profile = await CompanionProfile.findOne({
    _id: profileId,
    isActive: true,
  });
  if (!profile) throw createError("Profile not found.", 404);

  // Prevent duplicate reports from same user on same profile
  const existingReport = await Report.findOne({
    reporter: user._id,
    profile: profileId,
  });
  if (existingReport) {
    throw createError(
      "You have already submitted a report for this profile.",
      409,
    );
  }

  const report = await Report.create({
    reporter: user._id,
    profile: profileId,
    reason,
    description: description?.trim() ?? "",
  });

  res.status(201).json({
    success: true,
    message: "Report submitted. Our team will review it shortly.",
    data: { report },
  });
};

// ── Admin: Get All Reports ────────────────────────────────────────────────────
export const adminGetReports = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { status, page = 1, limit = 20 } = req.query;
  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, parseInt(limit as string));

  const filter: mongoose.FilterQuery<typeof Report> = {};
  if (status) filter.status = status;

  const [reports, total] = await Promise.all([
    Report.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate("reporter", "displayName email")
      .populate("profile", "displayName location profileImage"),
    Report.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { reports, pagination: { total, page: pageNum, limit: limitNum } },
  });
};

// ── Admin: Update Report Status ───────────────────────────────────────────────
export const adminUpdateReport = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const { status, adminNotes } = req.body;
  const admin = req.admin!;

  if (!mongoose.Types.ObjectId.isValid(id))
    throw createError("Invalid report ID.", 400);

  const report = await Report.findById(id);
  if (!report) throw createError("Report not found.", 404);

  report.status = status;
  report.adminNotes = adminNotes ?? report.adminNotes;
  report.reviewedBy = admin._id as unknown as mongoose.Types.ObjectId;
  report.reviewedAt = new Date();
  await report.save();

  res.json({ success: true, message: "Report updated.", data: { report } });
};
