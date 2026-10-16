import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "youtube_oauth_state";

function getOAuthClient() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("YouTube OAuth environment variables are not configured.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
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

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let client: ReturnType<typeof getOAuthClient>;
  try {
    client = getOAuthClient();
  } catch (error) {
    console.error("YouTube OAuth is not configured.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "YouTube OAuth is not configured on the server." },
      { status: 503 },
    );
  }

  const state = randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
    state,
  }));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/youtube/callback",
    maxAge: 10 * 60,
  });
  return response;
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!originIsValid(request)) {
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  try {
    await prisma.settings.upsert({
      where: { id: "store" },
      create: { id: "store" },
      update: {
        youtubeAccessToken: "",
        youtubeRefreshToken: "",
        youtubeTokenExpiresAt: null,
        youtubeChannelId: "",
        youtubeChannelTitle: "",
      },
    });
    return NextResponse.json({ success: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Could not disconnect YouTube.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Could not disconnect YouTube." }, { status: 503 });
  }
}
