import { createCipheriv, randomBytes } from "node:crypto";
import { decryptSnapchatToken, encryptSnapchatToken } from "@/lib/meta-token";
import { cloudinary } from "@/lib/cloudinary";
import { prisma } from "@/lib/prisma";
import { SNAPCHAT_MAX_MEDIA_BYTES } from "@/lib/platform-rules";

const SNAPCHAT_API = "https://businessapi.snapchat.com";
const SNAPCHAT_AUTH = "https://accounts.snapchat.com/login/oauth2";
const SNAPCHAT_AUTHORIZE_URL = "https://accounts.snapchat.com/login/oauth2/authorize";
const SNAPCHAT_CHUNK_SIZE = 32 * 1024 * 1024;

type SnapEnvelope = {
  request_status?: string;
  request_id?: string;
  error_code?: string;
  display_message?: string;
  debug_message?: string;
  media_id?: string;
  add_path?: string;
  finalize_path?: string;
  spotlight_id?: string;
  public_profiles?: Array<{
    sub_request_status?: string;
    public_profile?: { id?: string; display_name?: string; organization_id?: string };
  }>;
};

export class SnapchatPublishError extends Error {
  constructor(
    message: string,
    readonly outcomeUnknown = false,
  ) {
    super(message);
    this.name = "SnapchatPublishError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredEnv(name: "SNAPCHAT_CLIENT_ID" | "SNAPCHAT_CLIENT_SECRET" | "SNAPCHAT_ORGANIZATION_ID") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured on the server.`);
  return value;
}

export function getSnapchatRedirectUri() {
  const redirectUri = process.env.SNAPCHAT_REDIRECT_URI ??
    process.env.NEXT_PUBLIC_SNAPCHAT_REDIRECT_URI;
  if (!redirectUri) throw new Error("Snapchat OAuth redirect URI is not configured.");
  const parsed = new URL(redirectUri);
  if (parsed.protocol !== "https:") {
    throw new Error("Snapchat OAuth redirect URI must use HTTPS.");
  }
  return parsed.toString();
}

export function createSnapchatAuthorizationUrl(state: string) {
  const url = new URL(SNAPCHAT_AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: requiredEnv("SNAPCHAT_CLIENT_ID"),
    redirect_uri: getSnapchatRedirectUri(),
    scope: "snapchat-marketing-api",
    state,
  }).toString();
  return url;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new SnapchatPublishError(`Snapchat returned an invalid response (HTTP ${response.status}).`);
  }
}

