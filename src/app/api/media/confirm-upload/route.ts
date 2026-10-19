import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { cloudinary } from "@/lib/cloudinary";
import { getMediaUploadPolicy, mimeTypeFromCloudinaryResource, validatePlatformMedia, type SnapchatContentType } from "@/lib/platform-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_FOLDER = "bayt-ward-dashboard";
const ALLOWED_PLATFORMS = new Set(["facebook", "instagram", "tiktok", "youtube", "snapchat"]);

type ValidationDetails = {
  errors: string[];
  pending: string[];
  warnings: string[];
  metadata?: Record<string, number | string | boolean | null>;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function jsonValidationError(message: string, status: number, details: ValidationDetails) {
  console.error("[media/confirm-upload] validation failed", details);
  return NextResponse.json(
    { error: message, validationDetails: details },
    { status, headers: { "Cache-Control": "no-store" } },
  );
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

async function jsonValidationErrorWithCleanup(
  publicId: string,
  mediaType: "image" | "video",
  message: string,
  details: ValidationDetails,
) {
  let cleanupMessage: string;
  try {
    const removed = await removeInvalidUpload(publicId, mediaType);
    cleanupMessage = removed
      ? "تم تنظيف الملف من Cloudinary."
      : "تعذّر تنظيف الملف من Cloudinary.";
  } catch (cleanupError) {
    console.error("[media/confirm-upload] failed to clean rejected upload", {
      name: cleanupError instanceof Error ? cleanupError.name : "UnknownError",
      errors: details.errors,
      pending: details.pending,
      metadata: details.metadata,
    });
    cleanupMessage = "تعذّر تنظيف الملف من Cloudinary.";
  }
  return jsonValidationError(`${message} ${cleanupMessage}`, 422, details);
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
    fileSize,
  );
  if (!policy) {
    const validation = validatePlatformMedia({
      mimeType,
      fileSize,
      platforms: platforms as string[],
      snapchatContentType: (snapchatContentType ?? "STORY") as SnapchatContentType,
      sourceAsset: true,
    });
    const errors = validation.errors.length > 0
      ? validation.errors
      : ["نوع الملف لا يتوافق مع المنصات المحددة."];
    return jsonValidationError(
      errors.join(" "),
      422,
      {
        errors,
        pending: validation.pending,
        warnings: validation.warnings,
        metadata: { mimeType, fileSize, platforms: platforms.join(",") },
      },
    );
  }
  if (fileSize > policy.maxBytes) {
    const validation = validatePlatformMedia({
      mimeType,
      fileSize,
      platforms: platforms as string[],
      snapchatContentType: (snapchatContentType ?? "STORY") as SnapchatContentType,
      sourceAsset: true,
    });
    const errors = validation.errors.length > 0
      ? validation.errors
      : ["حجم الملف يتجاوز حد المنصات المحددة."];
    return jsonValidationErrorWithCleanup(
      publicId,
      policy.mediaType,
      errors.join(" "),
      {
        errors,
        pending: validation.pending,
        warnings: validation.warnings,
        metadata: { mimeType, fileSize, maxBytes: policy.maxBytes, platforms: platforms.join(",") },
      },
    );
  }

  let resource;
  try {
    resource = await cloudinary.api.resource(publicId, {
      resource_type: policy.mediaType,
    });
  } catch (cloudinaryError) {
    console.error("[media/confirm-upload] failed to load uploaded asset metadata", {
      name: cloudinaryError instanceof Error ? cloudinaryError.name : "UnknownError",
      message: cloudinaryError instanceof Error ? cloudinaryError.message : "Unknown Cloudinary error",
      mediaType: policy.mediaType,
      platforms: platforms.join(","),
    });
    return jsonValidationError(
      "لم يتم العثور على الملف في Cloudinary أو لم يكتمل رفعه.",
      422,
      {
        errors: ["تعذّر استرجاع بيانات الوسائط من Cloudinary."],
        pending: [],
        warnings: [],
        metadata: { mediaType: policy.mediaType, platforms: platforms.join(",") },
      },
    );
  }

  const format = typeof resource.format === "string" ? resource.format.toLowerCase() : "";
  const actualMimeType = mimeTypeFromCloudinaryResource(resource.resource_type, format);
  if (!actualMimeType) {
    const reason = "صيغة الملف التي رُفعت إلى Cloudinary غير مدعومة.";
    return jsonValidationErrorWithCleanup(
      publicId,
      policy.mediaType,
      reason,
      {
        errors: [reason],
        pending: [],
        warnings: [],
        metadata: {
          resourceType: resource.resource_type,
          format,
          expectedResourceType: policy.mediaType,
          platforms: platforms.join(","),
        },
      },
    );
  }
  const failedChecks: string[] = [];
  if (resource.public_id !== publicId) failedChecks.push("Cloudinary public ID mismatch.");
  if (resource.resource_type !== policy.mediaType) failedChecks.push("Cloudinary resource type mismatch.");
  if (actualMimeType !== mimeType) failedChecks.push("Uploaded MIME type does not match the declared MIME type.");
  if (typeof resource.bytes !== "number" ||
    !Number.isSafeInteger(resource.bytes) || resource.bytes <= 0) {
    failedChecks.push("Invalid Cloudinary byte count.");
  }
  if (typeof resource.bytes === "number" && resource.bytes > policy.maxBytes) {
    failedChecks.push("Actual Cloudinary file size exceeds the selected-platform limit.");
  }
  if (!policy.allowedFormats.includes(format)) failedChecks.push("Uploaded format is not allowed by the upload policy.");
  if (!resource.secure_url.startsWith("https://res.cloudinary.com/")) {
    failedChecks.push("Uploaded asset URL is not a secure Cloudinary URL.");
  }
  if (resource.folder && resource.folder !== UPLOAD_FOLDER) {
    failedChecks.push("Uploaded asset is outside the allowed folder.");
  }
  if (failedChecks.length > 0) {
    const reason = "رفض الخادم الملف بعد التحقق من بيانات Cloudinary.";
    return jsonValidationErrorWithCleanup(
      publicId,
      policy.mediaType,
      reason,
      {
        errors: failedChecks,
        pending: [],
        warnings: [],
        metadata: {
          mimeType,
          actualMimeType,
          reportedBytes: fileSize,
          actualBytes: typeof resource.bytes === "number" ? resource.bytes : null,
          maxBytes: policy.maxBytes,
          format,
          platforms: platforms.join(","),
        },
      },
    );
  }
  if (resource.bytes !== fileSize) {
    console.warn("[media/confirm-upload] using Cloudinary's verified asset size", {
      reportedBytes: fileSize,
      actualBytes: resource.bytes,
      platforms: platforms.join(","),
    });
  }

  const validation = validatePlatformMedia({
    mimeType: actualMimeType,
    fileSize: resource.bytes,
    platforms: platforms as ("facebook" | "instagram" | "tiktok" | "youtube" | "snapchat")[],
    width: resource.width,
    height: resource.height,
    durationSeconds: resource.duration,
    snapchatContentType: (snapchatContentType ?? "STORY") as SnapchatContentType,
    sourceAsset: true,
  });
  if (validation.errors.length > 0 || validation.pending.length > 0) {
    const reasons = [...validation.errors, ...validation.pending];
    const details: ValidationDetails = {
      errors: validation.errors,
      pending: validation.pending,
      warnings: validation.warnings,
      metadata: {
        mimeType: actualMimeType,
        fileSize: resource.bytes,
        width: resource.width ?? null,
        height: resource.height ?? null,
        durationSeconds: resource.duration ?? null,
        platforms: platforms.join(","),
        snapchatContentType: snapchatContentType ?? "STORY",
      },
    };
    return jsonValidationErrorWithCleanup(
      publicId,
      policy.mediaType,
      reasons.join(" "),
      details,
    );
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
