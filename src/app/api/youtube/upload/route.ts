import { Readable } from "node:stream";
import { google } from "googleapis";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function jsonError(error: string, status: number, details?: string) {
  return NextResponse.json(
    { error, ...(details ? { details } : {}) },
    { status, headers: NO_STORE_HEADERS },
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

function getTags(formData: FormData): string[] | null {
  const values = formData.getAll("tags");
  const tags: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") return null;

    if (value.trimStart().startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (!Array.isArray(parsed) || !parsed.every((tag) => typeof tag === "string")) {
          return null;
        }
        tags.push(...parsed);
      } catch {
        return null;
      }
    } else {
      tags.push(...value.split(","));
    }
  }

  const normalizedTags = tags.map((tag) => tag.trim()).filter(Boolean);
  if (normalizedTags.join("").length > 500) return null;
  return normalizedTags;
}

function safeMessage(message: string, secrets: string[]) {
  return secrets.reduce(
    (sanitized, secret) => secret ? sanitized.replaceAll(secret, "[redacted]") : sanitized,
    message,
  ).slice(0, 1000);
}

async function* fileChunks(file: File) {
  const reader = file.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

function getGoogleError(error: unknown): {
  message: string;
  reason?: string;
  status?: number;
} {
  if (!error || typeof error !== "object") return { message: "YouTube upload failed." };

  const response = "response" in error && error.response && typeof error.response === "object"
    ? error.response
    : undefined;
  const data = response && "data" in response && response.data && typeof response.data === "object"
    ? response.data
    : undefined;
  const apiError = data && "error" in data && data.error && typeof data.error === "object"
    ? data.error
    : undefined;
  const message = apiError && "message" in apiError && typeof apiError.message === "string"
    ? apiError.message
    : error instanceof Error
      ? error.message
      : "YouTube upload failed.";
  const firstError = apiError && "errors" in apiError && Array.isArray(apiError.errors)
    ? apiError.errors[0]
    : undefined;
  const reason = firstError && typeof firstError === "object" && "reason" in firstError &&
      typeof firstError.reason === "string"
    ? firstError.reason
    : undefined;
  const status = response && "status" in response && typeof response.status === "number"
    ? response.status
    : undefined;

  return {
    message,
    ...(reason ? { reason } : {}),
    ...(status ? { status } : {}),
  };
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return jsonError("Authentication required.", 401);
  if (!originIsValid(request)) return jsonError("Request origin is not allowed.", 403);

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    console.error("YouTube upload is not configured.", {
      missing: [
        ...(!clientId ? ["YOUTUBE_CLIENT_ID"] : []),
        ...(!clientSecret ? ["YOUTUBE_CLIENT_SECRET"] : []),
        ...(!redirectUri ? ["YOUTUBE_REDIRECT_URI"] : []),
      ],
    });
    return jsonError("YouTube OAuth is not configured on the server.", 503);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Request must contain valid multipart/form-data.", 400);
  }

  const file = formData.get("file");
  const titleValue = formData.get("title");
  const descriptionValue = formData.get("description");
  const accessToken = formData.get("accessToken");
  const refreshToken = formData.get("refreshToken");
  const privacyValue = formData.get("privacyStatus");

  if (!(file instanceof File) || file.size === 0) {
    return jsonError("A non-empty video file is required.", 400);
  }
  if (typeof titleValue !== "string" || !titleValue.trim() || titleValue.trim().length > 100) {
    return jsonError("Title is required and must be no longer than 100 characters.", 400);
  }
  if (typeof descriptionValue !== "string" || descriptionValue.length > 5000) {
    return jsonError("Description is required and must be no longer than 5000 characters.", 400);
  }
  if (typeof accessToken !== "string" || !accessToken.trim() ||
      typeof refreshToken !== "string" || !refreshToken.trim()) {
    return jsonError("Both accessToken and refreshToken are required.", 400);
  }

  const privacyStatus = privacyValue === null ? "public" : privacyValue;
  if (privacyStatus !== "public" && privacyStatus !== "unlisted") {
    return jsonError("privacyStatus must be either 'public' or 'unlisted'.", 400);
  }

  const tags = getTags(formData);
  if (tags === null) {
    return jsonError("Tags must be strings with a combined length no greater than 500 characters.", 400);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  try {
    await oauth2Client.refreshAccessToken();
    const result = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: titleValue.trim(),
          description: descriptionValue,
          tags,
          categoryId: "22",
        },
        status: { privacyStatus },
      },
      media: {
        body: Readable.from(fileChunks(file)),
        mimeType: file.type || "application/octet-stream",
      },
    });

    const videoId = result.data.id;
    if (!videoId) {
      console.error("YouTube upload completed without returning a video ID.");
      return jsonError("YouTube did not return an ID for the uploaded video.", 502);
    }

    return NextResponse.json(
      {
        videoId,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const googleError = getGoogleError(error);
    const message = safeMessage(googleError.message, [
      accessToken,
      refreshToken,
      clientSecret,
    ]);
    const details = googleError.reason
      ? safeMessage(googleError.reason, [accessToken, refreshToken, clientSecret])
      : undefined;

    console.error("YouTube upload failed.", {
      status: googleError.status,
      ...(details ? { reason: details } : {}),
      message,
    });
    return jsonError(message, 502, details);
  }
}
