import { Request, Response } from "express";
import mongoose from "mongoose";
import { CompanionProfile } from "../models/CompanionProfile";
import { Subscription } from "../models/Subscription";
import { uploadToB2, deleteFromB2 } from "../services/b2Service";
import { createError } from "../middleware/errorHandler";

// ── Get My Profile (creator) ──────────────────────────────────────────────────
export const getMyProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const user = req.user!;
  const profile = await CompanionProfile.findOne({ createdBy: user._id });
  res.json({ success: true, data: { profile: profile ?? null } });
};

// ── Create My Profile (creator) ───────────────────────────────────────────────
export const createMyProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const user = req.user!;

  // One profile per creator
  const existing = await CompanionProfile.findOne({ createdBy: user._id });
  if (existing) {
    res.json({ success: true, data: { profile: existing } });
    return;
  }

  const profileImageFile = (req.files as Record<string, Express.Multer.File[]>)
    ?.profileImage?.[0];
  if (!profileImageFile) throw createError("Profile image is required.", 400);

  const { url: profileImage, key: profileImageKey } = await uploadToB2(
    profileImageFile.buffer,
    profileImageFile.mimetype,
    "profiles",
  );

  const {
    displayName,
    age,
    location,
    shortBio,
    fullBio,
    interests,
    availability,
  } = req.body;

  const profile = await CompanionProfile.create({
    createdBy: user._id,
    displayName,
    age: parseInt(age, 10),
    location,
    shortBio,
    fullBio: fullBio ?? "",
    interests: interests
      ? interests
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [],
    availability: availability ?? "Weekdays & Weekends",
    whatsappNumber: req.body.whatsappNumber ?? user.whatsappNumber,
    profileImage,
    profileImageKey,
    isEnabled: true, // auto-approved on creation
    profileCompleteness: calculateCompleteness({
      fullBio: fullBio ?? "",
      interests: interests
        ? interests
            .split(",")
            .map((s: string) => s.trim())
            .filter(Boolean)
        : [],
    }),
  });

  res.status(201).json({ success: true, data: { profile } });
};

// Helper function to calculate profile completeness
function calculateCompleteness(data: {
  fullBio: string;
  interests: string[];
}): number {
  let score = 40; // base (profile image + basic info)
  if (data.fullBio && data.fullBio.length > 50) score += 20;
  if (data.interests && data.interests.length > 2) score += 15;
  // Gallery will add +15, cover will add +10 later
  return Math.min(100, score);
}

// ── Upload Gallery (creator - own profile) ────────────────────────────────────
export const uploadMyGallery = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const user = req.user!;
  const profile = await CompanionProfile.findOne({ createdBy: user._id });
  if (!profile) throw createError("Profile not found.", 404);

  const files = req.files as Express.Multer.File[];
  if (!files?.length) throw createError("No files provided.", 400);

  const uploadedItems = await Promise.all(
    files.map(async (file, idx) => {
      const isVideo = file.mimetype.startsWith("video/");
      const { url, key } = await uploadToB2(
        file.buffer,
        file.mimetype,
        isVideo ? "videos" : "gallery",
      );
      return {
        url,
        key,
        type: (isVideo ? "video" : "image") as "image" | "video",
        order: profile.gallery.length + idx,
      };
    }),
  );

  profile.gallery.push(...uploadedItems);
  profile.profileCompleteness = Math.min(
    100,
    profile.profileCompleteness + Math.min(uploadedItems.length * 5, 30),
  );
  await profile.save();

  res.json({ success: true, data: { gallery: profile.gallery } });
};

// ── Get All Profiles (public) ─────────────────────────────────────────────────
export const getProfiles = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const {
    page = 1,
    limit = 12,
    search,
    location,
    minAge,
    maxAge,
    sort = "createdAt",
  } = req.query;

  const filter: mongoose.FilterQuery<typeof CompanionProfile> = {
    isActive: true,
    isEnabled: true,
  };

  if (search) {
    filter.$text = { $search: search as string };
  }
  if (location) {
    filter.location = { $regex: location as string, $options: "i" };
  }
  if (minAge || maxAge) {
    filter.age = {};
    if (minAge) filter.age.$gte = parseInt(minAge as string);
    if (maxAge) filter.age.$lte = parseInt(maxAge as string);
  }

  const sortMap: Record<string, Record<string, number>> = {
    createdAt: { createdAt: -1 },
    popular: { viewCount: -1 },
    age_asc: { age: 1 },
    age_desc: { age: -1 },
  };

  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit as string)));
  const skip = (pageNum - 1) * limitNum;

  const [profiles, total] = await Promise.all([
    CompanionProfile.find(filter)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((sortMap[sort as string] ?? { createdAt: -1 }) as any)
      .skip(skip)
      .limit(limitNum)
      .select("-whatsappNumber -profileImageKey -coverImageKey -gallery.key"),
    CompanionProfile.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      profiles,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    },
  });
};

