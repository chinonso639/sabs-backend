import mongoose, { Document, Schema } from "mongoose";

export interface ISubscription extends Document {
  user: mongoose.Types.ObjectId;
  planId: "plan1" | "plan2";
  planName: string;
  price: number;
  currency: string;
  status: "pending" | "active" | "expired" | "cancelled" | "rejected";
  startDate: Date | null;
  endDate: Date | null;
  profilesUnlocked: mongoose.Types.ObjectId[]; // for plan1 tracking
  profileLimit: number; // -1 = unlimited
  paymentReceipt: mongoose.Types.ObjectId | null;
  approvedBy: mongoose.Types.ObjectId | null;
  approvedAt: Date | null;
  rejectedReason: string;
  createdAt: Date;
  updatedAt: Date;
  isActive(): boolean;
  canAccessProfile(profileId: string): boolean;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    planId: { type: String, enum: ["plan1", "plan2"], required: true },
    planName: { type: String, required: true },
    price: { type: Number, required: true },
    currency: { type: String, default: "NGN" },
    status: {
      type: String,
      enum: ["pending", "active", "expired", "cancelled", "rejected"],
      default: "pending",
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    profilesUnlocked: [
      { type: Schema.Types.ObjectId, ref: "CompanionProfile" },
    ],
    profileLimit: { type: Number, default: 5 },
    paymentReceipt: {
      type: Schema.Types.ObjectId,
      ref: "PaymentReceipt",
      default: null,
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    approvedAt: { type: Date, default: null },
    rejectedReason: { type: String, default: "" },
  },
  { timestamps: true },
);

subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ status: 1 });

subscriptionSchema.methods.isActive = function (): boolean {
  if (this.status !== "active") return false;
  if (!this.endDate) return false;
  return new Date() < new Date(this.endDate);
};

subscriptionSchema.methods.canAccessProfile = function (
  profileId: string,
): boolean {
  if (!this.isActive()) return false;
  if (this.profileLimit === -1) return true; // plan2 - unlimited
  return this.profilesUnlocked.some(
    (id: mongoose.Types.ObjectId) => id.toString() === profileId,
  );
};

export const Subscription = mongoose.model<ISubscription>(
  "Subscription",
  subscriptionSchema,
);
