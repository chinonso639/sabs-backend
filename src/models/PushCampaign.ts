import mongoose, { Document, Schema } from "mongoose";

export type PushAudience = "all" | "creators" | "members";
export type PushCampaignStatus = "sending" | "sent" | "partial" | "failed";

export interface IPushCampaign extends Document {
  title: string;
  message: string;
  url: string;
  audience: PushAudience;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  status: PushCampaignStatus;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const pushCampaignSchema = new Schema<IPushCampaign>(
  {
    title: { type: String, required: true, maxlength: 80 },
    message: { type: String, required: true, maxlength: 240 },
    url: { type: String, required: true, maxlength: 500 },
    audience: {
      type: String,
      enum: ["all", "creators", "members"],
      required: true,
    },
    recipientCount: { type: Number, required: true, min: 0 },
    sentCount: { type: Number, default: 0, min: 0 },
    failedCount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["sending", "sent", "partial", "failed"],
      default: "sending",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
  },
  { timestamps: true },
);

export const PushCampaign = mongoose.model<IPushCampaign>(
  "PushCampaign",
  pushCampaignSchema,
);