async function tokenRequest(body: URLSearchParams) {
  const response = await fetch(`${SNAPCHAT_AUTH}/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const result: unknown = await readJson(response);
  if (!response.ok || !isRecord(result) ||
    typeof result.access_token !== "string" ||
    typeof result.refresh_token !== "string" ||
    typeof result.expires_in !== "number") {
    throw new SnapchatPublishError(
      `Snapchat OAuth token exchange failed (HTTP ${response.status}). Check app allowlisting, scopes, and redirect URI.`,
    );
  }
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresIn: result.expires_in,
  };
}

export async function exchangeSnapchatCode(code: string) {
  return tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    client_id: requiredEnv("SNAPCHAT_CLIENT_ID"),
    client_secret: requiredEnv("SNAPCHAT_CLIENT_SECRET"),
    code,
    redirect_uri: getSnapchatRedirectUri(),
  }));
}

export async function listSnapchatOrganizationProfiles(accessToken: string) {
  const organizationId = requiredEnv("SNAPCHAT_ORGANIZATION_ID");
  const profiles: NonNullable<SnapEnvelope["public_profiles"]> = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(`${SNAPCHAT_API}/v1/organizations/${encodeURIComponent(organizationId)}/public_profiles`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const body = await readJson(response);
    if (!response.ok || !isRecord(body) || body.request_status !== "SUCCESS" ||
      !Array.isArray(body.public_profiles)) {
      throw new SnapchatPublishError(`Could not load Snapchat Public Profiles (HTTP ${response.status}). Verify organization membership and API permissions.`);
    }
    profiles.push(...body.public_profiles.filter(isRecord) as NonNullable<SnapEnvelope["public_profiles"]>);
    const paging = isRecord(body.paging) ? body.paging : null;
    const nextCursor = paging && typeof paging.next_page_id === "string"
      ? paging.next_page_id
      : "";
    if (!nextCursor) return profiles;
    cursor = nextCursor;
  }
  throw new SnapchatPublishError("Snapchat returned too many Public Profile pages to safely complete setup.");
}

async function getSnapchatAccessToken() {
  const settings = await prisma.settings.findUnique({
    where: { id: "store" },
    select: {
      snapchatAccessToken: true,
      snapchatRefreshToken: true,
      snapchatTokenExpiresAt: true,
    },
  });
  if (!settings?.snapchatRefreshToken) {
    throw new Error("اربطي حساب Snapchat من صفحة الإعدادات قبل النشر.");
  }

  const currentAccessToken = settings.snapchatAccessToken
    ? decryptSnapchatToken(settings.snapchatAccessToken)
    : "";
  if (currentAccessToken &&
    (settings.snapchatTokenExpiresAt?.getTime() ?? 0) > Date.now() + 5 * 60_000) {
    return currentAccessToken;
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSnapchatToken(settings.snapchatRefreshToken);
  } catch {
    throw new Error("بيانات ربط Snapchat غير قابلة للقراءة. أعيدي ربط الحساب من الإعدادات.");
  }
  let tokens;
  try {
    tokens = await tokenRequest(new URLSearchParams({
      grant_type: "refresh_token",
      client_id: requiredEnv("SNAPCHAT_CLIENT_ID"),
      client_secret: requiredEnv("SNAPCHAT_CLIENT_SECRET"),
      refresh_token: refreshToken,
    }));
  } catch {
    throw new Error("تعذّر تجديد صلاحية Snapchat. أعيدي ربط الحساب من الإعدادات.");
  }

  const now = Date.now();
  await prisma.settings.update({
    where: { id: "store" },
    data: {
      snapchatAccessToken: encryptSnapchatToken(tokens.accessToken),
      snapchatRefreshToken: encryptSnapchatToken(tokens.refreshToken),
      snapchatTokenExpiresAt: new Date(now + tokens.expiresIn * 1000),
    },
  });
  return tokens.accessToken;
}

async function snapchatRequest(accessToken: string, path: string, body: unknown) {
  let response: Response;
  try {
    response = await fetch(`${SNAPCHAT_API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new SnapchatPublishError(
      "تعذّر تأكيد نتيجة طلب النشر إلى Snapchat. تحققي من الحساب قبل إعادة المحاولة.",
      path.endsWith("/stories") || path.endsWith("/spotlights"),
    );
  }
  let result: unknown;
  try {
    result = await readJson(response);
  } catch (error) {
    if (response.ok && (path.endsWith("/stories") || path.endsWith("/spotlights"))) {
      throw new SnapchatPublishError(
        "Snapchat may have accepted the content, but its response could not be confirmed. Check the profile before retrying.",
        true,
      );
    }
    throw error;
  }
  if (!response.ok || !isRecord(result) || result.request_status !== "SUCCESS") {
    const code = isRecord(result) && typeof result.error_code === "string" ? result.error_code : "";
    if (response.ok && (path.endsWith("/stories") || path.endsWith("/spotlights"))) {
      throw new SnapchatPublishError(
        "Snapchat may have accepted the content, but its response could not be confirmed. Check the profile before retrying.",
        true,
      );
    }
    throw new SnapchatPublishError(
      `Snapchat API rejected the request${code ? ` (${code})` : ` (HTTP ${response.status})`}.`,
    );
  }
  return result as SnapEnvelope;
}

async function readCloudinaryMedia(mediaUrl: string, mediaType: "image" | "video") {
  const parsed = new URL(mediaUrl);
  if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com") {
    throw new Error("رابط الوسائط المخزّن غير صالح.");
  }
  const response = await fetch(mediaUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`تعذّر تنزيل الوسائط من التخزين السحابي (HTTP ${response.status}).`);
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType === "video" && contentType !== "video/mp4") {
    throw new Error("يجب أن تكون وسائط فيديو Snapchat بصيغة MP4.");
  }
  if (mediaType === "image" && contentType !== "image/jpeg" && contentType !== "image/png") {
    throw new Error("قصص Snapchat تدعم صور JPG أو PNG في لوحة التحكم.");
  }
  const declaredSize = Number(response.headers.get("content-length"));
  if (declaredSize > SNAPCHAT_MAX_MEDIA_BYTES) {
    throw new Error("حد حجم وسائط Snapchat في لوحة التحكم هو 100 MiB.");
  }
  if (!response.body) throw new Error("تعذّر قراءة ملف الوسائط.");

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > SNAPCHAT_MAX_MEDIA_BYTES) {
        throw new Error("حد حجم وسائط Snapchat في لوحة التحكم هو 100 MiB.");
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel(error);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const media = Buffer.concat(chunks, size);
  if (!media.byteLength) throw new Error("ملف الوسائط فارغ.");
  return media;
}

