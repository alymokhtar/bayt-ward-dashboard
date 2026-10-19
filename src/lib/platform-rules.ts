export type PublishingPlatform = "facebook" | "instagram" | "tiktok" | "youtube" | "snapchat";
export type PlatformMediaType = "image" | "video";
export type SnapchatContentType = "STORY" | "SPOTLIGHT";
export type MediaTransformMode = "FIT" | "CROP";

type MediaRule = {
  mediaType: PlatformMediaType;
  formats: readonly string[];
  maxBytes: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
};

const MIB = 1024 * 1024;
const GB = 1000 * 1000 * 1000;
const INSTAGRAM_IMAGE_MAX_BYTES = 8_000_000;
const MAX_TRANSFORMABLE_IMAGE_SOURCE_BYTES = 100 * MIB;
export const SNAPCHAT_MAX_MEDIA_BYTES = 100 * MIB;

const PLATFORM_MEDIA_RULES: Record<PublishingPlatform, readonly MediaRule[]> = {
  instagram: [
    { mediaType: "image", formats: ["image/jpeg"], maxBytes: INSTAGRAM_IMAGE_MAX_BYTES },
    {
      mediaType: "video",
      formats: ["video/mp4", "video/quicktime"],
      maxBytes: 300 * 1000 * 1000,
      minDurationSeconds: 3,
      maxDurationSeconds: 15 * 60,
    },
  ],
  snapchat: [
    { mediaType: "image", formats: ["image/jpeg", "image/png"], maxBytes: SNAPCHAT_MAX_MEDIA_BYTES },
    {
      mediaType: "video",
      formats: ["video/mp4"],
      maxBytes: SNAPCHAT_MAX_MEDIA_BYTES,
      minDurationSeconds: 5,
      maxDurationSeconds: 60,
    },
  ],
  tiktok: [
    {
      mediaType: "video",
      formats: ["video/mp4", "video/quicktime", "video/webm"],
      maxBytes: 4 * GB,
    },
  ],
  youtube: [
    {
      mediaType: "video",
      formats: ["video/mp4", "video/quicktime", "video/webm"],
      maxBytes: 256 * GB,
      maxDurationSeconds: 12 * 60 * 60,
    },
  ],
  facebook: [
    { mediaType: "image", formats: ["image/jpeg", "image/png", "image/gif"], maxBytes: 10 * MIB },
    {
      mediaType: "video",
      formats: ["video/mp4", "video/quicktime"],
      maxBytes: 10 * GB,
      maxDurationSeconds: 240 * 60,
    },
  ],
};

export const SUPPORTED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export type PlatformMediaMetadata = {
  mimeType: string;
  fileSize: number;
  platforms: readonly string[];
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  snapchatContentType?: SnapchatContentType;
  tiktokMaxDurationSeconds?: number | null;
  sourceAsset?: boolean;
};

export type PlatformValidationResult = {
  errors: string[];
  warnings: string[];
  pending: string[];
};

export function isPublishingPlatform(platform: string): platform is PublishingPlatform {
  return Object.hasOwn(PLATFORM_MEDIA_RULES, platform);
}

