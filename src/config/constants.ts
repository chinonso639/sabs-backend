export const SUBSCRIPTION_PLANS = {
  plan1: {
    id: "plan1",
    name: "Basic",
    price: 5500,
    currency: "NGN",
    duration: 30, // days
    profileLimit: 5,
    description: "Access contact details of up to 5 profiles per month",
    features: [
      "Contact 5 verified companions",
      "WhatsApp access",
      "Profile gallery viewing",
      "30-day validity",
    ],
  },
  plan2: {
    id: "plan2",
    name: "Premium",
    price: 10000,
    currency: "NGN",
    duration: 30, // days
    profileLimit: -1, // unlimited
    description: "Unlimited access to all profile contact details",
    features: [
      "Unlimited companion contacts",
      "WhatsApp access to all profiles",
      "Priority support",
      "Profile gallery viewing",
      "30-day validity",
      "VIP badge",
    ],
  },
} as const;

export type PlanId = keyof typeof SUBSCRIPTION_PLANS;

export const JWT_COOKIE_NAME = "matchme_token";
export const ADMIN_JWT_COOKIE_NAME = "matchme_admin_token";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
];
export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
export const MAX_RECEIPT_SIZE = 5 * 1024 * 1024; // 5MB

export const REPORT_REASONS = [
  "fake_profile",
  "inappropriate_content",
  "spam",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export const BANK_DETAILS = {
  bankName: process.env.BANK_NAME || "First Bank of Nigeria",
  accountName: process.env.BANK_ACCOUNT_NAME || "MatchMe Services Ltd",
  accountNumber: process.env.BANK_ACCOUNT_NUMBER || "3012345678",
};

// Boost Profile configuration
export const BOOST_PROFILE_PRICE = parseInt(
  process.env.BOOST_PROFILE_PRICE || "3000",
  10,
);
export const BOOST_PROFILE_DURATION = 30; // days

export const PLATFORM_AGE_REQUIREMENT = 18;
