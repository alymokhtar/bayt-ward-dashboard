import { decryptTikTokToken, encryptTikTokToken } from "@/lib/meta-token";
import { prisma } from "@/lib/prisma";
import { cloudinary } from "@/lib/cloudinary";
import { mimeTypeFromCloudinaryResource, validatePlatformMedia } from "@/lib/platform-rules";
import {
  createTikTokDirectPostPayload,
  isTikTokPrivacyLevel,
  toTikTokPrivacyLevel,
  type TikTokPrivacyLevel,
} from "@/lib/tiktok-privacy";

const TIKTOK_API = "https://open.tiktokapis.com";
const SINGLE_CHUNK_MAX_SIZE = 64 * 1024 * 1024;
type TikTokError = {
  code?: string;
  message?: string;
  log_id?: string;
};

type TikTokEnvelope<T> = {
  data?: T;
  error?: TikTokError;
};

export class TikTokPublishError extends Error {
  constructor(
    message: string,
    readonly outcomeUnknown: boolean,
    readonly publishId?: string,
  ) {
    super(message);
    this.name = "TikTokPublishError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function apiError<T>(body: TikTokEnvelope<T>, status: number) {
  if (status < 400 && (!body.error?.code || body.error.code === "ok")) return;
  if (body.error?.code === "unaudited_client_can_only_post_to_private_accounts") {
    throw new Error(
      "TikTok Sandbox only allows Direct Posts to private TikTok accounts. Set the connected TikTok account itself to Private in TikTok, then try again. Selecting “أنا فقط” only changes this video's privacy.",
    );
  }
  throw new Error(
    body.error?.message
      ? `TikTok API error (${body.error.code ?? status}): ${body.error.message}`
      : `TikTok API request failed (HTTP ${status}).`,
  );
}

async function readEnvelope<T>(response: Response) {
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new Error("TikTok returned an invalid API response.");
  const envelope = body as TikTokEnvelope<T>;
  apiError(envelope, response.status);
  if (!envelope.data) throw new Error("TikTok returned an empty API response.");
  return envelope.data;
}

function requiredEnv(name: "TIKTOK_CLIENT_KEY" | "TIKTOK_CLIENT_SECRET") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
}

async function readVideoChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  size: number,
  remainder: Buffer,
) {
  const chunks: Buffer[] = [];
  let buffered = remainder;
  let chunkBytes = 0;
  while (chunkBytes < size) {
    if (buffered.length === 0) {
      const { done, value } = await reader.read();
      if (done || !value) throw new Error("Cloudinary returned a truncated video stream.");
      buffered = Buffer.from(value);
    }

    const take = Math.min(size - chunkBytes, buffered.length);
    chunks.push(buffered.subarray(0, take));
    chunkBytes += take;
    buffered = buffered.subarray(take);
  }
  return { chunk: Buffer.concat(chunks, chunkBytes), remainder: buffered };
}

