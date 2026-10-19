"use client";

import { cleanupFailedUpload } from "@/app/actions/cleanup-upload";
import { getMediaUploadPolicy, type SnapchatContentType } from "@/lib/platform-rules";

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
  done?: unknown;
  error?: { message?: unknown };
};

export type ConfirmedMediaUpload = {
  mediaUrl: string;
  publicId: string;
  mediaType: "image" | "video";
};

async function responseError(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object") return fallback;

  const error = "error" in body && typeof body.error === "string"
    ? body.error
    : fallback;
  if (!("validationDetails" in body) || !body.validationDetails ||
    typeof body.validationDetails !== "object") {
    return error;
  }

  const details = body.validationDetails as {
    errors?: unknown;
    pending?: unknown;
  };
  const reasons = [details.errors, details.pending]
    .flatMap((items) => Array.isArray(items)
      ? items.filter((item): item is string => typeof item === "string")
      : [])
    .filter((reason, index, items) =>
      !error.includes(reason) && items.indexOf(reason) === index);
  return reasons.length > 0 ? `${error} ${reasons.join(" ")}` : error;
}

function uploadChunk(
  chunk: Blob,
  signature: SignatureResponse,
  uploadId: string | null,
  start: number,
  total: number,
  onProgress: (loaded: number) => void,
): Promise<CloudinaryUploadResponse> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.set("file", chunk);
    formData.set("api_key", signature.apiKey);
    for (const [key, value] of Object.entries(signature.params)) {
      formData.set(key, String(value));
    }

    const request = new XMLHttpRequest();
    request.open("POST", signature.uploadUrl);
    request.timeout = 15 * 60 * 1000;
    if (uploadId) {
      request.setRequestHeader("X-Unique-Upload-Id", uploadId);
      request.setRequestHeader("Content-Range", `bytes ${start}-${start + chunk.size - 1}/${total}`);
    }
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded);
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

      if (request.status < 200 || request.status >= 300) {
        reject(new Error(
          typeof result.error?.message === "string"
            ? `تعذّر رفع الملف إلى Cloudinary: ${result.error.message}`
            : `تعذّر رفع الملف إلى Cloudinary (HTTP ${request.status}).`,
        ));
        return;
      }
      resolve(result);
    });
    request.addEventListener("error", () => reject(new Error("انقطع الاتصال أثناء رفع الملف إلى Cloudinary.")));
    request.addEventListener("timeout", () => reject(new Error("انتهت مهلة رفع الملف إلى Cloudinary.")));
    request.addEventListener("abort", () => reject(new Error("أُلغي رفع الملف.")));
    request.send(formData);
  });
}

async function uploadToCloudinary(
  file: File,
  signature: SignatureResponse,
  onProgress: (progress: number) => void,
) {
  const chunkSize = 20 * 1024 * 1024;
  const isChunked = file.size > chunkSize;
  const uploadId = isChunked ? crypto.randomUUID() : null;
  let result: CloudinaryUploadResponse | null = null;

  for (let start = 0; start < file.size; start += chunkSize) {
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    let currentLoaded = 0;
    const chunkResult = await uploadChunk(
      chunk,
      signature,
      uploadId,
      start,
      file.size,
      (loaded) => {
        currentLoaded = loaded;
        onProgress(Math.min(99, Math.round(((start + currentLoaded) / file.size) * 100)));
      },
    );
    if (end === file.size) result = chunkResult;
  }

  if (!result || typeof result.public_id !== "string" ||
    result.resource_type !== signature.mediaType ||
    typeof result.bytes !== "number" ||
    typeof result.secure_url !== "string" ||
    !result.secure_url.startsWith("https://res.cloudinary.com/")) {
    throw new Error("لم يُرجع Cloudinary بيانات اكتمال رفع صالحة.");
  }
  onProgress(100);
  return { publicId: result.public_id, secureUrl: result.secure_url };
}

