import "server-only";

import { cloudinary } from "@/lib/cloudinary";
import {
  shouldTransformMedia,
  type MediaTransformMode,
  type PlatformMediaType,
  type PublishingPlatform,
} from "@/lib/platform-rules";

type MediaDeliveryInput = {
  platform: PublishingPlatform;
  publicId: string;
  originalUrl: string;
  mediaType: PlatformMediaType;
  mimeType: string;
  fileSize: number;
  transformMode: MediaTransformMode;
};

function ensureCloudinaryUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com") {
    throw new Error("تعذّر إنشاء رابط مشتق آمن من Cloudinary.");
  }
  return url;
}

export function getPlatformMediaUrl(input: MediaDeliveryInput) {
  if (!shouldTransformMedia(input.platform, input.mediaType, input.mimeType, input.fileSize)) {
    return ensureCloudinaryUrl(input.originalUrl);
  }

  const cropMode = input.transformMode === "CROP" ? "fill" : "pad";
  let options: Parameters<typeof cloudinary.url>[1];
  if (input.mediaType === "image") {
    if (input.platform === "instagram") {
      options = {
        secure: true,
        resource_type: "image",
        format: "jpg",
        transformation: [{
          width: 1440,
          height: 1800,
          crop: cropMode,
          ...(input.transformMode === "CROP" ? { gravity: "center" } : { background: "#ffffff" }),
          quality: "auto:eco",
        }],
      };
    } else if (input.platform === "snapchat") {
      options = {
        secure: true,
        resource_type: "image",
        format: "jpg",
        transformation: [{
          width: 1080,
          height: 1920,
          crop: cropMode,
          ...(input.transformMode === "CROP" ? { gravity: "center" } : { background: "#ffffff" }),
          quality: "auto:eco",
        }],
      };
    } else {
      options = {
        secure: true,
        resource_type: "image",
        format: "jpg",
        transformation: [{
          width: 2048,
          height: 2048,
          crop: "limit",
          quality: "auto:eco",
        }],
      };
    }
  } else {
    options = {
      secure: true,
      resource_type: "video",
      format: "mp4",
      transformation: [{
        width: 1080,
        height: 1920,
        aspect_ratio: "9:16",
        crop: cropMode,
        ...(input.transformMode === "CROP" ? { gravity: "center" } : { background: "#000000" }),
        video_codec: "h264",
        audio_codec: "aac",
        quality: "auto:good",
      }],
    };
  }

  return ensureCloudinaryUrl(cloudinary.url(input.publicId, options));
}

export async function verifyPlatformMediaDerivative(input: MediaDeliveryInput, mediaUrl: string) {
  if (input.platform !== "instagram" ||
    !shouldTransformMedia(input.platform, input.mediaType, input.mimeType, input.fileSize)) {
    return;
  }

  let response: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(mediaUrl, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    if ((response.status !== 420 && response.status !== 423) || attempt === 3) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
  }

  if (!response?.ok) {
    throw new Error(`تعذّر تجهيز مشتق Instagram من Cloudinary (HTTP ${response?.status ?? "unknown"}).`);
  }
  const expectedContentType = input.mediaType === "image" ? "image/jpeg" : "video/mp4";
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== expectedContentType) {
    throw new Error(`صيغة مشتق Instagram غير متوقعة؛ المطلوب ${expectedContentType}.`);
  }

  const contentLength = response.headers.get("content-length");
  const bytes = contentLength === null ? null : Number(contentLength);
  if (bytes !== null && (!Number.isSafeInteger(bytes) || bytes <= 0)) {
    throw new Error("تعذّر التحقق من حجم مشتق Instagram من Cloudinary.");
  }
  if (input.mediaType === "image" && bytes === null) {
    throw new Error("تعذّر التحقق من حجم صورة Instagram المشتقة.");
  }
  if (bytes !== null && input.mediaType === "image" && bytes > 8_000_000) {
    throw new Error("صورة Instagram المشتقة تتجاوز حد 8 MB؛ اختاري الملف أو التحويل بجودة أقل.");
  }
  if (bytes !== null && input.mediaType === "video" && bytes > 300_000_000) {
    throw new Error("فيديو Instagram المشتق يتجاوز حد 300 MB.");
  }
}
