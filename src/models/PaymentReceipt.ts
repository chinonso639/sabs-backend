import mongoose, { Document, Schema } from "mongoose";

export interface IPaymentReceipt extends Document {
  user: mongoose.Types.ObjectId;
  subscription: mongoose.Types.ObjectId;
  planId: string;
  amount: number;
  imageUrl: string;
  imageKey: string;
  status: "pending" | "approved" | "rejected";
  reviewedBy: mongoose.Types.ObjectId | null;
  reviewedAt: Date | null;
  rejectionReason: string;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentReceiptSchema = new Schema<IPaymentReceipt>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subscription: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
    },
    planId: { type: String, required: true },
    amount: { type: Number, required: true },
    imageUrl: { type: String, required: true },
    imageKey: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

paymentReceiptSchema.index({ status: 1 });
paymentReceiptSchema.index({ user: 1 });

export const PaymentReceipt = mongoose.model<IPaymentReceipt>(
  "PaymentReceipt",
  paymentReceiptSchema,
);
