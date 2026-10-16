import { PostStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { decryptMetaToken } from "@/lib/meta-token";
import { MetaGraphError, publishFacebookPost, publishInstagramPost } from "@/lib/meta-graph";
import { downloadCloudinaryVideo, uploadYouTubeVideo, YouTubeUploadError } from "@/lib/youtube";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Platform = "facebook" | "instagram" | "youtube";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
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
  youtubeStatus: PostStatus | null;
  youtubeTitle: string;
  youtubeDescription: string;
  youtubeTags: unknown;
  youtubePrivacyStatus: string;
  youtubeVideoId: string | null;
  youtubeVideoUrl: string | null;
  youtubeError: string | null;
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
    youtubeTags: Array.isArray(post.youtubeTags)
      ? post.youtubeTags.filter((tag): tag is string => typeof tag === "string")
      : [],
    youtubePrivacyStatus: post.youtubePrivacyStatus === "public" ? "public" as const : "unlisted" as const,
    createdAt: post.createdAt.toISOString(),
  };
}

function isRetryable(status: PostStatus | null) {
  return status === null || status === PostStatus.PENDING || status === PostStatus.FAILED;
}

function currentStatus(post: {
  platforms: unknown;
  facebookStatus: PostStatus | null;
  instagramStatus: PostStatus | null;
  youtubeStatus: PostStatus | null;
}) {
  const platforms = Array.isArray(post.platforms)
    ? post.platforms.filter((platform): platform is string => typeof platform === "string")
    : [];
  const statuses = platforms.flatMap((platform) => {
    if (platform === "facebook") return post.facebookStatus ? [post.facebookStatus] : [];
    if (platform === "instagram") return post.instagramStatus ? [post.instagramStatus] : [];
    if (platform === "youtube") return post.youtubeStatus ? [post.youtubeStatus] : [];
    return [];
  });
  if (statuses.includes(PostStatus.PUBLISHING)) return PostStatus.PUBLISHING;
  if (statuses.includes(PostStatus.FAILED)) return PostStatus.FAILED;
  if (statuses.includes(PostStatus.UNKNOWN)) return PostStatus.UNKNOWN;
  const hasUnsupportedPlatform = platforms.some(
    (platform) => platform !== "facebook" && platform !== "instagram" && platform !== "youtube",
  );
  if (hasUnsupportedPlatform || statuses.length !== platforms.length) return PostStatus.PENDING;
  return PostStatus.PUBLISHED;
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
    post = await prisma.post.findUnique({ where: { id: postId } });
  } catch {
    return jsonError("تعذّر تحميل المنشور من قاعدة البيانات.", 503);
  }
  if (!post) return jsonError("المنشور غير موجود.", 404);

  const platforms = Array.isArray(post.platforms)
    ? post.platforms.filter((platform): platform is string => typeof platform === "string")
    : [];
  const targets = [...new Set(platforms.filter(
    (platform): platform is Platform =>
      platform === "facebook" || platform === "instagram" || platform === "youtube",
  ))];
  if (targets.length === 0) {
    return jsonError("لا يحتوي المنشور على منصة مدعومة للنشر المباشر.", 400);
  }
  if (post.status === PostStatus.PUBLISHING) {
    return jsonError("النشر قيد التنفيذ بالفعل.", 409);
  }

  const pendingTargets = targets.filter((platform) => isRetryable(
    platform === "facebook"
      ? post.facebookStatus
      : platform === "instagram" ? post.instagramStatus : post.youtubeStatus,
  ));
  if (pendingTargets.length === 0) {
    return NextResponse.json({ post: toSavedPost(post) }, { headers: { "Cache-Control": "no-store" } });
  }

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
    return jsonError("تعذّر تحميل إعدادات حسابات النشر.", 503);
  }

  let accessToken: string | undefined;
  let metaConfigurationError: string | undefined;
  if (pendingTargets.some((platform) => platform === "facebook" || platform === "instagram")) {
    try {
      if (!settings?.metaAccessTokenEncrypted) {
        throw new Error("احفظي Meta Page Access Token في إعدادات المتجر قبل النشر.");
      }
      accessToken = decryptMetaToken(settings.metaAccessTokenEncrypted);
    } catch (error) {
      metaConfigurationError = sanitizeError(error);
    }
  }

  const claimWhere = {
    id: post.id,
    status: { not: PostStatus.PUBLISHING },
    OR: [
      ...(pendingTargets.includes("facebook")
        ? [{ facebookStatus: { in: [PostStatus.PENDING, PostStatus.FAILED] } }, { facebookStatus: null }]
        : []),
      ...(pendingTargets.includes("instagram")
        ? [{ instagramStatus: { in: [PostStatus.PENDING, PostStatus.FAILED] } }, { instagramStatus: null }]
        : []),
      ...(pendingTargets.includes("youtube")
        ? [{ youtubeStatus: { in: [PostStatus.PENDING, PostStatus.FAILED] } }, { youtubeStatus: null }]
        : []),
    ],
  };
  const claimData = {
    status: PostStatus.PUBLISHING,
    ...(pendingTargets.includes("facebook")
      ? { facebookStatus: PostStatus.PUBLISHING, facebookError: null }
      : {}),
    ...(pendingTargets.includes("instagram")
      ? { instagramStatus: PostStatus.PUBLISHING, instagramError: null }
      : {}),
    ...(pendingTargets.includes("youtube")
      ? { youtubeStatus: PostStatus.PUBLISHING, youtubeError: null }
      : {}),
  };

  try {
    const claim = await prisma.post.updateMany({ where: claimWhere, data: claimData });
    if (claim.count !== 1) return jsonError("النشر قيد التنفيذ أو لا توجد منصة قابلة لإعادة المحاولة.", 409);
  } catch {
    return jsonError("تعذّر بدء النشر في قاعدة البيانات.", 503);
  }

  const metaSettings = {
    accessToken: accessToken ?? "",
    facebookPageId: settings?.facebookPageId ?? "",
    instagramAccountId: settings?.instagramAccountId ?? "",
  };
  const metaInput = {
    caption: post.caption,
    mediaUrl: post.mediaUrl,
    mediaType: post.mediaType === "video" ? "video" as const : "image" as const,
  };

  const results = await Promise.allSettled(pendingTargets.map(async (platform) => {
    let publishedId: string;
    try {
      if (platform === "youtube") {
        if (post.mediaType !== "video") throw new Error("YouTube publishing requires a video.");
        if (!post.youtubeTitle.trim()) throw new Error("YouTube video title is missing.");
        const media = await downloadCloudinaryVideo(post.mediaUrl);
        const uploaded = await uploadYouTubeVideo({
          ...media,
          title: post.youtubeTitle,
          description: post.youtubeDescription,
          tags: Array.isArray(post.youtubeTags)
            ? post.youtubeTags.filter((tag): tag is string => typeof tag === "string")
            : [],
          privacyStatus: post.youtubePrivacyStatus === "public" ? "public" : "unlisted",
        });
        await prisma.post.update({
          where: { id: post.id },
          data: {
            youtubeStatus: PostStatus.PUBLISHED,
            youtubeVideoId: uploaded.videoId,
            youtubeVideoUrl: uploaded.url,
            youtubeError: null,
          },
        });
        return { platform, postId: uploaded.videoId, url: uploaded.url };
      }

      if (metaConfigurationError) throw new Error(metaConfigurationError);
      publishedId = platform === "facebook"
        ? await publishFacebookPost(metaSettings, metaInput)
        : await publishInstagramPost(metaSettings, metaInput);
    } catch (error) {
      const unknown = platform === "youtube"
        ? error instanceof YouTubeUploadError && error.outcomeUnknown
        : error instanceof MetaGraphError && error.outcomeUnknown;
      const message = sanitizeError(error, accessToken);
      await prisma.post.update({
        where: { id: post.id },
        data: platform === "youtube"
          ? { youtubeStatus: unknown ? PostStatus.UNKNOWN : PostStatus.FAILED, youtubeError: message }
          : platform === "facebook"
            ? { facebookStatus: unknown ? PostStatus.UNKNOWN : PostStatus.FAILED, facebookError: message }
            : { instagramStatus: unknown ? PostStatus.UNKNOWN : PostStatus.FAILED, instagramError: message },
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
  }));

  if (results.some((result) => result.status === "rejected")) {
    const message = "قد يكون قد تم النشر، لكن تعذّر حفظ النتيجة. تحققي من المنصة قبل إعادة المحاولة.";
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

  const fulfilledResults = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const hasFailures = fulfilledResults.some((result) => "error" in result);
  try {
    const updatedPost = await prisma.post.update({
      where: { id: post.id },
      data: {
        status: currentStatus(await prisma.post.findUniqueOrThrow({
          where: { id: post.id },
          select: {
            platforms: true,
            facebookStatus: true,
            instagramStatus: true,
            youtubeStatus: true,
          },
        })),
      },
    });
    return NextResponse.json({
      post: toSavedPost(updatedPost),
      results: fulfilledResults,
      ...(hasFailures ? { error: "تعذّر النشر على منصة واحدة أو أكثر." } : {}),
    }, {
      status: hasFailures ? 502 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("تعذّر حفظ نتيجة النشر في قاعدة البيانات.", 503);
  }
}
