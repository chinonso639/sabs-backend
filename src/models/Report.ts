import mongoose, { Document, Schema } from "mongoose";
import { ReportReason, REPORT_REASONS } from "../config/constants";

export interface IReport extends Document {
  reporter: mongoose.Types.ObjectId;
  profile: mongoose.Types.ObjectId;
  reason: ReportReason;
  description: string;
  status: "pending" | "reviewed" | "resolved" | "dismissed";
  reviewedBy: mongoose.Types.ObjectId | null;
  reviewedAt: Date | null;
  adminNotes: string;
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<IReport>(
  {
    reporter: { type: Schema.Types.ObjectId, ref: "User", required: true },
    profile: {
      type: Schema.Types.ObjectId,
      ref: "CompanionProfile",
      required: true,
    },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    description: { type: String, maxlength: 1000, default: "" },
    status: {
      type: String,
      enum: ["pending", "reviewed", "resolved", "dismissed"],
      default: "pending",
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    reviewedAt: { type: Date, default: null },
    adminNotes: { type: String, default: "" },
  },
  { timestamps: true },
);

reportSchema.index({ status: 1 });
reportSchema.index({ profile: 1 });
reportSchema.index({ reporter: 1 });

export const Report = mongoose.model<IReport>("Report", reportSchema);
