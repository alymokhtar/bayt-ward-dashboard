import { Readable } from "node:stream";
import { google } from "googleapis";
import { decryptYoutubeToken, encryptYoutubeToken } from "@/lib/meta-token";
import { prisma } from "@/lib/prisma";

type YouTubePrivacyStatus = "public" | "unlisted";

export class YouTubeUploadError extends Error {
  constructor(
    message: string,
    readonly outcomeUnknown: boolean,
  ) {
    super(message);
    this.name = "YouTubeUploadError";
  }
}

function requiredEnv(name: "YOUTUBE_CLIENT_ID" | "YOUTUBE_CLIENT_SECRET" | "YOUTUBE_REDIRECT_URI") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
}

async function* responseChunks(response: Response) {
  if (!response.body) throw new Error("Cloudinary returned an empty video stream.");
  const reader = response.body.getReader();
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

export async function uploadYouTubeVideo(input: {
  body: Readable;
  mimeType: string;
  title: string;
  description: string;
  tags: string[];
  privacyStatus: YouTubePrivacyStatus;
}) {
  const settings = await prisma.settings.findUnique({
    where: { id: "store" },
    select: {
      youtubeAccessToken: true,
      youtubeRefreshToken: true,
      youtubeTokenExpiresAt: true,
    },
  });
  if (!settings?.youtubeRefreshToken) {
    throw new Error("Connect a YouTube channel in Settings before publishing.");
  }

  const refreshToken = decryptYoutubeToken(settings.youtubeRefreshToken);
  const accessToken = settings.youtubeAccessToken
    ? decryptYoutubeToken(settings.youtubeAccessToken)
    : undefined;
  const oauth2Client = new google.auth.OAuth2(
    requiredEnv("YOUTUBE_CLIENT_ID"),
    requiredEnv("YOUTUBE_CLIENT_SECRET"),
    requiredEnv("YOUTUBE_REDIRECT_URI"),
  );
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: settings.youtubeTokenExpiresAt?.getTime(),
  });

  let uploadStarted = false;
  try {
    const refreshBefore =
      !accessToken || (settings.youtubeTokenExpiresAt?.getTime() ?? 0) <= Date.now() + 5 * 60_000;
    if (refreshBefore) {
      await oauth2Client.refreshAccessToken();
      if (!oauth2Client.credentials.access_token) {
        throw new Error("Google OAuth refresh did not return an access token.");
      }
      await prisma.settings.update({
        where: { id: "store" },
        data: {
          ...(oauth2Client.credentials.access_token
            ? { youtubeAccessToken: encryptYoutubeToken(oauth2Client.credentials.access_token) }
            : {}),
          ...(oauth2Client.credentials.refresh_token
            ? { youtubeRefreshToken: encryptYoutubeToken(oauth2Client.credentials.refresh_token) }
            : {}),
          ...(oauth2Client.credentials.expiry_date
            ? { youtubeTokenExpiresAt: new Date(oauth2Client.credentials.expiry_date) }
            : {}),
        },
      });
    }

    uploadStarted = true;
    const response = await google.youtube({ version: "v3", auth: oauth2Client }).videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: input.title,
          description: input.description,
          tags: input.tags,
          categoryId: "22",
        },
        status: { privacyStatus: input.privacyStatus },
      },
      media: { body: input.body, mimeType: input.mimeType },
    });

    if (!response.data.id) {
      throw new YouTubeUploadError("YouTube did not return a video ID.", true);
    }
    return {
      videoId: response.data.id,
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(response.data.id)}`,
    };
  } catch (error) {
    if (error instanceof YouTubeUploadError) throw error;
    const rawMessage = error instanceof Error ? error.message : "YouTube upload failed.";
    const message = [accessToken, refreshToken, process.env.YOUTUBE_CLIENT_SECRET]
      .filter((secret): secret is string => Boolean(secret))
      .reduce((sanitized, secret) => sanitized.replaceAll(secret, "[redacted]"), rawMessage)
      .slice(0, 1000);
    const status = error && typeof error === "object" && "response" in error &&
        error.response && typeof error.response === "object" &&
        "status" in error.response && typeof error.response.status === "number"
      ? error.response.status
      : undefined;
    throw new YouTubeUploadError(
      message,
      uploadStarted && (status === undefined || status >= 500),
    );
  }
}

export function readableFile(file: File) {
  async function* chunks() {
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
  return Readable.from(chunks());
}

export async function downloadCloudinaryVideo(url: string) {
  const mediaUrl = new URL(url);
  if (mediaUrl.protocol !== "https:" || mediaUrl.hostname !== "res.cloudinary.com") {
    throw new Error("Stored video URL is not a valid Cloudinary URL.");
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch the stored video (HTTP ${response.status}).`);
  }
  return {
    body: Readable.from(responseChunks(response)),
    mimeType: response.headers.get("content-type") ?? "video/mp4",
  };
}
