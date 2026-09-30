"use server";

import { prisma } from "@/lib/prisma";

const ALLOWED_PLATFORMS = new Set(["facebook", "instagram", "tiktok"]);

export type CreatePostInput = {
  caption: string;
  mediaUrl: string;
  cloudinaryPublicId: string;
  platforms: string[];
};

export type SavedPost = {
  id: string;
  caption: string;
  mediaUrl: string;
  cloudinaryPublicId: string;
  platforms: string[];
  status: "PENDING" | "PUBLISHED" | "FAILED";
  createdAt: string;
};

export type CreatePostResult =
  | { success: true; post: SavedPost }
  | { success: false; error: string };

export async function createPost(input: CreatePostInput): Promise<CreatePostResult> {
  const caption = typeof input?.caption === "string" ? input.caption.trim() : "";
  const mediaUrl = typeof input?.mediaUrl === "string" ? input.mediaUrl : "";
  const cloudinaryPublicId =
    typeof input?.cloudinaryPublicId === "string" ? input.cloudinaryPublicId : "";
  const platforms = Array.isArray(input?.platforms)
    ? [...new Set(input.platforms.filter((platform) => ALLOWED_PLATFORMS.has(platform)))]
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

  try {
    const post = await prisma.post.create({
      data: {
        caption,
        mediaUrl,
        cloudinaryPublicId,
        platforms,
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
        status: post.status,
        createdAt: post.createdAt.toISOString(),
      },
    };
  } catch {
    return { success: false, error: "تعذر حفظ المنشور حالياً. يرجى المحاولة مرة أخرى." };
  }
}
