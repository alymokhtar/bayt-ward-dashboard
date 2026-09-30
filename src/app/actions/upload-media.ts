"use server";

import type { UploadApiResponse } from "cloudinary";
import { cloudinary } from "@/lib/cloudinary";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export type UploadMediaResult =
  | { success: true; mediaUrl: string; publicId: string }
  | { success: false; error: string };

export async function uploadMedia(formData: FormData): Promise<UploadMediaResult> {
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "يرجى اختيار ملف صالح للرفع." };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: "الحد الأقصى لحجم الملف هو 10 ميجابايت." };
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return { success: false, error: "نوع الملف غير مدعوم. ارفع صورة أو فيديو بصيغة مدعومة." };
  }

  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    return { success: false, error: "إعدادات Cloudinary غير مكتملة على الخادم." };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: "bayt-ward-dashboard",
            resource_type: "auto",
            overwrite: false,
            tags: ["temporary"],
          },
          (error, uploadResult) => {
            if (error) {
              reject(error);
            } else if (!uploadResult) {
              reject(new Error("Cloudinary returned no upload result."));
            } else {
              resolve(uploadResult);
            }
          },
        )
        .end(buffer);
    });

    return {
      success: true,
      mediaUrl: result.secure_url,
      publicId: result.public_id,
    };
  } catch {
    return { success: false, error: "تعذر رفع الملف حالياً. يرجى المحاولة مرة أخرى." };
  }
}