async function getAccessToken() {
  const settings = await prisma.settings.findUnique({
    where: { id: "store" },
    select: {
      tiktokAccessToken: true,
      tiktokRefreshToken: true,
      tiktokTokenExpiresAt: true,
      tiktokRefreshTokenExpiresAt: true,
    },
  });
  if (!settings?.tiktokRefreshToken) {
    throw new Error("Connect a TikTok account in Settings before publishing.");
  }
  if (settings.tiktokRefreshTokenExpiresAt &&
    settings.tiktokRefreshTokenExpiresAt.getTime() <= Date.now()) {
    throw new Error("TikTok authorization expired. Reconnect the account in Settings.");
  }

  const currentAccessToken = settings.tiktokAccessToken
    ? decryptTikTokToken(settings.tiktokAccessToken)
    : "";
  if (currentAccessToken &&
    (settings.tiktokTokenExpiresAt?.getTime() ?? 0) > Date.now() + 5 * 60_000) {
    return currentAccessToken;
  }

  const refreshToken = decryptTikTokToken(settings.tiktokRefreshToken);
  const response = await fetch(`${TIKTOK_API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({
      client_key: requiredEnv("TIKTOK_CLIENT_KEY"),
      client_secret: requiredEnv("TIKTOK_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });
  const tokens: unknown = await response.json();
  if (!response.ok || !isRecord(tokens) || typeof tokens.access_token !== "string" ||
    typeof tokens.expires_in !== "number") {
    throw new Error("TikTok access token refresh failed. Reconnect the account in Settings.");
  }

  const renewedRefreshToken = typeof tokens.refresh_token === "string"
    ? tokens.refresh_token
    : refreshToken;
  const now = Date.now();
  await prisma.settings.update({
    where: { id: "store" },
    data: {
      tiktokAccessToken: encryptTikTokToken(tokens.access_token),
      tiktokRefreshToken: encryptTikTokToken(renewedRefreshToken),
      tiktokTokenExpiresAt: new Date(now + tokens.expires_in * 1000),
      ...(typeof tokens.refresh_expires_in === "number"
        ? { tiktokRefreshTokenExpiresAt: new Date(now + tokens.refresh_expires_in * 1000) }
        : {}),
    },
  });
  return tokens.access_token;
}

async function tiktokRequest<T>(accessToken: string, path: string, body: unknown) {
  const response = await fetch(`${TIKTOK_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return readEnvelope<T>(response);
}

export async function uploadTikTokVideo(input: {
  mediaUrl: string;
  mediaPublicId: string;
  caption: string;
  privacyLevel: string;
}) {
  if (input.caption.length > 2200) {
    throw new Error("TikTok captions cannot exceed 2,200 UTF-16 code units.");
  }
  const privacyLevel = toTikTokPrivacyLevel(input.privacyLevel);
  const accessToken = await getAccessToken();
  const creator = await queryCreatorInfo(accessToken);
  if (!creator.canPost) {
    throw new Error("TikTok currently does not allow this account to publish. Try again later.");
  }
  if (!creator.privacyLevelOptions.includes(privacyLevel)) {
    throw new Error("The selected TikTok privacy option is no longer available. Reopen the editor and try again.");
  }

  let mediaResource;
  try {
    mediaResource = await cloudinary.api.resource(input.mediaPublicId, { resource_type: "video" });
  } catch {
    throw new Error("تعذّر التحقق من خصائص فيديو TikTok في التخزين السحابي.");
  }
  const mediaMimeType = mimeTypeFromCloudinaryResource(mediaResource.resource_type, mediaResource.format);
  if (!mediaMimeType) throw new Error("TikTok يتطلب فيديو بصيغة MP4 أو MOV أو WebM.");
  const mediaValidation = validatePlatformMedia({
    mimeType: mediaMimeType,
    fileSize: mediaResource.bytes,
    platforms: ["tiktok"],
    durationSeconds: mediaResource.duration,
    tiktokMaxDurationSeconds: creator.maxVideoPostDurationSeconds,
  });
  if (mediaValidation.errors.length > 0 || mediaValidation.pending.length > 0) {
    throw new Error([...mediaValidation.errors, ...mediaValidation.pending].join(" "));
  }

  const parsedUrl = new URL(input.mediaUrl);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "res.cloudinary.com") {
    throw new Error("Stored video URL is not a valid Cloudinary URL.");
  }
  const videoResponse = await fetch(input.mediaUrl, { cache: "no-store" });
  if (!videoResponse.ok) {
    throw new Error(`Could not fetch the stored video (HTTP ${videoResponse.status}).`);
  }
  const declaredSize = Number(videoResponse.headers.get("content-length"));
  if (!Number.isSafeInteger(declaredSize) || declaredSize !== mediaResource.bytes || declaredSize <= 0) {
    throw new Error("TikTok video size could not be verified against the stored media.");
  }
  const mimeType = videoResponse.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!["video/mp4", "video/quicktime", "video/webm"].includes(mimeType)) {
    throw new Error("TikTok supports MP4, QuickTime, and WebM video files.");
  }
  if (mimeType !== mediaMimeType) throw new Error("TikTok media type does not match the stored Cloudinary asset.");
  if (!videoResponse.body) throw new Error("Cloudinary returned an empty video stream.");
  const totalChunkCount = Math.ceil(declaredSize / SINGLE_CHUNK_MAX_SIZE);
  const chunkSize = totalChunkCount === 1
    ? declaredSize
    : Math.ceil(declaredSize / totalChunkCount);
  const payload = createTikTokDirectPostPayload({
    title: input.caption,
    privacyLevel,
    videoSize: declaredSize,
    chunkSize,
    totalChunkCount,
  });
  const initialized = await tiktokRequest<{ publish_id?: string; upload_url?: string }>(
    accessToken,
    "/v2/post/publish/video/init/",
    payload,
  );
  if (!initialized.publish_id || !initialized.upload_url) {
    throw new Error("TikTok did not return the upload session details.");
  }
  const uploadUrl = new URL(initialized.upload_url);
  if (uploadUrl.protocol !== "https:" || !uploadUrl.hostname.endsWith(".tiktokapis.com")) {
    throw new Error("TikTok returned an invalid video upload URL.");
  }

  const reader = videoResponse.body.getReader();
  try {
    let start = 0;
    let remainder: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    for (let index = 0; index < totalChunkCount; index += 1) {
      const expectedChunkBytes = Math.min(chunkSize, declaredSize - start);
      const next = await readVideoChunk(reader, expectedChunkBytes, remainder);
      remainder = next.remainder;
      const end = start + next.chunk.byteLength;
      try {
        const uploadResponse = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": mimeType,
            "Content-Length": String(next.chunk.byteLength),
            "Content-Range": `bytes ${start}-${end - 1}/${declaredSize}`,
          },
          body: new Blob([next.chunk], { type: mimeType }),
          cache: "no-store",
        });
        const expectedStatus = index === totalChunkCount - 1 ? 201 : 206;
        if (uploadResponse.status !== expectedStatus) {
          throw new Error(`TikTok video transfer failed (HTTP ${uploadResponse.status}).`);
        }
      } finally {
        next.chunk.fill(0);
      }
      start = end;
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined);
    throw new TikTokPublishError(
      error instanceof Error ? error.message : "TikTok video transfer failed.",
      true,
      initialized.publish_id,
    );
  } finally {
    reader.releaseLock();
  }

  return { publishId: initialized.publish_id };
}

