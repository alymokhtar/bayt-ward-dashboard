import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_ID = "store";
function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const settings = await prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
      select: {
        storeName: true,
        defaultHashtags: true,
        facebookPageId: true,
        instagramAccountId: true,
        tiktokAccountId: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(settings, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("تعذّر تحميل إعدادات المتجر من قاعدة البيانات.", 503);
  }
}

export async function PUT(request: Request) {
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
    "tiktokAccountId",
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
    tiktokAccountId: (values.tiktokAccountId as string).trim(),
  };

  if (!data.storeName || data.storeName.length > 80) {
    return jsonError("اسم المتجر مطلوب ويجب ألا يتجاوز 80 حرفاً.", 400);
  }
  if (data.defaultHashtags.length > 1000) {
    return jsonError("الوسوم الافتراضية يجب ألا تتجاوز 1000 حرف.", 400);
  }
  if (
    data.facebookPageId.length > 255 ||
    data.instagramAccountId.length > 255 ||
    data.tiktokAccountId.length > 255
  ) {
    return jsonError("معرّف الحساب أطول من الحد المسموح.", 400);
  }

  try {
    const settings = await prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
      select: {
        storeName: true,
        defaultHashtags: true,
        facebookPageId: true,
        instagramAccountId: true,
        tiktokAccountId: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(settings, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("تعذّر حفظ الإعدادات في قاعدة البيانات.", 503);
  }
}