// ── Get Single Profile ────────────────────────────────────────────────────────
export const getProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError("Invalid profile ID.", 400);
  }

  const profile = await CompanionProfile.findOne({
    _id: id,
    isActive: true,
    isEnabled: true,
  });
  if (!profile) throw createError("Profile not found.", 404);

  // Increment view count
  await CompanionProfile.findByIdAndUpdate(id, { $inc: { viewCount: 1 } });

  // Check if user has access to contact info
  let hasContact = false;
  if (req.user) {
    const sub = await Subscription.findOne({
      user: req.user._id,
      status: "active",
      endDate: { $gt: new Date() },
    });

    if (sub) {
      if (sub.profileLimit === -1) {
        // Plan 2 - unlimited
        hasContact = true;
      } else {
        // Plan 1 - check if this profile is already unlocked
        const profileIdStr = id.toString();
        const alreadyUnlocked = sub.profilesUnlocked.some(
          (pid) => pid.toString() === profileIdStr,
        );

        if (alreadyUnlocked) {
          hasContact = true;
        } else if (sub.profilesUnlocked.length < sub.profileLimit) {
          // Auto-unlock this profile
          sub.profilesUnlocked.push(new mongoose.Types.ObjectId(id));
          await sub.save();
          hasContact = true;
        }
      }
    }
  }

  const profileObj = profile.toJSON({ includeContact: hasContact } as object);
  res.json({ success: true, data: { profile: profileObj, hasContact } });
};

// ── Create Profile (admin) ────────────────────────────────────────────────────
export const createProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const {
    displayName,
    age,
    location,
    shortBio,
    fullBio,
    interests,
    availability,
    whatsappNumber,
    socialLinks,
  } = req.body;

  const files = req.files as Record<string, Express.Multer.File[]>;
  const profileImageFile = files?.profileImage?.[0];

  if (!profileImageFile) throw createError("Profile image is required.", 400);

  const { url: profileImage, key: profileImageKey } = await uploadToB2(
    profileImageFile.buffer,
    profileImageFile.mimetype,
    "profiles",
  );

  let coverImage = "";
  let coverImageKey = "";
  if (files?.coverImage?.[0]) {
    const result = await uploadToB2(
      files.coverImage[0].buffer,
      files.coverImage[0].mimetype,
      "covers",
    );
    coverImage = result.url;
    coverImageKey = result.key;
  }

  const parsedInterests =
    typeof interests === "string"
      ? interests
          .split(",")
          .map((i: string) => i.trim())
          .filter(Boolean)
      : (interests ?? []);

  const profile = await CompanionProfile.create({
    displayName,
    age: parseInt(age),
    location,
    shortBio,
    fullBio,
    interests: parsedInterests,
    availability,
    whatsappNumber,
    profileImage,
    profileImageKey,
    coverImage,
    coverImageKey,
    socialLinks:
      typeof socialLinks === "string"
        ? JSON.parse(socialLinks)
        : (socialLinks ?? {}),
  });

  res.status(201).json({ success: true, data: { profile } });
};