async function uploadSnapchatMedia(
  accessToken: string,
  profileId: string,
  media: Buffer,
  mediaType: "IMAGE" | "VIDEO",
) {
  const key = randomBytes(32);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(media), cipher.final()]);
  const created = await snapchatRequest(accessToken, `/v1/public_profiles/${encodeURIComponent(profileId)}/media`, {
    type: mediaType,
    name: `bayt-ward-${Date.now()}`,
    key: key.toString("base64"),
    iv: iv.toString("base64"),
  });
  if (!created.media_id || !created.add_path || !created.finalize_path) {
    throw new SnapchatPublishError("Snapchat did not return the media upload details.");
  }

  const addUrl = new URL(created.add_path, SNAPCHAT_API);
  const finalizeUrl = new URL(created.finalize_path, SNAPCHAT_API);
  if (addUrl.origin !== SNAPCHAT_API || finalizeUrl.origin !== SNAPCHAT_API) {
    throw new SnapchatPublishError("Snapchat returned an unsupported media upload destination.");
  }
  const partCount = Math.ceil(encrypted.byteLength / SNAPCHAT_CHUNK_SIZE);
  if (partCount > 35) throw new Error("Snapchat multipart upload supports at most 35 chunks.");
  for (let index = 0; index < partCount; index += 1) {
    const chunk = encrypted.subarray(index * SNAPCHAT_CHUNK_SIZE, (index + 1) * SNAPCHAT_CHUNK_SIZE);
    const form = new FormData();
    form.set("action", "ADD");
    form.set("part_number", String(index + 1));
    form.set("file", new Blob([new Uint8Array(chunk)]), `media-part-${index + 1}`);
    const response = await fetch(addUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
    const body: unknown = await readJson(response);
    if (!response.ok || !isRecord(body) || body.request_status !== "SUCCESS") {
      throw new SnapchatPublishError(`Snapchat media upload failed (HTTP ${response.status}).`);
    }
  }

  const finalizeForm = new FormData();
  finalizeForm.set("action", "FINALIZE");
  const finalizeResponse = await fetch(finalizeUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: finalizeForm,
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });
  const finalized: unknown = await readJson(finalizeResponse);
  if (!finalizeResponse.ok || !isRecord(finalized) || finalized.request_status !== "SUCCESS") {
    throw new SnapchatPublishError(`Snapchat could not finalize the media upload (HTTP ${finalizeResponse.status}).`);
  }
  return created.media_id;
}

