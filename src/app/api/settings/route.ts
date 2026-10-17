import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { encryptMetaToken } from "@/lib/meta-token";
import { FACEBOOK_PAGE_ID } from "@/constants/socials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_ID = "store";
function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return jsonError("يلزم تسجيل الدخول.", 401);
  }

  try {
    const settings = await prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, facebookPageId: FACEBOOK_PAGE_ID },
      update: {},
      select: {
        storeName: true,
        defaultHashtags: true,
        facebookPageId: true,
        instagramAccountId: true,
        tiktokDisplayName: true,
        tiktokRefreshToken: true,
        youtubeChannelId: true,
        youtubeChannelTitle: true,
        youtubeRefreshToken: true,
        snapchatClientId: true,
        snapchatToken: true,
        metaAccessTokenEncrypted: true,
        updatedAt: true,
      },
    });

    const {
      youtubeRefreshToken,
      tiktokRefreshToken,
      snapchatToken,
      metaAccessTokenEncrypted,
      ...publicSettings
    } = settings;
    return NextResponse.json({
      ...publicSettings,
      facebookPageId: settings.facebookPageId || FACEBOOK_PAGE_ID,
      youtubeConnected: Boolean(youtubeRefreshToken),
      tiktokConnected: Boolean(tiktokRefreshToken),
      snapchatTokenConfigured: Boolean(snapchatToken),
      metaAccessTokenConfigured: Boolean(metaAccessTokenEncrypted),
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("تعذّر تحميل إعدادات المتجر من قاعدة البيانات.", 503);
  }
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return jsonError("يلزم تسجيل الدخول.", 401);
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return jsonError("تعذّر التحقق من مصدر الطلب.", 403);
  try {
    if (new URL(origin).host !== host) return jsonError("مصدر الطلب غير مسموح.", 403);
  } catch {
    return jsonError("مصدر الطلب غير صالح.", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("صيغة البيانات غير صالحة.", 400);
  }

  if (!body || typeof body !== "object") {
    return jsonError("بيانات الإعدادات غير صالحة.", 400);
  }

  const values = body as Record<string, unknown>;
  const fields = [
    "storeName",
    "defaultHashtags",
    "facebookPageId",
    "instagramAccountId",
    "snapchatClientId",
  ] as const;

  for (const field of fields) {
    if (typeof values[field] !== "string") {
      return jsonError("تحققي من تعبئة جميع حقول الإعدادات بنصوص صالحة.", 400);
    }
  }

  const data = {
    storeName: (values.storeName as string).trim(),
    defaultHashtags: (values.defaultHashtags as string).trim(),
    facebookPageId: (values.facebookPageId as string).trim(),
    instagramAccountId: (values.instagramAccountId as string).trim(),
    snapchatClientId: (values.snapchatClientId as string).trim(),
  };
  const snapchatToken = values.snapchatToken;
  const metaAccessToken = values.metaAccessToken;
  if (
    (snapchatToken !== undefined && typeof snapchatToken !== "string") ||
    (metaAccessToken !== undefined && typeof metaAccessToken !== "string")
  ) {
    return jsonError("رموز الوصول يجب أن تكون نصوصاً صالحة.", 400);
  }
  const trimmedSnapchatToken = typeof snapchatToken === "string" ? snapchatToken.trim() : "";
  const trimmedMetaAccessToken = typeof metaAccessToken === "string" ? metaAccessToken.trim() : "";

  if (!data.storeName || data.storeName.length > 80) {
    return jsonError("اسم المتجر مطلوب ويجب ألا يتجاوز 80 حرفاً.", 400);
  }
  if (data.defaultHashtags.length > 1000) {
    return jsonError("الوسوم الافتراضية يجب ألا تتجاوز 1000 حرف.", 400);
  }
  if (
    data.facebookPageId.length > 255 ||
    data.instagramAccountId.length > 255 ||
    data.snapchatClientId.length > 255
  ) {
    return jsonError("معرّف الحساب أطول من الحد المسموح.", 400);
  }
  if (trimmedSnapchatToken.length > 10000) {
    return jsonError("رمز الوصول أطول من الحد المسموح.", 400);
  }
  if (trimmedMetaAccessToken.length > 10000) {
    return jsonError("رمز وصول Meta أطول من الحد المسموح.", 400);
  }

  let encryptedMetaAccessToken: string | undefined;
  if (trimmedMetaAccessToken) {
    try {
      encryptedMetaAccessToken = encryptMetaToken(trimmedMetaAccessToken);
    } catch {
      return jsonError("إعداد تشفير رمز Meta غير مكتمل على الخادم.", 503);
    }
  }

  try {
    const settings = await prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        ...data,
        ...(trimmedSnapchatToken ? { snapchatToken: trimmedSnapchatToken } : {}),
        ...(encryptedMetaAccessToken ? { metaAccessTokenEncrypted: encryptedMetaAccessToken } : {}),
      },
      update: {
        ...data,
        ...(trimmedSnapchatToken ? { snapchatToken: trimmedSnapchatToken } : {}),
        ...(encryptedMetaAccessToken ? { metaAccessTokenEncrypted: encryptedMetaAccessToken } : {}),
      },
      select: {
        storeName: true,
        defaultHashtags: true,
        facebookPageId: true,
        instagramAccountId: true,
        youtubeChannelId: true,
        youtubeChannelTitle: true,
        youtubeRefreshToken: true,
        tiktokDisplayName: true,
        tiktokRefreshToken: true,
        snapchatClientId: true,
        snapchatToken: true,
        metaAccessTokenEncrypted: true,
        updatedAt: true,
      },
    });

    const {
      youtubeRefreshToken,
      tiktokRefreshToken,
      snapchatToken,
      metaAccessTokenEncrypted,
      ...publicSettings
    } = settings;
    return NextResponse.json({
      ...publicSettings,
      youtubeConnected: Boolean(youtubeRefreshToken),
      tiktokConnected: Boolean(tiktokRefreshToken),
      snapchatTokenConfigured: Boolean(snapchatToken),
      metaAccessTokenConfigured: Boolean(metaAccessTokenEncrypted),
      metaAccessTokenUpdated: Boolean(encryptedMetaAccessToken),
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("تعذّر حفظ الإعدادات في قاعدة البيانات.", 503);
  }
}
