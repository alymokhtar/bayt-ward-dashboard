"use server";

import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { isTikTokPrivacyLevel } from "@/lib/tiktok";

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
  const mediaType = input?.mediaType === "video" ? "video" : "image";
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