export function getMediaUploadPolicy(
  mimeType: string,
  platforms: readonly string[],
  snapchatContentType: SnapchatContentType = "STORY",
  fileSize?: number,
) {
  if (!SUPPORTED_UPLOAD_MIME_TYPES.includes(mimeType as (typeof SUPPORTED_UPLOAD_MIME_TYPES)[number]) ||
    platforms.length === 0 ||
    !platforms.every(isPublishingPlatform)) {
    return null;
  }

  const mediaType: PlatformMediaType = mimeType.startsWith("video/") ? "video" : "image";
  const rules = platforms.map((platform) => {
    const rule = PLATFORM_MEDIA_RULES[platform as PublishingPlatform]
      .find((candidate) => candidate.mediaType === mediaType && candidate.formats.includes(mimeType));
    const transformed = shouldTransformMedia(platform as PublishingPlatform, mediaType, mimeType, fileSize);
    if (rule && !transformed) return { rule, maxSourceBytes: rule.maxBytes };
    if (!transformed && !canTransformSource(platform as PublishingPlatform, mediaType, mimeType)) return null;
    const transformRule = rule ?? PLATFORM_MEDIA_RULES[platform as PublishingPlatform]
      .find((candidate) => candidate.mediaType === mediaType);
    if (!transformRule) return null;
    return {
      rule: transformRule,
      maxSourceBytes: mediaType === "image"
        ? MAX_TRANSFORMABLE_IMAGE_SOURCE_BYTES
        : transformRule.maxBytes,
    };
  });
  if (platforms.includes("snapchat") && snapchatContentType === "SPOTLIGHT" && mediaType !== "video") {
    return null;
  }
  if (rules.some((rule) => !rule)) return null;

  const applicableRules = rules.filter((item): item is NonNullable<typeof item> => item !== null);
  return {
    mediaType,
    allowedFormats: uploadFormatParameter(mimeType),
    maxBytes: Math.min(...applicableRules.map((item) => item.maxSourceBytes)),
    minDurationSeconds: Math.max(
      ...applicableRules.map((item) => item.rule.minDurationSeconds ?? 0),
      ...(platforms.includes("snapchat") && mediaType === "video"
        ? [snapchatContentType === "SPOTLIGHT" ? 6 : 5]
        : []),
    ),
    maxDurationSeconds: Math.min(
      ...applicableRules.map((item) => item.rule.maxDurationSeconds ?? Number.POSITIVE_INFINITY),
    ),
  };
}

export function shouldTransformMedia(
  platform: PublishingPlatform,
  mediaType: PlatformMediaType,
  mimeType: string,
  fileSize?: number,
) {
  if (platform === "instagram") {
    return mediaType === "image"
      ? ["image/jpeg", "image/png", "image/webp"].includes(mimeType)
      : ["video/mp4", "video/quicktime"].includes(mimeType);
  }
  if (platform === "snapchat") {
    return mediaType === "image"
      ? ["image/jpeg", "image/png", "image/webp"].includes(mimeType)
      : ["video/mp4", "video/quicktime"].includes(mimeType);
  }
  if (platform === "facebook" && mediaType === "image") {
    return mimeType !== "image/gif" &&
      (mimeType === "image/webp" || (fileSize != null && fileSize > 10 * MIB));
  }
  return false;
}

function canTransformSource(
  platform: PublishingPlatform,
  mediaType: PlatformMediaType,
  mimeType: string,
) {
  if (mediaType === "image") {
    return ["image/jpeg", "image/png", "image/webp"].includes(mimeType) &&
      (platform === "instagram" || platform === "snapchat" || platform === "facebook");
  }
  return platform === "snapchat" && mimeType === "video/quicktime";
}

export function uploadFormatParameter(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg,jpeg";
  if (mimeType === "video/quicktime") return "mov,qt";
  return mimeType.split("/")[1];
}