async function queryCreatorInfo(accessToken: string) {
  const result = await tiktokRequest<{
    creator_can_post?: boolean;
    creator_nickname?: string;
    privacy_level_options?: string[];
    max_video_post_duration_sec?: number;
  }>(accessToken, "/v2/post/publish/creator_info/query/", {});
  return {
    canPost: result.creator_can_post !== false,
    nickname: result.creator_nickname ?? "",
    privacyLevelOptions: (result.privacy_level_options ?? []).filter(
      (value): value is TikTokPrivacyLevel => isTikTokPrivacyLevel(value),
    ),
    maxVideoPostDurationSeconds: result.max_video_post_duration_sec ?? null,
  };
}

export async function getTikTokCreatorInfo() {
  const accessToken = await getAccessToken();
  return queryCreatorInfo(accessToken);
}

export async function revokeTikTokAccess() {
  const accessToken = await getAccessToken();
  const response = await fetch(`${TIKTOK_API}/v2/oauth/revoke/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({
      client_key: requiredEnv("TIKTOK_CLIENT_KEY"),
      client_secret: requiredEnv("TIKTOK_CLIENT_SECRET"),
      token: accessToken,
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`TikTok authorization revocation failed (HTTP ${response.status}).`);
  }
}

export async function fetchTikTokPublishStatus(publishId: string) {
  const accessToken = await getAccessToken();
  const result = await tiktokRequest<{
    status?: string;
    fail_reason?: string;
    publicaly_available_post_id?: string[];
    publicly_available_post_id?: string[];
  }>(accessToken, "/v2/post/publish/status/fetch/", { publish_id: publishId });
  const videoId = result.publicly_available_post_id?.[0] ??
    result.publicaly_available_post_id?.[0] ??
    null;
  return {
    status: result.status ?? "PROCESSING_UPLOAD",
    videoId,
    error: result.fail_reason ?? null,
    url: videoId ? `https://www.tiktok.com/@/video/${encodeURIComponent(videoId)}` : null,
  };
}
