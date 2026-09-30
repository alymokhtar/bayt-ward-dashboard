"use server";

import { prisma } from "@/lib/prisma";
import { cloudinary } from "@/lib/cloudinary";

export type DeletePostResult =
  | { success: true; cloudinaryCleanupPending: boolean }
  | { success: false; error: string };

export async function deletePost(postId: string): Promise<DeletePostResult> {
  if (typeof postId !== "string" || !/^[0-9a-f-]{36}$/i.test(postId)) {
    return { success: false, error: "معرّف المنشور غير صالح." };
  }

  try {
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, mediaUrl: true, cloudinaryPublicId: true },
    });

    if (!post) return { success: false, error: "المنشور غير موجود أو حُذف مسبقاً." };

    await prisma.post.delete({ where: { id: postId } });

    let cloudinaryCleanupPending = false;
    try {
      const resourceType = post.mediaUrl.includes("/video/upload/") ? "video" : "image";
      const asset = await cloudinary.uploader.destroy(post.cloudinaryPublicId, {
        resource_type: resourceType,
        invalidate: true,
      });
      cloudinaryCleanupPending = asset.result !== "ok" && asset.result !== "not found";
    } catch {
      cloudinaryCleanupPending = true;
    }

    return { success: true, cloudinaryCleanupPending };
  } catch {
    return { success: false, error: "تعذّر حذف المنشور حالياً. يرجى المحاولة مرة أخرى." };
  }
}
