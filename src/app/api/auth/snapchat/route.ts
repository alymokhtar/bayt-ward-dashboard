import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import {
  createSnapchatAuthorizationUrl,
  getSnapchatRedirectUri,
} from "@/lib/snapchat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "snapchat_oauth_state";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  try {
    getSnapchatRedirectUri();
    if (!process.env.SNAPCHAT_ORGANIZATION_ID ||
      !process.env.SNAPCHAT_CLIENT_ID ||
      !process.env.SNAPCHAT_CLIENT_SECRET) {
      throw new Error("Snapchat OAuth environment variables are not fully configured.");
    }
    const state = randomBytes(32).toString("base64url");
    const response = NextResponse.redirect(createSnapchatAuthorizationUrl(state));
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth/snapchat/callback",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    console.error("Snapchat OAuth is not configured.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "إعدادات ربط Snapchat غير مكتملة على الخادم." },
      { status: 503 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) {
    return NextResponse.json({ error: "مصدر الطلب غير مسموح." }, { status: 403 });
  }
  try {
    if (new URL(origin).host !== host) {
      return NextResponse.json({ error: "مصدر الطلب غير مسموح." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "مصدر الطلب غير صالح." }, { status: 403 });
  }

  try {
    await prisma.settings.upsert({
      where: { id: "store" },
      create: { id: "store" },
      update: {
        snapchatAccessToken: "",
        snapchatRefreshToken: "",
        snapchatTokenExpiresAt: null,
        snapchatProfileId: process.env.SNAPCHAT_PUBLIC_PROFILE_ID?.trim() ?? "",
        snapchatProfileName: "",
        snapchatToken: "",
      },
    });
    return NextResponse.json({ success: true }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "تعذّر فصل حساب Snapchat." }, { status: 503 });
  }
}