// ── Update Profile (admin) ────────────────────────────────────────────────────
export const updateProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    throw createError("Invalid profile ID.", 400);

  const profile = await CompanionProfile.findById(id);
  if (!profile) throw createError("Profile not found.", 404);

  const {
    displayName,
    age,
    location,
    shortBio,
    fullBio,
    interests,
    availability,
    whatsappNumber,
    socialLinks,
    isActive,
    isEnabled,
    isVerified,
  } = req.body;

  const files = req.files as Record<string, Express.Multer.File[]>;

  if (files?.profileImage?.[0]) {
    // Delete old image
    if (profile.profileImageKey)
      await deleteFromB2(profile.profileImageKey).catch(() => {});
    const { url, key } = await uploadToB2(
      files.profileImage[0].buffer,
      files.profileImage[0].mimetype,
      "profiles",
    );
    profile.profileImage = url;
    profile.profileImageKey = key;
  }

  if (files?.coverImage?.[0]) {
    if (profile.coverImageKey)
      await deleteFromB2(profile.coverImageKey).catch(() => {});
    const { url, key } = await uploadToB2(
      files.coverImage[0].buffer,
      files.coverImage[0].mimetype,
      "covers",
    );
    profile.coverImage = url;
    profile.coverImageKey = key;
  }

  if (displayName !== undefined) profile.displayName = displayName;
  if (age !== undefined) profile.age = parseInt(age);
  if (location !== undefined) profile.location = location;
  if (shortBio !== undefined) profile.shortBio = shortBio;
  if (fullBio !== undefined) profile.fullBio = fullBio;
  if (availability !== undefined) profile.availability = availability;
  if (whatsappNumber !== undefined) profile.whatsappNumber = whatsappNumber;
  if (isActive !== undefined)
    profile.isActive = isActive === "true" || isActive === true;
  if (isEnabled !== undefined)
    profile.isEnabled = isEnabled === "true" || isEnabled === true;
  if (isVerified !== undefined)
    profile.isVerified = isVerified === "true" || isVerified === true;
  if (interests !== undefined) {
    profile.interests =
      typeof interests === "string"
        ? interests
            .split(",")
            .map((i: string) => i.trim())
            .filter(Boolean)
        : interests;
  }
  if (socialLinks !== undefined) {
    profile.socialLinks =
      typeof socialLinks === "string" ? JSON.parse(socialLinks) : socialLinks;
  }

  await profile.save();
  res.json({ success: true, data: { profile } });
};

// ── Delete Profile (admin) ────────────────────────────────────────────────────
export const deleteProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    throw createError("Invalid profile ID.", 400);

  const profile = await CompanionProfile.findById(id);
  if (!profile) throw createError("Profile not found.", 404);

  // Delete media from B2
  const keysToDelete = [
    profile.profileImageKey,
    profile.coverImageKey,
    ...profile.gallery.map((g) => g.key),
  ].filter(Boolean);

  await Promise.allSettled(
    keysToDelete.filter((k): k is string => !!k).map((k) => deleteFromB2(k)),
  );

  await profile.deleteOne();
  res.json({ success: true, message: "Profile deleted." });
};

// ── Upload Gallery Media (admin) ──────────────────────────────────────────────
export const uploadGalleryMedia = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    throw createError("Invalid profile ID.", 400);

  const profile = await CompanionProfile.findById(id);
  if (!profile) throw createError("Profile not found.", 404);

  const files = req.files as Express.Multer.File[];
  if (!files?.length) throw createError("No files provided.", 400);

  const uploadedItems = await Promise.all(
    files.map(async (file, idx) => {
      const isVideo = file.mimetype.startsWith("video/");
      const { url, key } = await uploadToB2(
        file.buffer,
        file.mimetype,
        isVideo ? "videos" : "gallery",
      );
      return {
        url,
        key,
        type: (isVideo ? "video" : "image") as "image" | "video",
        order: profile.gallery.length + idx,
      };
    }),
  );

  profile.gallery.push(...uploadedItems);
  await profile.save();

  res.json({ success: true, data: { gallery: profile.gallery } });
};

// ── Delete Gallery Item (admin) ───────────────────────────────────────────────
export const deleteGalleryItem = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { id, itemId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id))
    throw createError("Invalid profile ID.", 400);

  const profile = await CompanionProfile.findById(id);
  if (!profile) throw createError("Profile not found.", 404);

  const item = profile.gallery.find(
    (g) => (g as any)._id?.toString() === itemId,
  );
  if (!item) throw createError("Gallery item not found.", 404);

  await deleteFromB2(item.key).catch(() => {});
  profile.gallery = profile.gallery.filter(
    (g) => (g as any)._id?.toString() !== itemId,
  ) as typeof profile.gallery;
  await profile.save();

  res.json({ success: true, message: "Gallery item removed." });
};
