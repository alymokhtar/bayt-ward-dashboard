import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { encryptTikTokToken } from "@/lib/meta-token";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "tiktok_oauth_state";

function settingsRedirect(request: Request, result: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("tiktok", result);
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/auth/tiktok/callback",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const stateCookie = (await cookies()).get(STATE_COOKIE)?.value;
  if (!stateMatches(stateCookie, url.searchParams.get("state"))) {
    return settingsRedirect(request, "invalid-state");
  }
  if (url.searchParams.has("error") || !url.searchParams.get("code")) {
    return settingsRedirect(request, "denied");
  }
  const code = url.searchParams.get("code");
  if (!code) return settingsRedirect(request, "denied");

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  if (!clientKey || !clientSecret || !redirectUri) {
    console.error("TikTok OAuth callback received without complete OAuth configuration.");
    return settingsRedirect(request, "configuration-error");
  }

  try {
    const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });
    const tokens: unknown = await tokenResponse.json();
    if (!tokenResponse.ok || !isRecord(tokens) ||
      typeof tokens.access_token !== "string" ||
      typeof tokens.refresh_token !== "string" ||
      typeof tokens.open_id !== "string" ||
      typeof tokens.expires_in !== "number") {
      console.error("TikTok OAuth token exchange failed.", {
        status: tokenResponse.status,
        error: isRecord(tokens) && typeof tokens.error === "string" ? tokens.error : "Invalid token response",
      });
      return settingsRedirect(request, "token-error");
    }

    const profileResponse = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        cache: "no-store",
      },
    );
    const profile: unknown = await profileResponse.json();
    if (!profileResponse.ok || !isRecord(profile) || !isRecord(profile.data) ||
      !isRecord(profile.data.user) ||
      (isRecord(profile.error) && profile.error.code !== "ok")) {
      console.error("TikTok profile lookup failed after OAuth.", { status: profileResponse.status });
      return settingsRedirect(request, "profile-error");
    }

    const user = profile.data.user;
    const openId = typeof user.open_id === "string" ? user.open_id : tokens.open_id;
    const displayName = typeof user.display_name === "string" ? user.display_name : openId;
    const now = Date.now();
    const refreshExpiresIn = typeof tokens.refresh_expires_in === "number"
      ? tokens.refresh_expires_in
      : undefined;
    await prisma.settings.upsert({
      where: { id: "store" },
      create: {
        id: "store",
        tiktokOpenId: openId,
        tiktokDisplayName: displayName,
        tiktokAccountId: openId,
        tiktokAccessToken: encryptTikTokToken(tokens.access_token),
        tiktokRefreshToken: encryptTikTokToken(tokens.refresh_token),
        tiktokTokenExpiresAt: new Date(now + tokens.expires_in * 1000),
        tiktokRefreshTokenExpiresAt: refreshExpiresIn
          ? new Date(now + refreshExpiresIn * 1000)
          : null,
      },
      update: {
        tiktokOpenId: openId,
        tiktokDisplayName: displayName,
        tiktokAccountId: openId,
        tiktokAccessToken: encryptTikTokToken(tokens.access_token),
        tiktokRefreshToken: encryptTikTokToken(tokens.refresh_token),
        tiktokTokenExpiresAt: new Date(now + tokens.expires_in * 1000),
        tiktokRefreshTokenExpiresAt: refreshExpiresIn
          ? new Date(now + refreshExpiresIn * 1000)
          : null,
      },
    });
    return settingsRedirect(request, "connected");
  } catch (error) {
    console.error("TikTok OAuth connection failed.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return settingsRedirect(request, "error");
  }
}
