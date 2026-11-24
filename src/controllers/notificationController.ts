import { Request, Response } from "express";
import mongoose from "mongoose";
import { User } from "../models/User";
import { PushSubscription } from "../models/PushSubscription";
import { PushCampaign, PushAudience } from "../models/PushCampaign";
import { Subscription } from "../models/Subscription";
import { CompanionProfile } from "../models/CompanionProfile";
import { createError } from "../middleware/errorHandler";
import {
  getAudienceSubscriptions,
  getPushPublicKey,
  sendPush,
} from "../services/pushService";

const AUDIENCES: PushAudience[] = ["all", "creators", "members"];

interface AccountNotification {
  id: string;
  type: "payment" | "boost";
  status: "pending" | "approved" | "rejected";
  title: string;
  message: string;
  createdAt: Date;
  href: string;
}

interface NotificationReceipt {
  status: "pending" | "approved" | "rejected";
  createdAt: Date;
  reviewedAt: Date | null;
  rejectionReason: string;
}

function validateNotificationUrl(url: string): void {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  if (
    !url ||
    !url.startsWith("/") ||
    url.startsWith("//") ||
    url.includes("\\")
  ) {
    throw createError("Notification link must be a path on this website.", 400);
  }
  try {
    const parsedUrl = new URL(url, frontendUrl);
    if (parsedUrl.origin !== new URL(frontendUrl).origin) {
      throw createError("Notification link must be on this website.", 400);
    }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) throw error;
    throw createError("Notification link is invalid.", 400);
  }
}

async function deliverPushes(
  subscriptions: InstanceType<typeof PushSubscription>[],
  title: string,
  message: string,
  url: string,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const batchSize = 20;

  for (let index = 0; index < subscriptions.length; index += batchSize) {
    const batch = subscriptions.slice(index, index + batchSize);
    const results = await Promise.all(
      batch.map(async (subscription) => {
        try {
          await sendPush(subscription, { title, body: message, url });
          return true;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await PushSubscription.deleteOne({ _id: subscription._id });
          } else {
            console.error("[Push] Delivery failed:", error);
          }
          return false;
        }
      }),
    );
    sent += results.filter(Boolean).length;
    failed += results.length - results.filter(Boolean).length;
  }
  return { sent, failed };
}

export const getPushStatus = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const publicKey = getPushPublicKey();
  res.json({
    success: true,
    data: { enabled: Boolean(publicKey), publicKey },
  });
};

export const recordPWAInstallation = async (
  req: Request,
  res: Response,
): Promise<void> => {
  await User.updateOne(
    { _id: req.user!._id, pwaInstalledAt: null },
    { $set: { pwaInstalledAt: new Date() } },
  );
  res.json({ success: true, message: "PWA installation recorded." });
};

export const getAccountNotifications = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const [subscriptions, profiles] = await Promise.all([
    Subscription.find({ user: req.user!._id })
      .sort({ updatedAt: -1 })
      .limit(50)
      .populate<{ paymentReceipt: NotificationReceipt | null }>(
        "paymentReceipt",
        "status createdAt reviewedAt rejectionReason",
      )
      .lean(),
    CompanionProfile.find({
      createdBy: req.user!._id,
      boostPaymentReceipt: { $ne: null },
    })
      .sort({ updatedAt: -1 })
      .limit(50)
      .populate<{ boostPaymentReceipt: NotificationReceipt | null }>(
        "boostPaymentReceipt",
        "status createdAt reviewedAt rejectionReason",
      )
      .lean(),
  ]);

  const notifications: AccountNotification[] = [];

  for (const subscription of subscriptions) {
    const receipt = subscription.paymentReceipt;
    if (subscription.status === "pending") {
      notifications.push({
        id: `payment-${subscription._id}`,
        type: "payment",
        status: "pending",
        title: receipt?.status === "pending"
          ? "Payment awaiting approval"
          : "Complete your subscription payment",
        message: receipt?.status === "pending"
          ? `Your ${subscription.planName} payment receipt is being reviewed.`
          : `Your ${subscription.planName} subscription is waiting for payment and receipt upload.`,
        createdAt:
          receipt?.reviewedAt ?? receipt?.createdAt ?? subscription.updatedAt,
        href: `/payment?plan=${subscription.planId}&sub=${subscription._id}`,
      });
    } else if (subscription.status === "active") {
      notifications.push({
        id: `payment-${subscription._id}`,
        type: "payment",
        status: "approved",
        title: "Payment approved",
        message: `Your ${subscription.planName} subscription payment was approved.`,
        createdAt: subscription.approvedAt ?? subscription.updatedAt,
        href: "/dashboard",
      });
    } else if (subscription.status === "rejected") {
      notifications.push({
        id: `payment-${subscription._id}`,
        type: "payment",
        status: "rejected",
        title: "Payment not approved",
        message:
          receipt?.rejectionReason ||
          subscription.rejectedReason ||
          "Your payment could not be verified. Please review and try again.",
        createdAt: receipt?.createdAt ?? subscription.updatedAt,
        href: `/subscribe?plan=${subscription.planId}`,
      });
    }
  }

  for (const profile of profiles) {
    const receipt = profile.boostPaymentReceipt;
    if (!receipt) continue;

    if (receipt.status === "pending") {
      notifications.push({
        id: `boost-${profile._id}-${receipt.createdAt.getTime()}`,
        type: "boost",
        status: "pending",
        title: "Boost payment awaiting approval",
        message: `Your payment to boost ${profile.displayName} is being reviewed.`,
        createdAt: receipt.reviewedAt ?? receipt.createdAt,
        href: "/creator/dashboard",
      });
    } else if (receipt.status === "approved") {
      notifications.push({
        id: `boost-${profile._id}-${receipt.createdAt.getTime()}`,
        type: "boost",
        status: "approved",
        title: "Profile boost approved",
        message: `Your boost payment was approved. ${profile.displayName} is featured for the boost period.`,
        createdAt: receipt.reviewedAt ?? receipt.createdAt,
        href: "/creator/dashboard",
      });
    } else {
      notifications.push({
        id: `boost-${profile._id}-${receipt.createdAt.getTime()}`,
        type: "boost",
        status: "rejected",
        title: "Boost payment not approved",
        message:
          receipt.rejectionReason ||
          "Your boost payment could not be verified. Please review and try again.",
        createdAt: receipt.reviewedAt ?? receipt.createdAt,
        href: "/creator/dashboard",
      });
    }
  }

  notifications.sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );

  res.json({ success: true, data: { notifications } });
};

