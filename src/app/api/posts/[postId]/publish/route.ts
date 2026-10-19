import { PostStatus } from "@prisma/client";
import { after, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { decryptMetaToken } from "@/lib/meta-token";
import { MetaGraphError, publishFacebookPost, publishInstagramPost } from "@/lib/meta-graph";
import { downloadCloudinaryVideo, uploadYouTubeVideo, YouTubeUploadError } from "@/lib/youtube";
import { TikTokPublishError, uploadTikTokVideo } from "@/lib/tiktok";
import { publishSnapchatContent, SnapchatPublishError } from "@/lib/snapchat";
import { prisma } from "@/lib/prisma";
import { FACEBOOK_PAGE_ID } from "@/constants/socials";
import { cloudinary } from "@/lib/cloudinary";
import { mimeTypeFromCloudinaryResource, validatePlatformMedia } from "@/lib/platform-rules";
import { getPlatformMediaUrl, verifyPlatformMediaDerivative } from "@/lib/media-transformations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Platform = "facebook" | "instagram" | "tiktok" | "youtube" | "snapchat";

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

async function assertPlatformMediaValid(
  post: {
    cloudinaryPublicId: string;
    mediaType: string;
    mediaTransformMode: string;
    snapchatContentType: string;
  },
  platform: Platform,
) {
  const mediaType = post.mediaType === "video" ? "video" : "image";
  const resource = await cloudinary.api.resource(post.cloudinaryPublicId, {
    resource_type: mediaType,
  });
  if (typeof resource.bytes !== "number" || !Number.isSafeInteger(resource.bytes) || resource.bytes <= 0) {
    throw new Error(`${platform}: تعذّر التحقق من حجم الوسائط.`);
  }
  const mimeType = mimeTypeFromCloudinaryResource(resource.resource_type, resource.format);
  if (!mimeType) throw new Error(`${platform}: صيغة الملف المحفوظ غير مدعومة.`);
  if (!resource.secure_url.startsWith("https://res.cloudinary.com/")) {
    throw new Error(`${platform}: رابط الوسائط الآمن من Cloudinary غير صالح.`);
  }

  const validation = validatePlatformMedia({
    mimeType,
    fileSize: resource.bytes,
    platforms: [platform],
    width: resource.width,
    height: resource.height,
    durationSeconds: resource.duration,
    snapchatContentType: post.snapchatContentType === "SPOTLIGHT" ? "SPOTLIGHT" : "STORY",
    sourceAsset: true,
    allowPendingVideoDuration: mediaType === "video" &&
      !(typeof resource.duration === "number" &&
        Number.isFinite(resource.duration) &&
        resource.duration > 0) &&
      resource.secure_url.startsWith("https://res.cloudinary.com/"),
  });
  const issues = [...validation.errors, ...validation.pending];
  if (issues.length > 0) throw new Error(issues.join(" "));
  return {
    mimeType,
    fileSize: resource.bytes,
    originalUrl: resource.secure_url,
  };
}

function toSavedPost(post: {
  id: string;
  caption: string;
  mediaUrl: string;
  cloudinaryPublicId: string;
  mediaType: string;
  mediaTransformMode: string;
  platforms: unknown;
  status: PostStatus;
  facebookStatus: PostStatus | null;
  instagramStatus: PostStatus | null;
  tiktokStatus: PostStatus | null;
  youtubeStatus: PostStatus | null;
  snapchatStatus: PostStatus | null;
  snapchatContentType: string;
  snapchatStoryTtl: string;
  snapchatDescription: string;
  snapchatLink: string;
  snapchatMediaId: string | null;
  snapchatRequestId: string | null;
  snapchatStoryId: string | null;
  snapchatSpotlightId: string | null;
  snapchatError: string | null;
  youtubeTitle: string;
  youtubeDescription: string;
  youtubeTags: unknown;
  youtubePrivacyStatus: string;
  youtubeVideoId: string | null;
  youtubeVideoUrl: string | null;
  youtubeError: string | null;
  facebookError: string | null;
  instagramError: string | null;
  tiktokPublishId: string | null;
  tiktokVideoId: string | null;
  tiktokVideoUrl: string | null;
  tiktokError: string | null;
  tiktokPrivacyLevel: string;
  createdAt: Date;
}) {
  return {
    ...post,
    mediaType: post.mediaType === "video" ? "video" as const : "image" as const,
    mediaTransformMode: post.mediaTransformMode === "CROP" ? "CROP" as const : "FIT" as const,
    platforms: Array.isArray(post.platforms)
      ? post.platforms.filter((platform): platform is string => typeof platform === "string")
      : [],
    snapchatContentType: post.snapchatContentType === "SPOTLIGHT" ? "SPOTLIGHT" as const : "STORY" as const,
    snapchatStoryTtl: post.snapchatStoryTtl,
    youtubeTags: Array.isArray(post.youtubeTags)
      ? post.youtubeTags.filter((tag): tag is string => typeof tag === "string")
      : [],
    youtubePrivacyStatus: post.youtubePrivacyStatus === "public" ? "public" as const : "unlisted" as const,
    tiktokPrivacyLevel: post.tiktokPrivacyLevel,
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
  tiktokStatus: PostStatus | null;
  youtubeStatus: PostStatus | null;
  snapchatStatus: PostStatus | null;
}) {
  const platforms = Array.isArray(post.platforms)
    ? post.platforms.filter((platform): platform is string => typeof platform === "string")
    : [];
  const statuses = platforms.flatMap((platform) => {
    if (platform === "facebook") return post.facebookStatus ? [post.facebookStatus] : [];
    if (platform === "instagram") return post.instagramStatus ? [post.instagramStatus] : [];
    if (platform === "tiktok") return post.tiktokStatus ? [post.tiktokStatus] : [];
    if (platform === "youtube") return post.youtubeStatus ? [post.youtubeStatus] : [];
    if (platform === "snapchat") return post.snapchatStatus ? [post.snapchatStatus] : [];
    return [];
  });
  if (statuses.includes(PostStatus.PUBLISHING)) return PostStatus.PUBLISHING;
  if (statuses.includes(PostStatus.FAILED)) return PostStatus.FAILED;
  if (statuses.includes(PostStatus.UNKNOWN)) return PostStatus.UNKNOWN;
  const hasUnsupportedPlatform = platforms.some(
    (platform) => platform !== "facebook" && platform !== "instagram" &&
      platform !== "tiktok" && platform !== "youtube" && platform !== "snapchat",
  );
  if (hasUnsupportedPlatform || statuses.length !== platforms.length) return PostStatus.PENDING;
  return PostStatus.PUBLISHED;
}

async function refreshPostStatus(postId: string) {
  const post = await prisma.post.findUniqueOrThrow({
    where: { id: postId },
    select: {
      status: true,
      platforms: true,
      facebookStatus: true,
      instagramStatus: true,
      tiktokStatus: true,
      youtubeStatus: true,
      snapchatStatus: true,
    },
  });
  const status = currentStatus(post);
  if (post.status === status) return;
  await prisma.post.update({
    where: { id: postId },
    data: { status },
  });
}

function platformStatusUpdate(
  platform: Platform,
  status: PostStatus,
  error: string,
  publishId?: string,
) {
  if (platform === "facebook") {
    return { facebookStatus: status, facebookError: error, ...(publishId ? { facebookPostId: publishId } : {}) };
  }
  if (platform === "instagram") {
    return { instagramStatus: status, instagramError: error, ...(publishId ? { instagramPostId: publishId } : {}) };
  }
  if (platform === "tiktok") {
    return {
      tiktokStatus: status,
      tiktokError: error,
      ...(publishId ? { tiktokPublishId: publishId } : {}),
    };
  }
  if (platform === "youtube") {
    return { youtubeStatus: status, youtubeError: error };
  }
  return { snapchatStatus: status, snapchatError: error };
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/posts/[postId]/publish">,
) {
  if (!(await isAdminAuthenticated())) return jsonError("يلزم تسجيل الدخول.", 401);
  const { postId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return jsonError("معرّف المنشور غير صالح.", 400);
  try {
    let storedPost = await prisma.post.findUnique({ where: { id: postId } });
    if (!storedPost) return jsonError("المنشور غير موجود.", 404);
    const staleBefore = new Date(Date.now() - 6 * 60_000);
    if (
      storedPost.status === PostStatus.PUBLISHING &&
      storedPost.publishingStartedAt &&
      storedPost.publishingStartedAt <= staleBefore
    ) {
      const staleMessage = "انتهت مهلة مهمة النشر دون تسجيل نتيجة. تحققي من المنصة قبل أي إعادة نشر.";
      await prisma.post.updateMany({
        where: {
          id: postId,
          status: PostStatus.PUBLISHING,
          publishingStartedAt: { lte: staleBefore },
        },
        data: {
          ...(storedPost.facebookStatus === PostStatus.PUBLISHING
            ? { facebookStatus: PostStatus.UNKNOWN, facebookError: staleMessage }
            : {}),
          ...(storedPost.instagramStatus === PostStatus.PUBLISHING
            ? { instagramStatus: PostStatus.UNKNOWN, instagramError: staleMessage }
            : {}),
          ...(storedPost.tiktokStatus === PostStatus.PUBLISHING && !storedPost.tiktokPublishId
            ? { tiktokStatus: PostStatus.UNKNOWN, tiktokError: staleMessage }
            : {}),
          ...(storedPost.youtubeStatus === PostStatus.PUBLISHING
            ? { youtubeStatus: PostStatus.UNKNOWN, youtubeError: staleMessage }
            : {}),
          ...(storedPost.snapchatStatus === PostStatus.PUBLISHING
            ? { snapchatStatus: PostStatus.UNKNOWN, snapchatError: staleMessage }
            : {}),
        },
      });
      storedPost = await prisma.post.findUnique({ where: { id: postId } });
      if (!storedPost) return jsonError("المنشور غير موجود.", 404);
    }
    await refreshPostStatus(postId);
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    return NextResponse.json(
      { post: toSavedPost(post) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return jsonError("تعذّر تحميل حالة المنشور.", 503);
  }
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
      platform === "facebook" || platform === "instagram" ||
      platform === "tiktok" || platform === "youtube" || platform === "snapchat",
  ))];
  if (targets.length === 0) {
    return jsonError("لا يحتوي المنشور على منصة مدعومة للنشر المباشر.", 400);
  }
  const requestedPlatform = new URL(request.url).searchParams.get("platform");
  if (requestedPlatform && !targets.includes(requestedPlatform as Platform)) {
    return jsonError("المنصة المطلوبة غير موجودة ضمن هذا المنشور.", 400);
  }

  const eligibleTargets = targets.filter((platform) => isRetryable(
    platform === "facebook"
      ? post.facebookStatus
      : platform === "instagram" ? post.instagramStatus
      : platform === "tiktok" ? post.tiktokStatus
      : platform === "youtube" ? post.youtubeStatus : post.snapchatStatus,
  ));
  const pendingTargets = requestedPlatform
    ? eligibleTargets.filter((platform) => platform === requestedPlatform)
    : eligibleTargets;
  if (pendingTargets.length === 0) {
    if (requestedPlatform) return jsonError("لا توجد محاولة فاشلة أو معلّقة لإعادة تشغيلها لهذه المنصة.", 409);
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
        throw new Error("احفظي Meta System User Access Token في إعدادات المتجر قبل النشر.");
      }
      accessToken = decryptMetaToken(settings.metaAccessTokenEncrypted);
    } catch (error) {
      metaConfigurationError = sanitizeError(error);
    }
  }

  const claimedTargets: Platform[] = [];
  try {
    for (const platform of pendingTargets) {
      const claim = platform === "facebook"
        ? await prisma.post.updateMany({
            where: { id: post.id, OR: [
              { facebookStatus: { in: [PostStatus.PENDING, PostStatus.FAILED] } },
              { facebookStatus: null },
            ] },
            data: {
              status: PostStatus.PUBLISHING,
              publishingStartedAt: new Date(),
              facebookStatus: PostStatus.PUBLISHING,
              facebookError: null,
            },
          })
        : platform === "instagram"
          ? await prisma.post.updateMany({
              where: { id: post.id, OR: [
                { instagramStatus: { in: [PostStatus.PENDING, PostStatus.FAILED] } },
                { instagramStatus: null },
              ] },
              data: {
                status: PostStatus.PUBLISHING,
                publishingStartedAt: new Date(),
                instagramStatus: PostStatus.PUBLISHING,
                instagramError: null,
              },
            })
          : platform === "tiktok"
            ? await prisma.post.updateMany({
                where: { id: post.id, OR: [
                  { tiktokStatus: { in: [PostStatus.PENDING, PostStatus.FAILED] } },
                  { tiktokStatus: null },
                ] },
                data: {
                  status: PostStatus.PUBLISHING,
                  publishingStartedAt: new Date(),
                  tiktokStatus: PostStatus.PUBLISHING,
                  tiktokError: null,
                },
              })
            : platform === "youtube"
              ? await prisma.post.updateMany({
                  where: { id: post.id, OR: [
                    { youtubeStatus: { in: [PostStatus.PENDING, PostStatus.FAILED] } },
                    { youtubeStatus: null },
                  ] },
                  data: {
                    status: PostStatus.PUBLISHING,
                    publishingStartedAt: new Date(),
                    youtubeStatus: PostStatus.PUBLISHING,
                    youtubeError: null,
                  },
                })
              : await prisma.post.updateMany({
                  where: { id: post.id, OR: [
                    { snapchatStatus: { in: [PostStatus.PENDING, PostStatus.FAILED] } },
                    { snapchatStatus: null },
                  ] },
                  data: {
                    status: PostStatus.PUBLISHING,
                    publishingStartedAt: new Date(),
                    snapchatStatus: PostStatus.PUBLISHING,
                    snapchatError: null,
                  },
                });
      if (claim.count === 1) claimedTargets.push(platform);
    }
  } catch {
    return jsonError("تعذّر بدء مهام النشر في قاعدة البيانات.", 503);
  }
  if (claimedTargets.length === 0) {
    return jsonError("مهام هذه المنصات قيد التنفيذ بالفعل أو لا توجد محاولة قابلة لإعادة التشغيل.", 409);
  }

  const metaSettings = {
    accessToken: accessToken ?? "",
    facebookPageId: settings?.facebookPageId || FACEBOOK_PAGE_ID,
    instagramAccountId: settings?.instagramAccountId ?? "",
  };
  const metaInput = {
    caption: post.caption,
    mediaUrl: post.mediaUrl,
    mediaType: post.mediaType === "video" ? "video" as const : "image" as const,
  };

  const processPlatform = async (platform: Platform) => {
    let publishedId: string;
    try {
      const sourceMedia = await assertPlatformMediaValid(post, platform);
      const deliveryInput = {
        platform,
        publicId: post.cloudinaryPublicId,
        originalUrl: sourceMedia.originalUrl,
        mediaType: post.mediaType === "video" ? "video" : "image",
        mimeType: sourceMedia.mimeType,
        fileSize: sourceMedia.fileSize,
        transformMode: post.mediaTransformMode === "CROP" ? "CROP" : "FIT",
      } as const;
      const mediaUrl = getPlatformMediaUrl(deliveryInput);
      await verifyPlatformMediaDerivative(deliveryInput, mediaUrl);

      if (platform === "youtube") {
        if (post.mediaType !== "video") throw new Error("YouTube publishing requires a video.");
        if (!post.youtubeTitle.trim()) throw new Error("YouTube video title is missing.");
        const media = await downloadCloudinaryVideo(mediaUrl);
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

      if (platform === "tiktok") {
        if (post.mediaType !== "video") throw new Error("TikTok publishing requires a video.");
        if (post.caption.length > 2200) {
          throw new Error("TikTok captions cannot exceed 2,200 characters.");
        }
        const uploaded = await uploadTikTokVideo({
          mediaUrl,
          mediaPublicId: post.cloudinaryPublicId,
          caption: post.caption,
          privacyLevel: post.tiktokPrivacyLevel,
        });
        try {
          await prisma.post.update({
            where: { id: post.id },
            data: {
              tiktokStatus: PostStatus.PUBLISHING,
              tiktokPublishId: uploaded.publishId,
              tiktokError: null,
            },
          });
        } catch {
          throw new TikTokPublishError(
            "TikTok accepted the video, but its publish ID could not be saved. Check TikTok before retrying.",
            true,
            uploaded.publishId,
          );
        }
        return { platform, publishId: uploaded.publishId };
      }

      if (platform === "snapchat") {
        const uploaded = await publishSnapchatContent({
          mediaUrl,
          mediaPublicId: post.cloudinaryPublicId,
          mediaType: post.mediaType === "video" ? "video" : "image",
          contentType: post.snapchatContentType === "SPOTLIGHT" ? "SPOTLIGHT" : "STORY",
          description: post.snapchatDescription,
          storyTtl: post.snapchatStoryTtl === "TWO_DAYS" ||
            post.snapchatStoryTtl === "THREE_DAYS" || post.snapchatStoryTtl === "ONE_WEEK"
            ? post.snapchatStoryTtl
            : "ONE_DAY",
          link: post.snapchatLink,
        });
        await prisma.post.update({
          where: { id: post.id },
          data: {
            snapchatStatus: PostStatus.PUBLISHED,
            snapchatMediaId: uploaded.mediaId,
            snapchatRequestId: uploaded.requestId ?? null,
            snapchatStoryId: null,
            snapchatSpotlightId: uploaded.spotlightId,
            snapchatError: null,
          },
        }).catch(() => {
          throw new SnapchatPublishError(
            "Snapchat accepted the content, but its result could not be saved. Check Snapchat before retrying.",
            true,
          );
        });
        return {
          platform,
          postId: uploaded.spotlightId ?? uploaded.requestId ?? uploaded.mediaId,
        };
      }

      if (metaConfigurationError) throw new Error(metaConfigurationError);
      publishedId = platform === "facebook"
        ? await publishFacebookPost(metaSettings, { ...metaInput, mediaUrl })
        : await publishInstagramPost(metaSettings, { ...metaInput, mediaUrl });
    } catch (error) {
      const unknown = platform === "youtube"
        ? error instanceof YouTubeUploadError && error.outcomeUnknown
        : platform === "tiktok"
          ? error instanceof TikTokPublishError && error.outcomeUnknown
          : platform === "snapchat"
            ? error instanceof SnapchatPublishError && error.outcomeUnknown
            : error instanceof MetaGraphError && error.outcomeUnknown;
      const upstreamFailure = platform === "facebook" || platform === "instagram"
        ? error instanceof MetaGraphError && error.upstreamFailure
        : unknown;
      const message = sanitizeError(error, accessToken);
      await prisma.post.update({
        where: { id: post.id },
        data: platform === "youtube"
          ? { youtubeStatus: unknown ? PostStatus.UNKNOWN : PostStatus.FAILED, youtubeError: message }
          : platform === "tiktok"
            ? {
                tiktokStatus: unknown ? PostStatus.UNKNOWN : PostStatus.FAILED,
                tiktokError: message,
                ...(error instanceof TikTokPublishError && error.publishId
                  ? { tiktokPublishId: error.publishId }
                  : {}),
              }
          : platform === "snapchat"
            ? {
                snapchatStatus: unknown ? PostStatus.UNKNOWN : PostStatus.FAILED,
                snapchatError: message,
              }
          : platform === "facebook"
            ? { facebookStatus: unknown ? PostStatus.UNKNOWN : PostStatus.FAILED, facebookError: message }
            : { instagramStatus: unknown ? PostStatus.UNKNOWN : PostStatus.FAILED, instagramError: message },
      });
      return { platform, error: message, upstreamFailure };
    }

    await prisma.post.update({
      where: { id: post.id },
      data: platform === "facebook"
        ? { facebookStatus: PostStatus.PUBLISHED, facebookPostId: publishedId, facebookError: null }
        : { instagramStatus: PostStatus.PUBLISHED, instagramPostId: publishedId, instagramError: null },
    });
    return { platform, postId: publishedId };
  };

  for (const platform of claimedTargets) {
    after(async () => {
      try {
        await processPlatform(platform);
      } catch {
        try {
          await prisma.post.update({
            where: { id: post.id },
            data: platformStatusUpdate(
              platform,
              PostStatus.UNKNOWN,
              "تعذّر حفظ نتيجة مهمة النشر. تحققي من المنصة قبل إعادة المحاولة.",
            ),
          });
        } catch (persistenceError) {
          console.error("Failed to persist isolated publishing task state.", {
            postId: post.id,
            platform,
            error: persistenceError instanceof Error ? persistenceError.message : "unknown",
          });
        }
      } finally {
        try {
          await refreshPostStatus(post.id);
        } catch (statusError) {
          console.error("Failed to refresh post publishing status.", {
            postId: post.id,
            platform,
            error: statusError instanceof Error ? statusError.message : "unknown",
          });
        }
      }
    });
  }

  try {
    const queuedPost = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    return NextResponse.json(
      { post: toSavedPost(queuedPost), queuedPlatforms: claimedTargets },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return jsonError("بدأت مهام النشر، لكن تعذّر تحميل حالتها الأولية.", 503);
  }
}
