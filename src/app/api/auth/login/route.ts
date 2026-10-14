import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSession,
  isValidAdminPassword,
} from "@/lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FAILURES = 8;

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

function clientIp(request: Request) {
  const directIp = request.headers.get("x-real-ip");
  if (directIp) return directIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",").at(-1)?.trim() ?? "";
  return process.env.NODE_ENV === "development" ? "local-development" : "";
}

export async function POST(request: Request) {
  if (!originIsValid(request)) {
    return NextResponse.json({ error: "مصدر الطلب غير مسموح." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات تسجيل الدخول غير صالحة." }, { status: 400 });
  }

  const password =
    body && typeof body === "object" && "password" in body && typeof body.password === "string"
      ? body.password
      : "";
  if (!password || password.length > 1024) {
    return NextResponse.json({ error: "أدخلي كلمة مرور صالحة." }, { status: 400 });
  }

  const ip = clientIp(request);
  if (!ip) {
    return NextResponse.json(
      { error: "تعذّر التحقق من عنوان الاتصال. تأكدي من إعداد وكيل الشبكة." },
      { status: 503 },
    );
  }

  try {
    const secret = process.env.ADMIN_SESSION_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error("ADMIN_SESSION_SECRET must contain at least 32 characters.");
    }
    const ipHash = createHash("sha256").update(`${secret}:${ip}`).digest("hex");
    const attempt = await prisma.adminLoginAttempt.findUnique({ where: { ipHash } });
    if (attempt?.lockedUntil && attempt.lockedUntil > new Date()) {
      return NextResponse.json(
        { error: "محاولات تسجيل الدخول كثيرة. حاولي بعد 15 دقيقة." },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!isValidAdminPassword(password)) {
      await prisma.$executeRaw`
        INSERT INTO "AdminLoginAttempt" ("ipHash", "failedAttempts", "windowStartedAt", "lockedUntil", "updatedAt")
        VALUES (${ipHash}, 1, NOW(), NULL, NOW())
        ON CONFLICT ("ipHash") DO UPDATE SET
          "failedAttempts" = CASE
            WHEN "AdminLoginAttempt"."windowStartedAt" <= NOW() - INTERVAL '15 minutes' THEN 1
            ELSE "AdminLoginAttempt"."failedAttempts" + 1
          END,
          "windowStartedAt" = CASE
            WHEN "AdminLoginAttempt"."windowStartedAt" <= NOW() - INTERVAL '15 minutes' THEN NOW()
            ELSE "AdminLoginAttempt"."windowStartedAt"
          END,
          "lockedUntil" = CASE
            WHEN "AdminLoginAttempt"."windowStartedAt" <= NOW() - INTERVAL '15 minutes' THEN NULL
            WHEN "AdminLoginAttempt"."failedAttempts" + 1 >= ${MAX_FAILURES} THEN NOW() + INTERVAL '15 minutes'
            ELSE "AdminLoginAttempt"."lockedUntil"
          END,
          "updatedAt" = NOW()
      `;
      return NextResponse.json(
        { error: "كلمة المرور غير صحيحة." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    await prisma.adminLoginAttempt.deleteMany({ where: { ipHash } });
    const response = NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSession(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    const errorCode =
      error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
    console.error("Admin login failed.", {
      name: error instanceof Error ? error.name : "UnknownError",
      ...(errorCode ? { code: errorCode } : {}),
    });
    return NextResponse.json(
      { error: "تعذّر إكمال تسجيل الدخول. تحققي من إعداد الخادم وقاعدة البيانات." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
