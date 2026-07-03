import mongoose, { Document, Schema } from "mongoose";

export interface IMediaItem {
  url: string;
  key: string; // B2 object key
  type: "image" | "video";
  thumbnail?: string;
  order: number;
}

export interface ICompanionProfile extends Document {
  createdBy: mongoose.Types.ObjectId | null; // null if admin-created
  displayName: string;
  age: number;
  location: string;
  shortBio: string;
  fullBio: string;
  interests: string[];
  availability: string;
  whatsappNumber: string;
  profileImage: string;
  profileImageKey: string;
  coverImage?: string;
  coverImageKey?: string;
  gallery: IMediaItem[];
  socialLinks: {
    instagram?: string;
    twitter?: string;
  };
  isVerified: boolean;
  isActive: boolean;
  isEnabled: boolean;
  profileCompleteness: number;
  viewCount: number;
  badges: string[];
  createdAt: Date;
  updatedAt: Date;
}

const mediaItemSchema = new Schema<IMediaItem>({
  url: { type: String, required: true },
  key: { type: String, required: true },
  type: { type: String, enum: ["image", "video"], required: true },
  thumbnail: { type: String },
  order: { type: Number, default: 0 },
});

const companionProfileSchema = new Schema<ICompanionProfile>(
  {
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    displayName: { type: String, required: true, trim: true, maxlength: 60 },
    age: { type: Number, required: true, min: 18, max: 80 },
    location: { type: String, required: true, trim: true },
    shortBio: { type: String, required: true, maxlength: 160 },
    fullBio: { type: String, maxlength: 2000, default: "" },
    interests: [{ type: String, trim: true }],
    availability: { type: String, default: "Weekdays & Weekends" },
    whatsappNumber: { type: String, required: true },
    profileImage: { type: String, required: true },
    profileImageKey: { type: String, required: true },
    coverImage: { type: String, default: "" },
    coverImageKey: { type: String, default: "" },
    gallery: [mediaItemSchema],
    socialLinks: {
      instagram: { type: String, default: "" },
      twitter: { type: String, default: "" },
    },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isEnabled: { type: Boolean, default: true },
    profileCompleteness: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    badges: [{ type: String }],
  },
  { timestamps: true },
);

// Index for search
companionProfileSchema.index({
  displayName: "text",
  shortBio: "text",
  location: "text",
});
companionProfileSchema.index({ isActive: 1, isEnabled: 1 });
companionProfileSchema.index({ location: 1 });
companionProfileSchema.index({ age: 1 });

// Strip sensitive data from public responses
companionProfileSchema.set("toJSON", {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc, ret: any, options: any) => {
    // whatsappNumber is stripped by default; controllers re-attach if user has access
    if (!options["includeContact"]) {
      ret.whatsappNumber = undefined;
    }
    ret.profileImageKey = undefined;
    ret.coverImageKey = undefined;
    if (ret.gallery) {
      ret.gallery = ret.gallery.map((item: IMediaItem) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { key: _key, ...rest } = item;
        return rest;
      });
    }
    return ret;
  },
});

export const CompanionProfile = mongoose.model<ICompanionProfile>(
  "CompanionProfile",
  companionProfileSchema,
);
