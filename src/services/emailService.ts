import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 5000, // 5 seconds
  greetingTimeout: 5000,
  socketTimeout: 10000, // 10 seconds
});

const FROM = process.env.EMAIL_FROM || "noreply@matchme.ng";
const BRAND = "MatchMe";

export const sendVerificationEmail = async (
  email: string,
  token: string,
  name: string,
): Promise<void> => {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

  await transporter.sendMail({
    from: `"${BRAND}" <${FROM}>`,
    to: email,
    subject: `Verify your ${BRAND} account`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;">
        <h2 style="color:#e11d48;">Welcome to ${BRAND}, ${name}!</h2>
        <p>Please verify your email address to get started.</p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#e11d48;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">
          Verify Email
        </a>
        <p style="color:#666;font-size:12px;">This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>
        <hr/>
        <p style="color:#999;font-size:11px;">${BRAND} &mdash; Premium Companionship Discovery</p>
      </div>
    `,
  });
};

export const sendSubscriptionApprovalEmail = async (
  email: string,
  name: string,
  planName: string,
): Promise<void> => {
  await transporter.sendMail({
    from: `"${BRAND}" <${FROM}>`,
    to: email,
    subject: `Your ${BRAND} subscription is now active!`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;">
        <h2 style="color:#e11d48;">🎉 Subscription Approved!</h2>
        <p>Hi ${name},</p>
        <p>Your <strong>${planName}</strong> subscription has been approved and is now active.</p>
        <p>You can now access companion contact information as per your plan.</p>
        <a href="${process.env.FRONTEND_URL}" style="display:inline-block;padding:12px 24px;background:#e11d48;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">
          Browse Profiles
        </a>
        <hr/>
        <p style="color:#999;font-size:11px;">${BRAND} &mdash; Premium Companionship Discovery</p>
      </div>
    `,
  });
};

export const sendSubscriptionRejectionEmail = async (
  email: string,
  name: string,
  reason: string,
): Promise<void> => {
  await transporter.sendMail({
    from: `"${BRAND}" <${FROM}>`,
    to: email,
    subject: `Your ${BRAND} payment verification was unsuccessful`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px;">
        <h2 style="color:#e11d48;">Payment Verification Unsuccessful</h2>
        <p>Hi ${name},</p>
        <p>Unfortunately, your payment receipt could not be verified. Reason: <strong>${reason || "Receipt could not be confirmed."}</strong></p>
        <p>Please re-upload a clear photo of your payment receipt and resubmit.</p>
        <a href="${process.env.FRONTEND_URL}/subscribe" style="display:inline-block;padding:12px 24px;background:#e11d48;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">
          Resubmit Receipt
        </a>
        <hr/>
        <p style="color:#999;font-size:11px;">${BRAND} &mdash; Premium Companionship Discovery</p>
      </div>
    `,
  });
};
