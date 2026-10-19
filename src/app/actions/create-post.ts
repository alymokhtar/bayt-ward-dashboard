"use server";

import { cloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { mimeTypeFromCloudinaryResource, validatePlatformMedia } from "@/lib/platform-rules";
import { isTikTokPrivacyLevel } from "@/lib/tiktok-privacy";

const ALLOWED_PLATFORMS = new Set(["facebook", "instagram", "tiktok", "youtube", "snapchat"]);

export type CreatePostInput = {
  caption: string;
  mediaUrl: string;
  cloudinaryPublicId: string;
  mediaType: "image" | "video";
  platforms: string[];
  tiktokPrivacyLevel?: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";
  youtubeTitle?: string;
  youtubeDescription?: string;
  youtubeTags?: string[];
  youtubePrivacyStatus?: "public" | "unlisted";
  snapchatContentType?: "STORY" | "SPOTLIGHT";
  snapchatStoryTtl?: "ONE_DAY" | "TWO_DAYS" | "THREE_DAYS" | "ONE_WEEK";
  snapchatDescription?: string;
  snapchatLink?: string;
};

export type SavedPost = {
  id: string;
  caption: string;
  mediaUrl: string;
  cloudinaryPublicId: string;
  platforms: string[];
  mediaType: "image" | "video";
  status: "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "UNKNOWN";
  facebookStatus: "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "UNKNOWN" | null;
  instagramStatus: "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "UNKNOWN" | null;
  tiktokStatus: "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "UNKNOWN" | null;
  youtubeStatus: "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "UNKNOWN" | null;
  snapchatStatus: "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "UNKNOWN" | null;
  snapchatContentType: "STORY" | "SPOTLIGHT";
  snapchatStoryTtl: "ONE_DAY" | "TWO_DAYS" | "THREE_DAYS" | "ONE_WEEK";
  snapchatDescription: string;
  snapchatLink: string;
  snapchatMediaId: string | null;
  snapchatRequestId: string | null;
  snapchatStoryId: string | null;
  snapchatSpotlightId: string | null;
  snapchatError: string | null;
  youtubeTitle: string;
  youtubeDescription: string;
  youtubeTags: string[];
  youtubePrivacyStatus: "public" | "unlisted";
  youtubeVideoId: string | null;
  youtubeVideoUrl: string | null;
  youtubeError: string | null;
  tiktokPublishId: string | null;
  tiktokVideoId: string | null;
  tiktokVideoUrl: string | null;
  tiktokError: string | null;
  tiktokPrivacyLevel: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";
  facebookError: string | null;
  instagramError: string | null;
  createdAt: string;
};

export type CreatePostResult =
  | { success: true; post: SavedPost }
  | { success: false; error: string };

export async function createPost(input: CreatePostInput): Promise<CreatePostResult> {
  if (!(await isAdminAuthenticated())) {
    return { success: false, error: "انتهت جلسة الدخول. سجّلي الدخول مجدداً." };
  }

  const caption = typeof input?.caption === "string" ? input.caption.trim() : "";
  const mediaUrl = typeof input?.mediaUrl === "string" ? input.mediaUrl : "";
  const cloudinaryPublicId =
    typeof input?.cloudinaryPublicId === "string" ? input.cloudinaryPublicId : "";
  const mediaType = input?.mediaType === "video" || input?.mediaType === "image"
    ? input.mediaType
    : null;
  const youtubeTitle = typeof input?.youtubeTitle === "string" ? input.youtubeTitle.trim() : "";
  const youtubeDescription = typeof input?.youtubeDescription === "string" ? input.youtubeDescription.trim() : "";
  const rawYoutubeTags: unknown = input?.youtubeTags;
  const youtubeTagsValid = rawYoutubeTags === undefined ||
    (Array.isArray(rawYoutubeTags) && rawYoutubeTags.every((tag) => typeof tag === "string"));
  const youtubeTags = Array.isArray(rawYoutubeTags)
    ? rawYoutubeTags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean)
    : [];
  const youtubeDescriptionValid = input?.youtubeDescription === undefined ||
    typeof input.youtubeDescription === "string";
  const youtubePrivacyValid = input?.youtubePrivacyStatus === undefined ||
    input.youtubePrivacyStatus === "public" || input.youtubePrivacyStatus === "unlisted";
  const youtubePrivacyStatus = input?.youtubePrivacyStatus === "public" ? "public" : "unlisted";
  const snapchatContentType = input?.snapchatContentType === "SPOTLIGHT" ? "SPOTLIGHT" : "STORY";
  const requestedSnapchatStoryTtl = input?.snapchatStoryTtl;
  const snapchatStoryTtl = requestedSnapchatStoryTtl === "TWO_DAYS" ||
    requestedSnapchatStoryTtl === "THREE_DAYS" || requestedSnapchatStoryTtl === "ONE_WEEK"
    ? requestedSnapchatStoryTtl
    : "ONE_DAY";
  const snapchatDescription = typeof input?.snapchatDescription === "string"
    ? input.snapchatDescription.trim()
    : "";
  const snapchatLink = typeof input?.snapchatLink === "string" ? input.snapchatLink.trim() : "";
  const requestedTikTokPrivacy = input?.tiktokPrivacyLevel ?? "PUBLIC_TO_EVERYONE";
  const tiktokPrivacyLevel = isTikTokPrivacyLevel(requestedTikTokPrivacy)
    ? requestedTikTokPrivacy
    : null;
  const platforms = Array.isArray(input?.platforms)
    ? [...new Set(input.platforms.filter((platform) => typeof platform === "string" && ALLOWED_PLATFORMS.has(platform)))]
    : [];

  if (!caption || caption.length > 2200) {
    return { success: false, error: "اكتب وصفاً للمنشور لا يتجاوز 2200 حرف." };
  }

  try {
    const media = new URL(mediaUrl);
    if (media.protocol !== "https:" || media.hostname !== "res.cloudinary.com") {
      return { success: false, error: "رابط الوسائط غير صالح." };
    }
  } catch {
    return { success: false, error: "رابط الوسائط غير صالح." };
  }

  if (!cloudinaryPublicId || cloudinaryPublicId.length > 512 || platforms.length === 0) {
    return { success: false, error: "اختر منصة واحدة على الأقل وتأكد من الملف المرفوع." };
  }
  if (!mediaType) {
    return { success: false, error: "نوع الوسائط غير صالح." };
  }
  if (!/^bayt-ward-dashboard\/[0-9a-f-]{36}$/i.test(cloudinaryPublicId)) {
    return { success: false, error: "معرّف الوسائط غير صالح." };
  }

  let verifiedMedia;
  try {
    verifiedMedia = await cloudinary.api.resource(cloudinaryPublicId, {
      resource_type: mediaType,
    });
  } catch {
    return { success: false, error: "لم يتم العثور على الوسائط في Cloudinary أو تعذّر التحقق منها." };
  }

  const format = typeof verifiedMedia.format === "string" ? verifiedMedia.format.toLowerCase() : "";
  const verifiedMimeType = mimeTypeFromCloudinaryResource(verifiedMedia.resource_type, format);
  if (verifiedMedia.public_id !== cloudinaryPublicId ||
    verifiedMedia.resource_type !== mediaType ||
    verifiedMedia.secure_url !== mediaUrl ||
    !verifiedMedia.secure_url.startsWith("https://res.cloudinary.com/") ||
    (verifiedMedia.folder && verifiedMedia.folder !== "bayt-ward-dashboard") ||
    typeof verifiedMedia.bytes !== "number" ||
    verifiedMedia.bytes <= 0 ||
    !verifiedMimeType) {
    return { success: false, error: "بيانات الوسائط لا تطابق الملف المرفوع أو حدود النوع والحجم." };
  }
  const mediaValidation = validatePlatformMedia({
    mimeType: verifiedMimeType,
    fileSize: verifiedMedia.bytes,
    platforms,
    width: verifiedMedia.width,
    height: verifiedMedia.height,
    durationSeconds: verifiedMedia.duration,
    snapchatContentType,
  });
  if (mediaValidation.errors.length > 0 || mediaValidation.pending.length > 0) {
    return {
      success: false,
      error: [...mediaValidation.errors, ...mediaValidation.pending].join(" "),
    };
  }

  if (platforms.includes("tiktok") && mediaType !== "video") {
    return { success: false, error: "النشر على TikTok يتطلب اختيار ملف فيديو." };
  }
  if (platforms.includes("tiktok") && !tiktokPrivacyLevel) {
    return { success: false, error: "اختاري إعداد خصوصية صالحاً لحساب TikTok." };
  }
  if (
    platforms.includes("youtube") &&
    (mediaType !== "video" || !youtubeTitle || youtubeTitle.length > 100 ||
      !youtubeDescriptionValid || youtubeDescription.length > 5000 ||
      !youtubeTagsValid || youtubeTags.join("").length > 500 || !youtubePrivacyValid)
  ) {
    return { success: false, error: "تحققي من فيديو YouTube وعنوانه ووصفه ووسومه." };
  }
  if (platforms.includes("snapchat")) {
    if (snapchatContentType === "SPOTLIGHT" && mediaType !== "video") {
      return { success: false, error: "نشر Snapchat Spotlight يتطلب فيديو." };
    }
    if (snapchatContentType === "SPOTLIGHT" &&
      (!snapchatDescription || snapchatDescription.length > 160)) {
      return { success: false, error: "وصف Snapchat Spotlight يجب ألا يتجاوز 160 حرفاً." };
    }
    if (snapchatLink) {
      try {
        const url = new URL(snapchatLink);
        if ((url.protocol !== "https:" && url.protocol !== "http:") || snapchatLink.length > 2048) {
          return { success: false, error: "رابط Snapchat يجب أن يكون رابط HTTP أو HTTPS صالحاً." };
        }
      } catch {
        return { success: false, error: "رابط Snapchat يجب أن يكون رابط HTTP أو HTTPS صالحاً." };
      }
    }
  }

  try {
    const post = await prisma.post.create({
      data: {
        caption,
        mediaUrl,
        cloudinaryPublicId,
        platforms,
        mediaType,
        ...(platforms.includes("facebook") ? { facebookStatus: "PENDING" as const } : {}),
        ...(platforms.includes("instagram") ? { instagramStatus: "PENDING" as const } : {}),
        ...(platforms.includes("tiktok")
          ? {
              tiktokStatus: "PENDING" as const,
              tiktokPrivacyLevel: tiktokPrivacyLevel ?? "PUBLIC_TO_EVERYONE",
            }
          : {}),
        ...(platforms.includes("youtube")
          ? {
              youtubeStatus: "PENDING" as const,
              youtubeTitle,
              youtubeDescription,
              youtubeTags,
              youtubePrivacyStatus,
            }
          : {}),
        ...(platforms.includes("snapchat")
          ? {
              snapchatStatus: "PENDING" as const,
              snapchatContentType,
              snapchatStoryTtl,
              snapchatDescription,
              snapchatLink,
            }
          : {}),
      },
    });

    return {
      success: true,
      post: {
        id: post.id,
        caption: post.caption,
        mediaUrl: post.mediaUrl,
        cloudinaryPublicId: post.cloudinaryPublicId,
        platforms,
        mediaType,
        status: post.status,
        facebookStatus: post.facebookStatus,
        instagramStatus: post.instagramStatus,
        tiktokStatus: post.tiktokStatus,
        youtubeStatus: post.youtubeStatus,
        snapchatStatus: post.snapchatStatus,
        snapchatContentType: post.snapchatContentType === "SPOTLIGHT" ? "SPOTLIGHT" : "STORY",
        snapchatStoryTtl: post.snapchatStoryTtl as "ONE_DAY" | "TWO_DAYS" | "THREE_DAYS" | "ONE_WEEK",
        snapchatDescription: post.snapchatDescription,
        snapchatLink: post.snapchatLink,
        snapchatMediaId: post.snapchatMediaId,
        snapchatRequestId: post.snapchatRequestId,
        snapchatStoryId: post.snapchatStoryId,
        snapchatSpotlightId: post.snapchatSpotlightId,
        snapchatError: post.snapchatError,
        youtubeTitle: post.youtubeTitle,
        youtubeDescription: post.youtubeDescription,
        youtubeTags,
        youtubePrivacyStatus: post.youtubePrivacyStatus === "public" ? "public" : "unlisted",
        youtubeVideoId: post.youtubeVideoId,
        youtubeVideoUrl: post.youtubeVideoUrl,
        youtubeError: post.youtubeError,
        tiktokPublishId: post.tiktokPublishId,
        tiktokVideoId: post.tiktokVideoId,
        tiktokVideoUrl: post.tiktokVideoUrl,
        tiktokError: post.tiktokError,
        tiktokPrivacyLevel: isTikTokPrivacyLevel(post.tiktokPrivacyLevel)
          ? post.tiktokPrivacyLevel
          : "PUBLIC_TO_EVERYONE",
        facebookError: post.facebookError,
        instagramError: post.instagramError,
        createdAt: post.createdAt.toISOString(),
      },
    };
  } catch {
    return { success: false, error: "تعذر حفظ المنشور حالياً. يرجى المحاولة مرة أخرى." };
  }
}