export async function publishSnapchatContent(input: {
  mediaUrl: string;
  mediaPublicId: string;
  mediaType: "image" | "video";
  contentType: "STORY" | "SPOTLIGHT";
  description: string;
  storyTtl: "ONE_DAY" | "TWO_DAYS" | "THREE_DAYS" | "ONE_WEEK";
  link: string;
}) {
  if (input.contentType === "SPOTLIGHT" && input.mediaType !== "video") {
    throw new Error("نشر Spotlight يتطلب فيديو.");
  }
  if (input.contentType === "SPOTLIGHT" &&
    (!input.description.trim() || input.description.length > 160)) {
    throw new Error("وصف Spotlight مطلوب ويجب ألا يتجاوز 160 حرفاً.");
  }
  if (input.mediaType === "video") {
    let resource;
    try {
      resource = await cloudinary.api.resource(input.mediaPublicId, { resource_type: "video" });
    } catch {
      throw new Error("تعذّر التحقق من خصائص فيديو Snapchat في التخزين السحابي.");
    }
    if (resource.format !== "mp4" && resource.format !== "mov") {
      throw new Error("يتعذّر تحويل صيغة الفيديو الحالية إلى MP4 للنشر على Snapchat.");
    }
    const minDuration = input.contentType === "SPOTLIGHT" ? 6 : 5;
    if (typeof resource.duration !== "number" || resource.duration < minDuration || resource.duration > 60) {
      throw new Error(`مدة فيديو Snapchat يجب أن تكون من ${minDuration} إلى 60 ثانية.`);
    }
    if (typeof resource.width !== "number" || typeof resource.height !== "number" ||
      resource.width <= 0 || resource.height <= 0) {
      throw new Error("تعذّر قراءة أبعاد فيديو Snapchat لتحويله.");
    }
  }
  if (input.link) {
    if (input.link.length > 2048) throw new Error("رابط Snapchat أطول من الحد المسموح.");
    let link: URL;
    try {
      link = new URL(input.link);
    } catch {
      throw new Error("رابط Snapchat يجب أن يكون رابط HTTP أو HTTPS صالحاً.");
    }
    if (link.protocol !== "https:" && link.protocol !== "http:") {
      throw new Error("رابط Snapchat يجب أن يبدأ بـ HTTP أو HTTPS.");
    }
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "store" },
    select: { snapchatProfileId: true },
  });
  const profileId = settings?.snapchatProfileId || process.env.SNAPCHAT_PUBLIC_PROFILE_ID?.trim();
  if (!profileId) {
    throw new Error("Public Profile ID غير محدد. أضيفيه في إعدادات Snapchat أو متغير SNAPCHAT_PUBLIC_PROFILE_ID.");
  }
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) {
    throw new Error("معرّف Snapchat Public Profile يجب أن يكون UUID صالحاً.");
  }

  const accessToken = await getSnapchatAccessToken();
  const media = await readCloudinaryMedia(input.mediaUrl, input.mediaType);
  const mediaId = await uploadSnapchatMedia(
    accessToken,
    profileId,
    media,
    input.mediaType === "video" ? "VIDEO" : "IMAGE",
  );
  const link = input.link.trim();
  if (input.contentType === "SPOTLIGHT") {
    const result = await snapchatRequest(accessToken, `/v1/public_profiles/${encodeURIComponent(profileId)}/spotlights`, {
      media_id: mediaId,
      description: input.description.trim(),
      locale: "ar_EG",
      ...(link ? { link } : {}),
    });
    if (!result.spotlight_id) {
      throw new SnapchatPublishError("Snapchat accepted the Spotlight request without returning its ID.", true);
    }
      return { mediaId, spotlightId: result.spotlight_id, requestId: null };
  }

  const result = await snapchatRequest(accessToken, `/v1/public_profiles/${encodeURIComponent(profileId)}/stories`, {
    media_id: mediaId,
    customized_ttl: { ttl: input.storyTtl },
    ...(link ? { link } : {}),
  });
  return { mediaId, spotlightId: null, requestId: result.request_id ?? null };
}
