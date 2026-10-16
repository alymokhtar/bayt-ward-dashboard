import { timingSafeEqual } from "node:crypto";
import { google } from "googleapis";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { encryptYoutubeToken } from "@/lib/meta-token";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "youtube_oauth_state";

function settingsRedirect(request: Request, result: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("youtube", result);
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/youtube/callback",
    maxAge: 0,
  });
  return response;
}

function stateMatches(expected: string | undefined, actual: string | null) {
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const stateCookie = (await cookies()).get(STATE_COOKIE)?.value;
  if (!stateMatches(stateCookie, url.searchParams.get("state"))) {
    return settingsRedirect(request, "invalid-state");
  }

  const providerError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (providerError || !code) return settingsRedirect(request, "denied");

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    console.error("YouTube OAuth callback received without complete OAuth configuration.");
    return settingsRedirect(request, "configuration-error");
  }

  try {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      console.error("YouTube OAuth did not return both required tokens.");
      return settingsRedirect(request, "missing-token");
    }

    oauth2Client.setCredentials(tokens);
    const channelResponse = await google.youtube({
      version: "v3",
      auth: oauth2Client,
    }).channels.list({
      part: ["snippet"],
      mine: true,
      maxResults: 1,
    });
    const channel = channelResponse.data.items?.[0];
    if (!channel?.id) {
      console.error("YouTube OAuth did not return an accessible channel.");
      return settingsRedirect(request, "channel-error");
    }

    await prisma.settings.upsert({
      where: { id: "store" },
      create: {
        id: "store",
        youtubeAccessToken: encryptYoutubeToken(tokens.access_token),
        youtubeRefreshToken: encryptYoutubeToken(tokens.refresh_token),
        youtubeTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        youtubeChannelId: channel.id,
        youtubeChannelTitle: channel.snippet?.title ?? channel.id,
      },
      update: {
        youtubeAccessToken: encryptYoutubeToken(tokens.access_token),
        youtubeRefreshToken: encryptYoutubeToken(tokens.refresh_token),
        youtubeTokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        youtubeChannelId: channel.id,
        youtubeChannelTitle: channel.snippet?.title ?? channel.id,
      },
    });
    return settingsRedirect(request, "connected");
  } catch (error) {
    console.error("YouTube OAuth connection failed.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return settingsRedirect(request, "error");
  }
}