export function validatePlatformMedia(input: PlatformMediaMetadata): PlatformValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const pending: string[] = [];
  const mediaType: PlatformMediaType = input.mimeType.startsWith("video/") ? "video" : "image";

  for (const platform of input.platforms) {
    if (!isPublishingPlatform(platform)) {
      errors.push(`المنصة المحددة غير مدعومة: ${platform}.`);
      continue;
    }
    if (platform === "snapchat" &&
      input.snapchatContentType === "SPOTLIGHT" &&
      mediaType !== "video") {
      errors.push("نشر Snapchat Spotlight يتطلب فيديو بصيغة MP4.");
      continue;
    }
    let rule = PLATFORM_MEDIA_RULES[platform]?.find((candidate) =>
      candidate.mediaType === mediaType && candidate.formats.includes(input.mimeType),
    );
    const canTransform = input.sourceAsset === true &&
      (shouldTransformMedia(platform, mediaType, input.mimeType, input.fileSize) ||
        canTransformSource(platform, mediaType, input.mimeType));
    if (!rule && canTransform) {
      rule = PLATFORM_MEDIA_RULES[platform]?.find((candidate) => candidate.mediaType === mediaType);
    }
    if (!rule) {
      errors.push(platformFormatError(platform, mediaType));
      continue;
    }

    const exceedsSourceLimit = mediaType === "image"
      ? input.fileSize > MAX_TRANSFORMABLE_IMAGE_SOURCE_BYTES
      : input.fileSize > rule.maxBytes;
    if (!Number.isSafeInteger(input.fileSize) || input.fileSize <= 0 ||
      (!canTransform && input.fileSize > rule.maxBytes) ||
      (canTransform && exceedsSourceLimit)) {
      errors.push(canTransform
        ? `${platformName(platform)}: الحد الأقصى لحجم ملف المصدر القابل للتحويل هو ${mediaType === "image" ? "100 MiB" : readableSize(rule.maxBytes)}.`
        : platformSizeError(platform, mediaType, rule.maxBytes));
    }

    if (mediaType !== "video") continue;

    const minimumDuration = platform === "snapchat"
      ? input.snapchatContentType === "SPOTLIGHT" ? 6 : 5
      : rule.minDurationSeconds;
    const maximumDuration = platform === "snapchat"
      ? 60
      : platform === "tiktok" && typeof input.tiktokMaxDurationSeconds === "number"
        ? input.tiktokMaxDurationSeconds
        : rule.maxDurationSeconds;

    if (minimumDuration != null || maximumDuration != null) {
      if (input.durationSeconds == null || !Number.isFinite(input.durationSeconds)) {
        pending.push(`${platformName(platform)}: انتظري حتى تكتمل قراءة مدة الفيديو.`);
      } else {
        if (minimumDuration != null && input.durationSeconds < minimumDuration) {
          errors.push(platformDurationError(platform, minimumDuration, maximumDuration));
        }
        if (maximumDuration != null && input.durationSeconds > maximumDuration) {
          errors.push(platformDurationError(platform, minimumDuration, maximumDuration));
        }
      }
    }

    if (platform === "snapchat" && !canTransform) {
      if (input.width == null || input.height == null) {
        pending.push("Snapchat: انتظري حتى تكتمل قراءة أبعاد الفيديو.");
      } else if (!Number.isFinite(input.width) || !Number.isFinite(input.height) ||
        input.width <= 0 || input.height <= 0) {
        errors.push("تعذّر قراءة أبعاد فيديو Snapchat.");
      } else if (input.width < 540 || input.height < 960) {
        errors.push("Snapchat يتطلب دقة فيديو لا تقل عن 540×960 بكسل.");
      }
    }

    if (platform === "instagram" && !canTransform) {
      if (input.width == null || input.height == null) {
        pending.push("Instagram: انتظري حتى تكتمل قراءة أبعاد الفيديو للتحقق من نسبة Reels.");
      } else if (!Number.isFinite(input.width) || !Number.isFinite(input.height) ||
        input.width <= 0 || input.height <= 0) {
        errors.push("تعذّر قراءة أبعاد فيديو Instagram Reels.");
      } else {
        const aspectRatio = input.width / input.height;
        if (input.width > 1920) {
          errors.push("Instagram Reels لا يقبل عرض فيديو يتجاوز 1920 بكسل.");
        }
        if (aspectRatio < 0.01 || aspectRatio > 10) {
          errors.push("Instagram Reels يتطلب نسبة أبعاد بين 0.01:1 و10:1.");
        }
        if (Math.abs(aspectRatio - 9 / 16) > 0.06) {
          warnings.push("Instagram Reels: يُنصح بنسبة رأسية 9:16؛ قد تُقصّ الأبعاد الأخرى عند العرض.");
        }
      }
    }
  }

  if (mediaType === "image" && input.platforms.includes("instagram") && input.sourceAsset !== true) {
    if (input.width == null || input.height == null) {
      pending.push("Instagram: انتظري حتى تكتمل قراءة أبعاد الصورة.");
    } else if (!Number.isFinite(input.width) || !Number.isFinite(input.height) ||
      input.width <= 0 || input.height <= 0) {
      errors.push("تعذّر قراءة أبعاد صورة Instagram.");
    } else {
      const aspectRatio = input.width / input.height;
      if (aspectRatio < 4 / 5 || aspectRatio > 1.91) {
        errors.push("Instagram يتطلب أن تكون نسبة الصورة بين 4:5 و1.91:1.");
      }
    }
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], pending: [...new Set(pending)] };
}

