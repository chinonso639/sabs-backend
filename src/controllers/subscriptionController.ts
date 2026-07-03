import { Request, Response } from "express";
import mongoose from "mongoose";
import { Subscription } from "../models/Subscription";
import { PaymentReceipt } from "../models/PaymentReceipt";
import { User } from "../models/User";
import { SUBSCRIPTION_PLANS, PlanId, BANK_DETAILS } from "../config/constants";
import { uploadToB2 } from "../services/b2Service";
import {
  sendSubscriptionApprovalEmail,
  sendSubscriptionRejectionEmail,
} from "../services/emailService";
import { createError } from "../middleware/errorHandler";

// ── Get Plans ──────────────────────────────────────────────────────────────────
export const getPlans = (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: {
      plans: Object.values(SUBSCRIPTION_PLANS),
      bankDetails: BANK_DETAILS,
    },
  });
};

// ── Create Subscription (initiate) ────────────────────────────────────────────
export const createSubscription = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { planId } = req.body;
  const user = req.user!;

  if (!SUBSCRIPTION_PLANS[planId as PlanId]) {
    throw createError("Invalid plan selected.", 400);
  }

  // Check for existing pending or active subscription
  const existing = await Subscription.findOne({
    user: user._id,
    status: { $in: ["pending", "active"] },
    endDate: { $gt: new Date() },
  });

  if (existing?.status === "active") {
    throw createError("You already have an active subscription.", 409);
  }

  const plan = SUBSCRIPTION_PLANS[planId as PlanId];
  const subscription = await Subscription.create({
    user: user._id,
    planId,
    planName: plan.name,
    price: plan.price,
    currency: plan.currency,
    profileLimit: plan.profileLimit,
    status: "pending",
  });

  res.status(201).json({
    success: true,
    data: { subscription, bankDetails: BANK_DETAILS },
  });
};

// ── Upload Receipt ─────────────────────────────────────────────────────────────
export const uploadReceipt = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { subscriptionId } = req.body;
  const file = req.file;
  const user = req.user!;

  if (!file) throw createError("Payment receipt image is required.", 400);

  if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
    throw createError("Invalid subscription ID.", 400);
  }

  const subscription = await Subscription.findOne({
    _id: subscriptionId,
    user: user._id,
    status: "pending",
  });

  if (!subscription)
    throw createError("Subscription not found or already processed.", 404);

  // Check if receipt already uploaded for this subscription
  const existingReceipt = await PaymentReceipt.findOne({
    subscription: subscriptionId,
  });
  if (existingReceipt) {
    throw createError(
      "A receipt has already been submitted for this subscription.",
      409,
    );
  }

  const { url, key } = await uploadToB2(file.buffer, file.mimetype, "receipts");

  const receipt = await PaymentReceipt.create({
    user: user._id,
    subscription: subscription._id,
    planId: subscription.planId,
    amount: subscription.price,
    imageUrl: url,
    imageKey: key,
  });

  subscription.paymentReceipt =
    receipt._id as unknown as mongoose.Types.ObjectId;
  await subscription.save();

  res.status(201).json({
    success: true,
    message:
      "Receipt submitted for review. You will be notified once approved.",
    data: { receipt },
  });
};

// ── Get My Subscription ────────────────────────────────────────────────────────
export const getMySubscription = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const user = req.user!;

  const subscription = await Subscription.findOne({
    user: user._id,
    status: { $in: ["pending", "active"] },
  })
    .sort({ createdAt: -1 })
    .populate("paymentReceipt", "imageUrl status");

  res.json({ success: true, data: { subscription } });
};

// ── Admin: Get All Subscriptions ───────────────────────────────────────────────
export const adminGetSubscriptions = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { status, page = 1, limit = 20 } = req.query;
  const filter: mongoose.FilterQuery<typeof Subscription> = {};
  if (status) filter.status = status;

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, parseInt(limit as string));

  const [subscriptions, total] = await Promise.all([
    Subscription.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate("user", "displayName email phone")
      .populate("paymentReceipt", "imageUrl status createdAt"),
    Subscription.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      subscriptions,
      pagination: { total, page: pageNum, limit: limitNum },
    },
  });
};

// ── Admin: Approve Subscription ────────────────────────────────────────────────
export const adminApproveSubscription = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const admin = req.admin!;

  if (!mongoose.Types.ObjectId.isValid(id))
    throw createError("Invalid subscription ID.", 400);

  const subscription = await Subscription.findById(id).populate<{
    user: { _id: string; email: string; displayName: string };
  }>("user", "email displayName");

  if (!subscription) throw createError("Subscription not found.", 404);
  if (subscription.status === "active")
    throw createError("Subscription is already active.", 400);

  const now = new Date();
  const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  subscription.status = "active";
  subscription.startDate = now;
  subscription.endDate = endDate;
  subscription.approvedBy = admin._id as unknown as mongoose.Types.ObjectId;
  subscription.approvedAt = now;
  await subscription.save();

  // Approve the receipt too
  if (subscription.paymentReceipt) {
    await PaymentReceipt.findByIdAndUpdate(subscription.paymentReceipt, {
      status: "approved",
      reviewedBy: admin._id,
      reviewedAt: now,
    });
  }

  const populatedUser = subscription.user;
  if (populatedUser?.email) {
    await sendSubscriptionApprovalEmail(
      populatedUser.email,
      populatedUser.displayName,
      subscription.planName,
    ).catch(() => {});
  }

  res.json({
    success: true,
    message: "Subscription approved.",
    data: { subscription },
  });
};

// ── Admin: Reject Subscription ─────────────────────────────────────────────────
export const adminRejectSubscription = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  const { reason } = req.body;
  const admin = req.admin!;

  if (!mongoose.Types.ObjectId.isValid(id))
    throw createError("Invalid subscription ID.", 400);

  const subscription = await Subscription.findById(id).populate<{
    user: { _id: string; email: string; displayName: string };
  }>("user", "email displayName");

  if (!subscription) throw createError("Subscription not found.", 404);

  subscription.status = "rejected";
  subscription.rejectedReason = reason || "Payment could not be verified.";
  await subscription.save();

  if (subscription.paymentReceipt) {
    await PaymentReceipt.findByIdAndUpdate(subscription.paymentReceipt, {
      status: "rejected",
      rejectionReason: reason || "",
      reviewedBy: admin._id,
      reviewedAt: new Date(),
    });
  }

  const populatedUser = subscription.user;
  if (populatedUser?.email) {
    await sendSubscriptionRejectionEmail(
      populatedUser.email,
      populatedUser.displayName,
      subscription.rejectedReason,
    ).catch(() => {});
  }

  res.json({ success: true, message: "Subscription rejected." });
};
