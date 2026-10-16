import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { revokeTikTokAccess } from "@/lib/tiktok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "tiktok_oauth_state";

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

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  if (!clientKey || !clientSecret || !redirectUri) {
    console.error("TikTok OAuth environment variables are not fully configured.");
    return NextResponse.json({ error: "TikTok OAuth is not configured on the server." }, { status: 503 });
  }

  let callbackUrl: URL;
  try {
    callbackUrl = new URL(redirectUri);
  } catch {
    return NextResponse.json({ error: "TIKTOK_REDIRECT_URI must be an absolute HTTPS URL." }, { status: 503 });
  }
  if (callbackUrl.protocol !== "https:") {
    return NextResponse.json({ error: "TIKTOK_REDIRECT_URI must be an absolute HTTPS URL." }, { status: 503 });
  }

  const state = randomBytes(32).toString("base64url");
  const authorizationUrl = new URL("https://www.tiktok.com/v2/auth/authorize/");
  authorizationUrl.search = new URLSearchParams({
    client_key: clientKey,
    response_type: "code",
    scope: "user.info.basic,video.publish",
    redirect_uri: redirectUri,
    state,
  }).toString();

  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/auth/tiktok/callback",
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
    await revokeTikTokAccess();
    await prisma.settings.upsert({
      where: { id: "store" },
      create: { id: "store" },
      update: {
        tiktokOpenId: "",
        tiktokDisplayName: "",
        tiktokAccessToken: "",
        tiktokRefreshToken: "",
        tiktokTokenExpiresAt: null,
        tiktokRefreshTokenExpiresAt: null,
        tiktokAccountId: "",
      },
    });
    return NextResponse.json({ success: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Could not disconnect TikTok.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Could not disconnect TikTok." }, { status: 503 });
  }
}
