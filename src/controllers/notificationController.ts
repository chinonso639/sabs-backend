import { Request, Response } from "express";
import mongoose from "mongoose";
import { User } from "../models/User";
import { PushSubscription } from "../models/PushSubscription";
import { PushCampaign, PushAudience } from "../models/PushCampaign";
import { createError } from "../middleware/errorHandler";
import {
  getAudienceSubscriptions,
  getPushPublicKey,
  sendPush,
} from "../services/pushService";

const AUDIENCES: PushAudience[] = ["all", "creators", "members"];

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
