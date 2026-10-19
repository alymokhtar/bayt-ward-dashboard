"use client";

import { cleanupFailedUpload } from "@/app/actions/cleanup-upload";
import { getMediaUploadPolicy } from "@/lib/media-upload-policy";

type SignatureResponse = {
  apiKey: string;
  cloudName: string;
  mediaType: "image" | "video";
  maxBytes: number;
  uploadUrl: string;
  params: {
    allowed_formats: string;
    overwrite: boolean;
    public_id: string;
    tags: string;
    timestamp: number;
    signature: string;
  };
};

type CloudinaryUploadResponse = {
  public_id?: unknown;
  resource_type?: unknown;
  bytes?: unknown;
  secure_url?: unknown;
  error?: { message?: unknown };
};

export type ConfirmedMediaUpload = {
  mediaUrl: string;
  publicId: string;
  mediaType: "image" | "video";
};

async function responseError(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);
  return body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : fallback;
}

function uploadToCloudinary(
  file: File,
  signature: SignatureResponse,
  onProgress: (progress: number) => void,
): Promise<{ publicId: string; secureUrl: string }> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.set("file", file);
    formData.set("api_key", signature.apiKey);
    for (const [key, value] of Object.entries(signature.params)) {
      formData.set(key, String(value));
    }

    const request = new XMLHttpRequest();
    request.open("POST", signature.uploadUrl);
    request.timeout = 15 * 60 * 1000;
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    });
    request.addEventListener("load", () => {
      let result: CloudinaryUploadResponse;
      try {
        result = JSON.parse(request.responseText) as CloudinaryUploadResponse;
      } catch {
        reject(new Error("أعاد Cloudinary استجابة رفع غير صالحة."));
        return;
      }

      if (request.status < 200 || request.status >= 300 ||
        typeof result.public_id !== "string" ||
        result.resource_type !== signature.mediaType ||
        typeof result.bytes !== "number" ||
        typeof result.secure_url !== "string" ||
        !result.secure_url.startsWith("https://res.cloudinary.com/")) {
        reject(new Error(
          typeof result.error?.message === "string"
            ? `تعذّر رفع الملف إلى Cloudinary: ${result.error.message}`
            : `تعذّر رفع الملف إلى Cloudinary (HTTP ${request.status}).`,
        ));
        return;
      }
      onProgress(100);
      resolve({ publicId: result.public_id, secureUrl: result.secure_url });
    });
    request.addEventListener("error", () => reject(new Error("انقطع الاتصال أثناء رفع الملف إلى Cloudinary.")));
    request.addEventListener("timeout", () => reject(new Error("انتهت مهلة رفع الملف إلى Cloudinary.")));
    request.addEventListener("abort", () => reject(new Error("أُلغي رفع الملف.")));
    request.send(formData);
  });
}

export async function uploadMediaDirectly(
  file: File,
  platforms: string[],
  onProgress: (progress: number) => void,
): Promise<ConfirmedMediaUpload> {
  const policy = getMediaUploadPolicy(file.type, platforms);
  if (!policy || file.size <= 0 || file.size > policy.maxBytes) {
    throw new Error(
      policy?.mediaType === "video"
        ? "حجم الفيديو يتجاوز الحد المسموح للمنصات المختارة."
        : "نوع الصورة أو حجمها غير مدعوم.",
    );
  }

  const signatureResponse = await fetch("/api/media/upload-signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      mimeType: file.type,
      fileSize: file.size,
      platforms,
    }),
  });
  if (!signatureResponse.ok) {
    throw new Error(await responseError(signatureResponse, "تعذّر تجهيز رفع الملف."));
  }
  const signature: unknown = await signatureResponse.json();
  if (!signature || typeof signature !== "object" ||
    !("params" in signature) || !signature.params || typeof signature.params !== "object" ||
    !("uploadUrl" in signature) || typeof signature.uploadUrl !== "string" ||
    !("apiKey" in signature) || typeof signature.apiKey !== "string" ||
    !("cloudName" in signature) || typeof signature.cloudName !== "string" ||
    !("mediaType" in signature) || (signature.mediaType !== "image" && signature.mediaType !== "video") ||
    !("maxBytes" in signature) || typeof signature.maxBytes !== "number" ||
    !("signature" in signature.params) || typeof signature.params.signature !== "string" ||
    !("public_id" in signature.params) || typeof signature.params.public_id !== "string" ||
    !("allowed_formats" in signature.params) || typeof signature.params.allowed_formats !== "string" ||
    !("overwrite" in signature.params) || typeof signature.params.overwrite !== "boolean" ||
    !("tags" in signature.params) || typeof signature.params.tags !== "string" ||
    !("timestamp" in signature.params) || typeof signature.params.timestamp !== "number" ||
    signature.params.public_id.length === 0 || signature.maxBytes < file.size ||
    signature.mediaType !== policy.mediaType) {
    throw new Error("أعاد الخادم تصريح رفع غير صالح.");
  }

  const uploadData = await uploadToCloudinary(file, signature as SignatureResponse, onProgress);
  if (uploadData.publicId !== signature.params.public_id) {
    throw new Error("معرّف الملف المرفوع لا يطابق تصريح الخادم.");
  }

  try {
    const confirmResponse = await fetch("/api/media/confirm-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        publicId: uploadData.publicId,
        mimeType: file.type,
        fileSize: file.size,
        platforms,
      }),
    });
    if (!confirmResponse.ok) {
      throw new Error(await responseError(confirmResponse, "تعذّر التحقق من الملف المرفوع."));
    }

    const confirmed: unknown = await confirmResponse.json();
    if (!confirmed || typeof confirmed !== "object" ||
      !("success" in confirmed) || confirmed.success !== true ||
      !("publicId" in confirmed) || confirmed.publicId !== uploadData.publicId ||
      !("mediaType" in confirmed) || confirmed.mediaType !== policy.mediaType ||
      !("mediaUrl" in confirmed) || typeof confirmed.mediaUrl !== "string") {
      throw new Error("لم يؤكد الخادم بيانات الملف المرفوع.");
    }
    return confirmed as ConfirmedMediaUpload;
  } catch (confirmError) {
    const cleanedUp = await cleanupFailedUpload(uploadData.publicId, uploadData.secureUrl);
    const errorMessage = confirmError instanceof Error
      ? confirmError.message
      : "تعذّر التحقق من الملف المرفوع.";
    throw new Error(cleanedUp
      ? errorMessage
      : `${errorMessage} تعذّر تنظيف الملف من Cloudinary.`);
  }
}
