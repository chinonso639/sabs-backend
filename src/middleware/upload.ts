import multer from "multer";
import { Request } from "express";
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
  MAX_RECEIPT_SIZE,
} from "../config/constants";

const storage = multer.memoryStorage();

const imageFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, and WebP images are allowed"));
  }
};

const mediaFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (
    [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES].includes(file.mimetype)
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only image (JPEG, PNG, WebP) and video (MP4, WebM, MOV) files are allowed",
      ),
    );
  }
};

export const uploadImage = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: MAX_IMAGE_SIZE },
});

export const uploadMedia = multer({
  storage,
  fileFilter: mediaFilter,
  limits: { fileSize: MAX_VIDEO_SIZE },
});

export const uploadReceipt = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: MAX_RECEIPT_SIZE },
});
