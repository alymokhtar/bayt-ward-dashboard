"use server";

import { cloudinary } from "@/lib/cloudinary";

export async function cleanupFailedUpload(publicId: string, mediaUrl: string): Promise<boolean> {
  if (typeof publicId !== "string" || !publicId.startsWith("bayt-ward-dashboard/")) {
    return false;
  }

  try {
    const resourceType = mediaUrl.includes("/video/upload/") ? "video" : "image";
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    });
    return result.result === "ok" || result.result === "not found";
  } catch {
    return false;
  }
}
