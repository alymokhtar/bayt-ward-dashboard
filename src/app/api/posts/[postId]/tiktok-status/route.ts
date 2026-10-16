import { PostStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { fetchTikTokPublishStatus } from "@/lib/tiktok";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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

function aggregateStatus(post: {
  platforms: unknown;
  facebookStatus: PostStatus | null;
  instagramStatus: PostStatus | null;
  tiktokStatus: PostStatus | null;
  youtubeStatus: PostStatus | null;
}) {
  const platforms = Array.isArray(post.platforms)
    ? post.platforms.filter((platform): platform is string => typeof platform === "string")
    : [];
  const statuses = platforms.flatMap((platform) => {
    if (platform === "facebook") return post.facebookStatus ? [post.facebookStatus] : [];
    if (platform === "instagram") return post.instagramStatus ? [post.instagramStatus] : [];
    if (platform === "tiktok") return post.tiktokStatus ? [post.tiktokStatus] : [];
    if (platform === "youtube") return post.youtubeStatus ? [post.youtubeStatus] : [];
    return [];
  });
  if (statuses.includes(PostStatus.PUBLISHING)) return PostStatus.PUBLISHING;
  if (statuses.includes(PostStatus.FAILED)) return PostStatus.FAILED;
  if (statuses.includes(PostStatus.UNKNOWN)) return PostStatus.UNKNOWN;
  if (statuses.length !== platforms.length) return PostStatus.PENDING;
  return PostStatus.PUBLISHED;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  if (!(await isAdminAuthenticated())) return jsonError("يلزم تسجيل الدخول.", 401);
  if (!originIsValid(request)) return jsonError("مصدر الطلب غير مسموح.", 403);
  const { postId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return jsonError("معرّف المنشور غير صالح.", 400);

  try {
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return jsonError("المنشور غير موجود.", 404);
    if (!post.tiktokPublishId ||
      (post.tiktokStatus !== PostStatus.PUBLISHING && post.tiktokStatus !== PostStatus.UNKNOWN)) {
      return NextResponse.json({ post }, { headers: { "Cache-Control": "no-store" } });
    }

    const result = await fetchTikTokPublishStatus(post.tiktokPublishId);
    const tiktokStatus = result.status === "PUBLISH_COMPLETE"
      ? PostStatus.PUBLISHED
      : result.status === "FAILED"
        ? PostStatus.FAILED
        : PostStatus.PUBLISHING;
    const updated = await prisma.post.update({
      where: { id: post.id },
      data: {
        tiktokStatus,
        tiktokVideoId: result.videoId ?? post.tiktokVideoId,
        tiktokVideoUrl: result.url ?? post.tiktokVideoUrl,
        tiktokError: tiktokStatus === PostStatus.FAILED
          ? result.error ?? "TikTok could not publish this video."
          : null,
      },
    });
    const status = aggregateStatus(updated);
    const completed = status === updated.status
      ? updated
      : await prisma.post.update({ where: { id: updated.id }, data: { status } });
    return NextResponse.json({ post: completed }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Could not check TikTok publish status.", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return jsonError("تعذّر التحقق من حالة نشر TikTok.", 502);
  }
}
