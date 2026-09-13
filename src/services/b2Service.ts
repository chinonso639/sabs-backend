import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getB2Client, getB2Bucket } from "../config/b2";
import { v4 as uuidv4 } from "uuid";

export interface UploadResult {
  url: string;
  key: string;
}

/** Backend-relative proxy URL for a B2 key.  e.g.  /api/media/profiles/xxx.webp */
export const getMediaProxyUrl = (key: string): string =>
  `https://media.sabiruns.com/${key}`;

export const uploadToB2 = async (
  buffer: Buffer,
  mimeType: string,
  folder: string,
  originalName?: string,
): Promise<UploadResult> => {
  const ext = mimeType.split("/")[1] ?? "bin";
  const key = `${folder}/${uuidv4()}.${ext}`;

  await getB2Client().send(
    new PutObjectCommand({
      Bucket: getB2Bucket(),
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: "public, max-age=31536000",
    }),
  );

  // Store a relative backend proxy URL — works regardless of bucket privacy
  const url = getMediaProxyUrl(key);
  return { url, key };
};

export const deleteFromB2 = async (key: string): Promise<void> => {
  await getB2Client().send(
    new DeleteObjectCommand({
      Bucket: getB2Bucket(),
      Key: key,
    }),
  );
};

export const getSignedB2Url = async (
  key: string,
  expiresIn = 3600,
): Promise<string> => {
  const command = new GetObjectCommand({ Bucket: getB2Bucket(), Key: key });
  return getSignedUrl(getB2Client(), command, { expiresIn });
};

export const isVideoType = (mimeType: string): boolean =>
  ["video/mp4", "video/webm", "video/quicktime"].includes(mimeType);
