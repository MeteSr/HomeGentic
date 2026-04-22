import { uploadJobPhoto } from "./jobService";
import { HttpAgent } from "@icp-sdk/core/agent";

const MAX_BYTES     = 10 * 1024 * 1024;  // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png"] as const;

export interface ImageAsset {
  uri:      string;
  base64:   string | null;
  mimeType: string;
  fileSize: number;
  width:    number;
  height:   number;
}

export interface PhotoPayload {
  jobId:    string;
  base64:   string;
  mimeType: string;
}

/** Pure — validates a picked image before upload; returns error string or null */
export function validateImageAsset(asset: ImageAsset): string | null {
  if (!asset.base64) return "No image data found. Please pick the photo again.";
  if (asset.fileSize > MAX_BYTES)
    return `Image too large (${formatFileSize(asset.fileSize)}). Max is 10 MB.`;
  if (!ALLOWED_TYPES.includes(asset.mimeType as typeof ALLOWED_TYPES[number]))
    return "Only JPEG or PNG images are supported.";
  return null;
}

/** Pure — builds the upload payload */
export function buildPhotoPayload(jobId: string, asset: ImageAsset): PhotoPayload {
  return {
    jobId,
    base64:   asset.base64!,
    mimeType: asset.mimeType,
  };
}

/** Pure — human-readable file size */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024)               return `${bytes} B`;
  if (bytes < 1024 * 1024)        return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Compresses, validates, and uploads a photo to the job record */
export async function uploadPhoto(
  jobId:      string,
  propertyId: string,
  asset:      ImageAsset,
  agent?:     HttpAgent,
): Promise<void> {
  const error = validateImageAsset(asset);
  if (error) throw new Error(error);
  const payload = buildPhotoPayload(jobId, asset);
  await uploadJobPhoto(jobId, propertyId, payload.base64, agent);
}
