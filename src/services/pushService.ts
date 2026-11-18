import webpush from "web-push";
import { User } from "../models/User";
import { Subscription } from "../models/Subscription";
import { PushSubscription } from "../models/PushSubscription";
import { PushAudience } from "../models/PushCampaign";

interface PushPayload {
  title: string;
  body: string;
  url: string;
}

function getVapidConfig(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function getPushPublicKey(): string | null {
  return getVapidConfig()?.publicKey ?? null;
}

function getWebPushClient(): typeof webpush {
  const config = getVapidConfig();
  if (!config) {
    throw new Error(
      "Push notifications are not configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.",
    );
  }
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return webpush;
}

export async function getAudienceSubscriptions(
  audience: PushAudience,
): Promise<InstanceType<typeof PushSubscription>[]> {
  let userFilter: Record<string, unknown> = { isActive: true };

  if (audience === "creators") {
    userFilter = { ...userFilter, role: "creator" };
  } else if (audience === "members") {
    const memberIds = await Subscription.distinct("user", {
      status: "active",
      startDate: { $lte: new Date() },
      endDate: { $gt: new Date() },
    });
    if (memberIds.length === 0) return [];
    userFilter = { ...userFilter, _id: { $in: memberIds } };
  }

  const userIds = await User.distinct("_id", userFilter);
  if (userIds.length === 0) return [];
  return PushSubscription.find({ user: { $in: userIds } });
}

export async function sendPush(
  subscription: InstanceType<typeof PushSubscription>,
  payload: PushPayload,
): Promise<void> {
  const client = getWebPushClient();
  await client.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    },
    JSON.stringify(payload),
    { TTL: 60 * 60 },
  );
}
