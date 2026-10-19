export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;

export const MEDIA_UPLOAD_FORMATS: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/gif": ["gif"],
  "video/mp4": ["mp4"],
  "video/webm": ["webm"],
  "video/quicktime": ["mov", "qt"],
};

const LARGE_VIDEO_PLATFORMS = new Set(["youtube", "tiktok", "snapchat"]);

export function getMediaUploadPolicy(mimeType: string, platforms: readonly string[]) {
  const formats = MEDIA_UPLOAD_FORMATS[mimeType];
  if (!formats) return null;

  const isVideo = mimeType.startsWith("video/");
  const largeVideoEnabled = platforms.some((platform) => LARGE_VIDEO_PLATFORMS.has(platform));

  return {
    mediaType: isVideo ? "video" as const : "image" as const,
    allowedFormats: formats,
    maxBytes: isVideo && largeVideoEnabled
      ? MAX_VIDEO_UPLOAD_BYTES
      : MAX_IMAGE_UPLOAD_BYTES,
  };
}