export async function uploadMediaDirectly(
  file: File,
  platforms: string[],
  onProgress: (progress: number) => void,
  snapchatContentType: SnapchatContentType = "STORY",
): Promise<ConfirmedMediaUpload> {
  const policy = getMediaUploadPolicy(file.type, platforms, snapchatContentType, file.size);
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
      snapchatContentType,
    }),
  });
  if (!signatureResponse.ok) {
    throw new Error(await responseError(signatureResponse, "تعذّر تجهيز رفع الملف."));
  }
  const signatureResponseBody: unknown = await signatureResponse.json();
  if (!signatureResponseBody || typeof signatureResponseBody !== "object" ||
    !("params" in signatureResponseBody) || !signatureResponseBody.params ||
    typeof signatureResponseBody.params !== "object" ||
    !("uploadUrl" in signatureResponseBody) || typeof signatureResponseBody.uploadUrl !== "string" ||
    !("apiKey" in signatureResponseBody) || typeof signatureResponseBody.apiKey !== "string" ||
    !("cloudName" in signatureResponseBody) || typeof signatureResponseBody.cloudName !== "string" ||
    !("mediaType" in signatureResponseBody) ||
    (signatureResponseBody.mediaType !== "image" && signatureResponseBody.mediaType !== "video") ||
    !("maxBytes" in signatureResponseBody) || typeof signatureResponseBody.maxBytes !== "number" ||
    !("signature" in signatureResponseBody.params) || typeof signatureResponseBody.params.signature !== "string" ||
    !("public_id" in signatureResponseBody.params) || typeof signatureResponseBody.params.public_id !== "string" ||
    !("allowed_formats" in signatureResponseBody.params) || typeof signatureResponseBody.params.allowed_formats !== "string" ||
    !("overwrite" in signatureResponseBody.params) || typeof signatureResponseBody.params.overwrite !== "boolean" ||
    !("tags" in signatureResponseBody.params) || typeof signatureResponseBody.params.tags !== "string" ||
    !("timestamp" in signatureResponseBody.params) || typeof signatureResponseBody.params.timestamp !== "number" ||
    signatureResponseBody.params.public_id.length === 0 ||
    signatureResponseBody.maxBytes < file.size ||
    signatureResponseBody.mediaType !== policy.mediaType) {
    throw new Error("أعاد الخادم تصريح رفع غير صالح.");
  }
  const signature: SignatureResponse = {
    apiKey: signatureResponseBody.apiKey,
    cloudName: signatureResponseBody.cloudName,
    mediaType: signatureResponseBody.mediaType,
    maxBytes: signatureResponseBody.maxBytes,
    uploadUrl: signatureResponseBody.uploadUrl,
    params: {
      allowed_formats: signatureResponseBody.params.allowed_formats,
      overwrite: signatureResponseBody.params.overwrite,
      public_id: signatureResponseBody.params.public_id,
      tags: signatureResponseBody.params.tags,
      timestamp: signatureResponseBody.params.timestamp,
      signature: signatureResponseBody.params.signature,
    },
  };
  const uploadUrl = new URL(signature.uploadUrl);
  if (uploadUrl.origin !== "https://api.cloudinary.com" ||
    uploadUrl.pathname !== `/v1_1/${encodeURIComponent(signature.cloudName)}/${policy.mediaType}/upload`) {
    throw new Error("عنوان الرفع الذي أعاده الخادم غير صالح.");
  }

  let uploadData: { publicId: string; secureUrl: string };
  try {
    uploadData = await uploadToCloudinary(file, signature, onProgress);
  } catch (uploadError) {
    const cleanedUp = await cleanupFailedUpload(
      signature.params.public_id,
      `https://res.cloudinary.com/${signature.cloudName}/${signature.mediaType}/upload/${signature.params.public_id}`,
    );
    const errorMessage = uploadError instanceof Error
      ? uploadError.message
      : "تعذّر رفع الملف إلى Cloudinary.";
    throw new Error(cleanedUp
      ? errorMessage
      : `${errorMessage} تعذّر تنظيف أي جزء مكتمل من الرفع.`);
  }
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
        snapchatContentType,
      }),
    });
    if (!confirmResponse.ok) {
      throw new Error(await responseError(confirmResponse, "تعذّر التحقق من الملف المرفوع."));
    }

    const confirmed: unknown = await confirmResponse.json();
    if (!confirmed || typeof confirmed !== "object" ||
      !("success" in confirmed) || confirmed.success !== true ||
      !("publicId" in confirmed) || confirmed.publicId !== uploadData.publicId ||
      !("mediaType" in confirmed) ||
      (confirmed.mediaType !== "image" && confirmed.mediaType !== "video") ||
      confirmed.mediaType !== policy.mediaType ||
      !("mediaUrl" in confirmed) || typeof confirmed.mediaUrl !== "string") {
      throw new Error("لم يؤكد الخادم بيانات الملف المرفوع.");
    }
    return {
      mediaUrl: confirmed.mediaUrl,
      publicId: confirmed.publicId,
      mediaType: confirmed.mediaType,
    };
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
