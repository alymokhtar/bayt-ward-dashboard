import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { cloudinary } from "@/lib/cloudinary";
import { getMediaUploadPolicy, validatePlatformMedia, type SnapchatContentType } from "@/lib/platform-rules";

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

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return jsonError("يلزم تسجيل الدخول.", 401);
  if (!originIsValid(request)) return jsonError("مصدر الطلب غير مسموح.", 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("بيانات الرفع غير صالحة.", 400);
  }
  if (!body || typeof body !== "object") return jsonError("بيانات الرفع غير صالحة.", 400);

  const input = body as Record<string, unknown>;
  const mimeType = input.mimeType;
  const fileSize = input.fileSize;
  const platforms = input.platforms;
  const snapchatContentType = input.snapchatContentType;
  if (typeof mimeType !== "string" || !Number.isSafeInteger(fileSize) ||
    typeof fileSize !== "number" || !Array.isArray(platforms) ||
    platforms.length === 0 || platforms.length > ALLOWED_PLATFORMS.size ||
    !platforms.every((platform) => typeof platform === "string" && ALLOWED_PLATFORMS.has(platform)) ||
    (snapchatContentType !== undefined && snapchatContentType !== "STORY" && snapchatContentType !== "SPOTLIGHT")) {
    return jsonError("تحققي من نوع الملف وحجمه والمنصات المختارة.", 400);
  }

  const policy = getMediaUploadPolicy(
    mimeType,
    platforms as string[],
    snapchatContentType as SnapchatContentType | undefined,
  );
  if (!policy || fileSize <= 0 || fileSize > policy.maxBytes) {
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

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return jsonError("إعدادات Cloudinary غير مكتملة على الخادم.", 503);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${UPLOAD_FOLDER}/${randomUUID()}`;
  const params = {
    allowed_formats: policy.allowedFormats,
    overwrite: false,
    public_id: publicId,
    tags: "temporary",
    timestamp,
  };

  try {
    const signature = cloudinary.utils.api_sign_request(params, apiSecret);
    return NextResponse.json({
      apiKey,
      cloudName,
      maxBytes: policy.maxBytes,
      mediaType: policy.mediaType,
      params: { ...params, signature },
      uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${policy.mediaType}/upload`,
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("تعذّر إنشاء تصريح الرفع الآمن.", 503);
  }
}