export const savePushSubscription = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { endpoint, keys } = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint || "");
  } catch {
    throw createError("A valid push endpoint is required.", 400);
  }
  if (
    parsedEndpoint.protocol !== "https:" ||
    !keys?.p256dh ||
    !keys.auth ||
    keys.p256dh.length > 256 ||
    keys.auth.length > 256
  ) {
    throw createError("The push subscription is invalid.", 400);
  }

  await PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      $set: {
        user: req.user!._id,
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );

  res.status(200).json({ success: true, message: "Push notifications enabled." });
};

export const removePushSubscription = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint || typeof endpoint !== "string") {
    throw createError("A push endpoint is required.", 400);
  }
  await PushSubscription.deleteOne({ endpoint, user: req.user!._id });
  res.json({ success: true, message: "Push notifications disabled." });
};

export const getPushAudienceCounts = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const counts = await Promise.all(
    AUDIENCES.map(async (audience) => {
      const subscriptions = await getAudienceSubscriptions(audience);
      return [audience, subscriptions.length] as const;
    }),
  );
  res.json({ success: true, data: Object.fromEntries(counts) });
};

export const getPushCampaigns = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const campaigns = await PushCampaign.find()
    .sort({ createdAt: -1 })
    .limit(20)
    .populate("createdBy", "name");
  res.json({ success: true, data: { campaigns } });
};

export const sendPushCampaign = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { title, message, url, audience } = req.body as {
    title: string;
    message: string;
    url: string;
    audience: PushAudience;
  };
  if (!AUDIENCES.includes(audience)) {
    throw createError("Choose a valid notification audience.", 400);
  }
  if (!getPushPublicKey()) {
    throw createError(
      "Push notifications are not configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.",
      503,
    );
  }
  validateNotificationUrl(url);

  const subscriptions = await getAudienceSubscriptions(audience);
  if (subscriptions.length === 0) {
    throw createError("There are no opted-in devices in this audience.", 400);
  }

  const campaign = await PushCampaign.create({
    title: title.trim(),
    message: message.trim(),
    url,
    audience,
    recipientCount: subscriptions.length,
    createdBy: req.admin!._id as mongoose.Types.ObjectId,
  });

  const { sent: sentCount, failed: failedCount } = await deliverPushes(
    subscriptions,
    title.trim(),
    message.trim(),
    url,
  );

  campaign.sentCount = sentCount;
  campaign.failedCount = failedCount;
  campaign.status =
    failedCount === 0 ? "sent" : sentCount === 0 ? "failed" : "partial";
  await campaign.save();

  res.status(201).json({
    success: true,
    data: {
      campaign,
      summary: { targeted: subscriptions.length, sent: sentCount, failed: failedCount },
    },
  });
};

export const sendTestPush = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { title, message, url, email } = req.body as {
    title: string;
    message: string;
    url: string;
    email: string;
  };
  if (!getPushPublicKey()) {
    throw createError(
      "Push notifications are not configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.",
      503,
    );
  }
  validateNotificationUrl(url);

  const user = await User.findOne({
    email: email.toLowerCase(),
    isActive: true,
  }).select("_id");
  if (!user) {
    throw createError("No active user account was found for that email.", 404);
  }
  const subscriptions = await PushSubscription.find({ user: user._id });
  if (subscriptions.length === 0) {
    throw createError(
      "That user has not enabled push notifications on any device.",
      404,
    );
  }

  const summary = await deliverPushes(
    subscriptions,
    title.trim(),
    message.trim(),
    url,
  );
  res.json({
    success: true,
    data: { targeted: subscriptions.length, ...summary },
  });
};
