import { PostStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { decryptMetaToken } from "@/lib/meta-token";
import { MetaGraphError, publishFacebookPost, publishInstagramPost } from "@/lib/meta-graph";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Platform = "facebook" | "instagram";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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

function sanitizeError(error: unknown, accessToken?: string) {
  const message = error instanceof Error ? error.message : "تعذّر النشر على المنصة.";
  return message.replaceAll(accessToken ?? "\0", "[محجوب]").slice(0, 1000);
}

function toSavedPost(post: {
  id: string;
  caption: string;
  mediaUrl: string;
  cloudinaryPublicId: string;
  mediaType: string;
  platforms: unknown;
  status: PostStatus;
  facebookStatus: PostStatus | null;
  instagramStatus: PostStatus | null;
  facebookError: string | null;
  instagramError: string | null;
  createdAt: Date;
}) {
  return {
    ...post,
    mediaType: post.mediaType === "video" ? "video" as const : "image" as const,
    platforms: Array.isArray(post.platforms)
      ? post.platforms.filter((platform): platform is string => typeof platform === "string")
      : [],
    createdAt: post.createdAt.toISOString(),
  };
}

async function setConfigurationFailure(
  postId: string,
  retryablePlatforms: Platform[],
  message: string,
) {
  const data = {
    status: PostStatus.FAILED,
    ...(retryablePlatforms.includes("facebook")
      ? { facebookStatus: PostStatus.FAILED, facebookError: message }
      : {}),
    ...(retryablePlatforms.includes("instagram")
      ? { instagramStatus: PostStatus.FAILED, instagramError: message }
      : {}),
  };
  await prisma.post.update({ where: { id: postId }, data });
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/posts/[postId]/publish">,
) {
  if (!(await isAdminAuthenticated())) return jsonError("يلزم تسجيل الدخول.", 401);
  if (!originIsValid(request)) return jsonError("مصدر الطلب غير مسموح.", 403);

  const { postId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return jsonError("معرّف المنشور غير صالح.", 400);

  let post;
  try {
    post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        caption: true,
        mediaUrl: true,
        cloudinaryPublicId: true,
        mediaType: true,
        platforms: true,
        status: true,
        facebookStatus: true,
        instagramStatus: true,
        facebookPostId: true,
        instagramPostId: true,
        facebookError: true,
        instagramError: true,
        createdAt: true,
      },
    });
  } catch {
    return jsonError("تعذّر تحميل المنشور من قاعدة البيانات.", 503);
  }
  if (!post) return jsonError("المنشور غير موجود.", 404);

  const selectedPlatforms = Array.isArray(post.platforms)
    ? post.platforms.filter((platform): platform is Platform => platform === "facebook" || platform === "instagram")
    : [];
  const targets = [...new Set(selectedPlatforms)];
  if (targets.length === 0) return jsonError("لا يحتوي المنشور على منصة Meta قابلة للنشر.", 400);
  if (post.status === PostStatus.PUBLISHING) return jsonError("النشر قيد التنفيذ بالفعل.", 409);

  let settings;
  try {
    settings = await prisma.settings.findUnique({
      where: { id: "store" },
      select: {
        facebookPageId: true,
        instagramAccountId: true,
        metaAccessTokenEncrypted: true,
      },
    });
  } catch {
    return jsonError("تعذّر تحميل بيانات ربط Meta.", 503);
  }

  let accessToken: string;
  try {
    if (!settings?.metaAccessTokenEncrypted) {
      throw new Error("احفظي Meta Page Access Token في إعدادات المتجر قبل النشر.");
    }
    accessToken = decryptMetaToken(settings.metaAccessTokenEncrypted);
  } catch (error) {
    const message = sanitizeError(error);
    const retryableTargets = targets.filter((platform) => {
      const status = platform === "facebook" ? post.facebookStatus : post.instagramStatus;
      return status === null || status === PostStatus.PENDING || status === PostStatus.FAILED;
    });
    try {
      if (retryableTargets.length > 0) {
        await setConfigurationFailure(post.id, retryableTargets, message);
      }
    } catch {
      return jsonError("تعذّر حفظ سبب فشل النشر في قاعدة البيانات.", 503);
    }
    try {
      const updated = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
      return NextResponse.json({ error: message, post: toSavedPost(updated) }, { status: 412 });
    } catch {
      return jsonError("تعذّر تحميل حالة المنشور بعد فشل إعداد Meta.", 503);
    }
  }

  if (
    (targets.includes("facebook") && post.facebookStatus === PostStatus.PUBLISHING) ||
    (targets.includes("instagram") && post.instagramStatus === PostStatus.PUBLISHING)
  ) {
    return jsonError("توجد محاولة نشر غير محسومة. تحققي من حسابات Meta قبل إعادة المحاولة.", 409);
  }

  const facebookPending = targets.includes("facebook") &&
    (post.facebookStatus === null || post.facebookStatus === PostStatus.PENDING || post.facebookStatus === PostStatus.FAILED);
  const instagramPending = targets.includes("instagram") &&
    (post.instagramStatus === null || post.instagramStatus === PostStatus.PENDING || post.instagramStatus === PostStatus.FAILED);
  if (!facebookPending && !instagramPending) {
    return NextResponse.json({ post: toSavedPost(post) });
  }

  const claimWhere = {
    id: post.id,
    status: { not: PostStatus.PUBLISHING },
    OR: [
      ...(facebookPending
        ? [{ facebookStatus: { in: [PostStatus.PENDING, PostStatus.FAILED] } }, { facebookStatus: null }]
        : []),
      ...(instagramPending
        ? [{ instagramStatus: { in: [PostStatus.PENDING, PostStatus.FAILED] } }, { instagramStatus: null }]
        : []),
    ],
  };
  const claimData = {
    status: PostStatus.PUBLISHING,
    ...(facebookPending
      ? { facebookStatus: PostStatus.PUBLISHING, facebookError: null }
      : {}),
    ...(instagramPending
      ? { instagramStatus: PostStatus.PUBLISHING, instagramError: null }
      : {}),
  };

  try {
    const claim = await prisma.post.updateMany({ where: claimWhere, data: claimData });
    if (claim.count !== 1) return jsonError("النشر قيد التنفيذ أو لا توجد منصة قابلة لإعادة المحاولة.", 409);
  } catch {
    return jsonError("تعذّر بدء النشر في قاعدة البيانات.", 503);
  }

  const accountSettings = {
    accessToken,
    facebookPageId: settings?.facebookPageId ?? "",
    instagramAccountId: settings?.instagramAccountId ?? "",
  };
  const input = {
    caption: post.caption,
    mediaUrl: post.mediaUrl,
    mediaType: post.mediaType === "video" ? "video" as const : "image" as const,
  };

  const settledResults = await Promise.allSettled(
    targets.map(async (platform) => {
      const previousStatus = platform === "facebook" ? post.facebookStatus : post.instagramStatus;
      if (previousStatus === PostStatus.PUBLISHED) {
        return { platform, postId: platform === "facebook" ? post.facebookPostId : post.instagramPostId };
      }
      if (previousStatus === PostStatus.UNKNOWN) {
        return {
          platform,
          error: platform === "facebook" ? post.facebookError ?? "تحققي من Facebook قبل إعادة المحاولة." : post.instagramError ?? "تحققي من Instagram قبل إعادة المحاولة.",
        };
      }

      let publishedId: string;
      try {
        publishedId = platform === "facebook"
          ? await publishFacebookPost(accountSettings, input)
          : await publishInstagramPost(accountSettings, input);
      } catch (error) {
        const outcomeUnknown = error instanceof MetaGraphError && error.outcomeUnknown;
        const message = outcomeUnknown
          ? `نتيجة النشر غير مؤكدة. تحققي من حساب ${platform === "facebook" ? "Facebook" : "Instagram"} قبل إعادة المحاولة. ${sanitizeError(error, accessToken)}`
          : sanitizeError(error, accessToken);
        const platformStatus = outcomeUnknown ? PostStatus.UNKNOWN : PostStatus.FAILED;
        await prisma.post.update({
          where: { id: post.id },
          data: platform === "facebook"
            ? { facebookStatus: platformStatus, facebookError: message }
            : { instagramStatus: platformStatus, instagramError: message },
        });
        return { platform, error: message };
      }

      await prisma.post.update({
        where: { id: post.id },
        data: platform === "facebook"
          ? { facebookStatus: PostStatus.PUBLISHED, facebookPostId: publishedId, facebookError: null }
          : { instagramStatus: PostStatus.PUBLISHED, instagramPostId: publishedId, instagramError: null },
      });
      return { platform, postId: publishedId };
    }),
  );

  const persistenceFailure = settledResults.some((result) => result.status === "rejected");
  if (persistenceFailure) {
    const message = "قد يكون Meta نشر المحتوى، لكن تعذّر حفظ النتيجة. تحققي من المنصة قبل إعادة المحاولة.";
    try {
      const uncertainPost = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
      return NextResponse.json(
        { error: message, post: toSavedPost(uncertainPost) },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return jsonError(message, 503);
    }
  }
  const results = settledResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );

  let updatedPost: NonNullable<Awaited<ReturnType<typeof prisma.post.findUnique>>>;
  try {
    const resultPost = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    const publishedPlatforms = targets.every((platform) => {
      const status = platform === "facebook" ? resultPost.facebookStatus : resultPost.instagramStatus;
      return status === PostStatus.PUBLISHED;
    });
    const hasUnsupportedPlatform = Array.isArray(post.platforms) &&
      post.platforms.some((platform) => typeof platform === "string" && platform !== "facebook" && platform !== "instagram");
    const nextStatus = publishedPlatforms
      ? hasUnsupportedPlatform ? PostStatus.PENDING : PostStatus.PUBLISHED
      : PostStatus.FAILED;
    updatedPost = await prisma.post.update({
      where: { id: post.id },
      data: { status: nextStatus },
    });
  } catch {
    return jsonError("Meta respondió, pero no se pudo guardar el resultado en la base de datos.", 503);
  }

  const failedResults = results.filter((result) => "error" in result);
  return NextResponse.json({
    post: toSavedPost(updatedPost),
    results,
    ...(failedResults.length ? { error: "تعذّر النشر على منصة واحدة أو أكثر." } : {}),
  }, {
    status: failedResults.length ? 502 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