export function mimeTypeFromCloudinaryResource(resourceType: string, format: string) {
  const normalizedFormat = format.toLowerCase();
  if (resourceType === "image") {
    if (normalizedFormat === "jpg") return "image/jpeg";
    if (["png", "gif", "webp"].includes(normalizedFormat)) return `image/${normalizedFormat}`;
  }
  if (resourceType === "video") {
    if (normalizedFormat === "mov" || normalizedFormat === "qt") return "video/quicktime";
    if (["mp4", "webm"].includes(normalizedFormat)) return `video/${normalizedFormat}`;
  }
  return null;
}

function platformName(platform: PublishingPlatform) {
  return platform[0].toUpperCase() + platform.slice(1);
}

function platformFormatError(platform: PublishingPlatform, mediaType: PlatformMediaType) {
  if (platform === "instagram" && mediaType === "image") {
    return "Instagram يتطلب صورة JPEG لا تتجاوز 8 MB (أقل من 8 MiB).";
  }
  if (platform === "snapchat") {
    return mediaType === "video"
      ? "Snapchat يتطلب فيديو بصيغة MP4."
      : "Snapchat Stories تقبل صور JPEG أو PNG.";
  }
  if (platform === "tiktok") return "TikTok يتطلب فيديو بصيغة MP4 أو MOV أو WebM.";
  if (platform === "youtube") return "YouTube يتطلب فيديو بصيغة MP4 أو MOV أو WebM.";
  if (platform === "facebook") {
    return mediaType === "video"
      ? "Facebook يتطلب فيديو بصيغة MP4 أو MOV."
      : "Facebook يدعم الصور بصيغ JPEG أو PNG أو GIF.";
  }
  return `${platformName(platform)} لا يدعم نوع الوسائط المحدد.`;
}

function platformSizeError(platform: PublishingPlatform, mediaType: PlatformMediaType, maxBytes: number) {
  if (platform === "instagram" && mediaType === "video") {
    return "Instagram Reels: الحد الأقصى لحجم الفيديو هو 300 MB.";
  }
  if (platform === "snapchat") {
    return `Snapchat: الحد الأقصى لحجم الوسائط هو ${Math.floor(maxBytes / MIB)} MiB.`;
  }
  const size = readableSize(maxBytes);
  if (platform === "instagram" && mediaType === "image") {
    return "Instagram يتطلب صورة JPEG لا تتجاوز 8 MB (أقل من 8 MiB).";
  }
  return `${platformName(platform)}: الحد الأقصى لحجم ${mediaType === "video" ? "الفيديو" : "الصورة"} هو ${size}.`;
}

function readableSize(maxBytes: number) {
  return maxBytes >= GB
    ? `${maxBytes / GB} GB`
    : maxBytes < 1024 * 1024
      ? `${Math.floor(maxBytes / 1024)} KiB`
      : `${Math.floor(maxBytes / (1024 * 1024))} MiB`;
}

function platformDurationError(
  platform: PublishingPlatform,
  minimum?: number,
  maximum?: number,
) {
  if (platform === "snapchat") {
    return `مدة فيديو Snapchat يجب أن تكون من ${minimum} إلى ${maximum} ثانية.`;
  }
  if (platform === "tiktok" && maximum != null) {
    return `مدة الفيديو تتجاوز الحد الأقصى لحساب TikTok وهو ${maximum} ثانية.`;
  }
  if (minimum != null && maximum != null) {
    return `${platformName(platform)}: مدة الفيديو يجب أن تكون من ${minimum} إلى ${maximum} ثانية.`;
  }
  if (maximum != null) {
    return `${platformName(platform)}: مدة الفيديو تتجاوز الحد الأقصى وهو ${maximum} ثانية.`;
  }
  return `${platformName(platform)}: مدة الفيديو أقصر من الحد الأدنى وهو ${minimum} ثانية.`;
}
