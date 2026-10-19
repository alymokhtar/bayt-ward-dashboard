import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { cloudinary } from "@/lib/cloudinary";
import { getMediaUploadPolicy, mimeTypeFromCloudinaryResource, validatePlatformMedia, type SnapchatContentType } from "@/lib/platform-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_FOLDER = "bayt-ward-dashboard";
const ALLOWED_PLATFORMS = new Set(["facebook", "instagram", "tiktok", "youtube", "snapchat"]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function originIsValid(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function removeInvalidUpload(publicId: string, mediaType: "image" | "video") {
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: mediaType,
    invalidate: true,
  });
  return result.result === "ok" || result.result === "not found";
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return jsonError("يلزم تسجيل الدخول.", 401);
  if (!originIsValid(request)) return jsonError("مصدر الطلب غير مسموح.", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("بيانات تأكيد الرفع غير صالحة.", 400);
  }
  if (!body || typeof body !== "object") return jsonError("بيانات تأكيد الرفع غير صالحة.", 400);

  const input = body as Record<string, unknown>;
  const publicId = input.publicId;
  const mimeType = input.mimeType;
  const fileSize = input.fileSize;
  const platforms = input.platforms;
  const snapchatContentType = input.snapchatContentType;
  if (typeof publicId !== "string" ||
    !new RegExp(`^${UPLOAD_FOLDER}/[0-9a-f-]{36}$`, "i").test(publicId) ||
    typeof mimeType !== "string" || !Number.isSafeInteger(fileSize) ||
    typeof fileSize !== "number" || fileSize <= 0 ||
    !Array.isArray(platforms) || platforms.length === 0 ||
    platforms.length > ALLOWED_PLATFORMS.size ||
    !platforms.every((platform) => typeof platform === "string" && ALLOWED_PLATFORMS.has(platform)) ||
    (snapchatContentType !== undefined && snapchatContentType !== "STORY" && snapchatContentType !== "SPOTLIGHT")) {
    return jsonError("بيانات الملف المرفوع غير صالحة.", 400);
  }

  const policy = getMediaUploadPolicy(
    mimeType,
    platforms as string[],
    snapchatContentType as SnapchatContentType | undefined,
  );
  if (!policy) {
    const validation = validatePlatformMedia({
      mimeType,
      fileSize,
      platforms: platforms as string[],
      snapchatContentType: (snapchatContentType ?? "STORY") as SnapchatContentType,
    });
    return jsonError(
      validation.errors[0] ?? "نوع الملف لا يتوافق مع المنصات المحددة.",
      400,
    );
  }
  if (fileSize > policy.maxBytes) {
    const validation = validatePlatformMedia({
      mimeType,
      fileSize,
      platforms: platforms as string[],
      snapchatContentType: (snapchatContentType ?? "STORY") as SnapchatContentType,
    });
    try {
      const removed = await removeInvalidUpload(publicId, policy.mediaType);
      return jsonError(
        `${validation.errors[0] ?? "حجم الملف يتجاوز حد المنصات المحددة."} ${
          removed ? "تم تنظيف الملف من Cloudinary." : "تعذّر تنظيف الملف من Cloudinary."
        }`,
        422,
      );
    } catch {
      return jsonError("حجم الملف يتجاوز الحد المسموح، وتعذّر تنظيفه من Cloudinary.", 422);
    }
  }

  let resource;
  try {
    resource = await cloudinary.api.resource(publicId, {
      resource_type: policy.mediaType,
    });
  } catch {
    return jsonError("لم يتم العثور على الملف في Cloudinary أو لم يكتمل رفعه.", 422);
  }

  const format = typeof resource.format === "string" ? resource.format.toLowerCase() : "";
  const actualMimeType = mimeTypeFromCloudinaryResource(resource.resource_type, format);
  if (!actualMimeType) {
    try {
      const removed = await removeInvalidUpload(publicId, policy.mediaType);
      return jsonError(
        removed
          ? "صيغة الملف التي رُفعت إلى Cloudinary غير مدعومة. تم تنظيف الملف."
          : "صيغة الملف التي رُفعت إلى Cloudinary غير مدعومة، وتعذّر تنظيف الملف.",
        422,
      );
    } catch {
      return jsonError("صيغة الملف التي رُفعت إلى Cloudinary غير مدعومة، وتعذّر تنظيف الملف.", 422);
    }
  }
  const validUpload = resource.public_id === publicId &&
    resource.resource_type === policy.mediaType &&
    actualMimeType === mimeType &&
    typeof resource.bytes === "number" &&
    resource.bytes > 0 &&
    resource.bytes <= policy.maxBytes &&
    resource.bytes === fileSize &&
    policy.allowedFormats.includes(format) &&
    resource.secure_url.startsWith("https://res.cloudinary.com/") &&
    (!resource.folder || resource.folder === UPLOAD_FOLDER);
  if (!validUpload) {
    try {
      const removed = await removeInvalidUpload(publicId, policy.mediaType);
      return jsonError(
        removed
          ? "رفض الخادم الملف بعد التحقق من حجمه أو نوعه، وتم تنظيفه من Cloudinary."
          : "رفض الخادم الملف بعد التحقق، لكن تعذّر تنظيفه من Cloudinary.",
        422,
      );
    } catch {
      return jsonError("رفض الخادم الملف بعد التحقق، وتعذّر تنظيفه من Cloudinary.", 422);
    }
  }

  const validation = validatePlatformMedia({
      mimeType: actualMimeType,
      fileSize: resource.bytes,
      platforms: platforms as ("facebook" | "instagram" | "tiktok" | "youtube" | "snapchat")[],
      width: resource.width,
      height: resource.height,
      durationSeconds: resource.duration,
      snapchatContentType: (snapchatContentType ?? "STORY") as SnapchatContentType,
  });
  if (validation.errors.length > 0 || validation.pending.length > 0) {
      try {
        const removed = await removeInvalidUpload(publicId, policy.mediaType);
        return jsonError(
          [...validation.errors, ...validation.pending].join(" ") +
            (removed
              ? " تم تنظيف الملف من Cloudinary."
              : " وتعذّر تنظيف الملف من Cloudinary."),
          422,
        );
      } catch {
        return jsonError(
          [...validation.errors, ...validation.pending].join(" ") +
            " وتعذّر تنظيف الملف من Cloudinary.",
          422,
        );
      }
  }

  return NextResponse.json({
    success: true,
    mediaUrl: resource.secure_url,
    publicId: resource.public_id,
    mediaType: policy.mediaType,
    bytes: resource.bytes,
    format,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
