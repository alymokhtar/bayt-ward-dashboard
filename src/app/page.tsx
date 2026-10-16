import { PostStatus } from "@prisma/client";
import DashboardClient from "./dashboard-client";
import type { SavedPost } from "@/app/actions/create-post";
import { prisma } from "@/lib/prisma";
import { isTikTokPrivacyLevel } from "@/lib/tiktok";

export const dynamic = "force-dynamic";

export default async function Home() {
  let posts: SavedPost[] = [];
  let stats = { total: 0, pending: 0, published: 0 };
  let databaseAvailable = true;

  try {
    const [recentPosts, total, pending, published] = await Promise.all([
      prisma.post.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          caption: true,
          mediaUrl: true,
          cloudinaryPublicId: true,
          platforms: true,
          mediaType: true,
          status: true,
          facebookStatus: true,
          instagramStatus: true,
          tiktokStatus: true,
          youtubeStatus: true,
          youtubeTitle: true,
          youtubeDescription: true,
          youtubeTags: true,
          youtubePrivacyStatus: true,
          youtubeVideoId: true,
          youtubeVideoUrl: true,
          youtubeError: true,
          tiktokPublishId: true,
          tiktokVideoId: true,
          tiktokVideoUrl: true,
          tiktokError: true,
          tiktokPrivacyLevel: true,
          facebookError: true,
          instagramError: true,
          createdAt: true,
        },
      }),
      prisma.post.count(),
      prisma.post.count({ where: { status: { in: [PostStatus.PENDING, PostStatus.PUBLISHING] } } }),
      prisma.post.count({ where: { status: PostStatus.PUBLISHED } }),
    ]);

    posts = recentPosts.map((post) => ({
      ...post,
      platforms: Array.isArray(post.platforms)
        ? post.platforms.filter((platform): platform is string => typeof platform === "string")
        : [],
      mediaType: post.mediaType === "video" ? "video" : "image",
      youtubeTags: Array.isArray(post.youtubeTags)
        ? post.youtubeTags.filter((tag): tag is string => typeof tag === "string")
        : [],
      youtubePrivacyStatus: post.youtubePrivacyStatus === "public" ? "public" : "unlisted",
      tiktokPrivacyLevel: isTikTokPrivacyLevel(post.tiktokPrivacyLevel)
        ? post.tiktokPrivacyLevel
        : "PUBLIC_TO_EVERYONE",
      createdAt: post.createdAt.toISOString(),
    }));
    stats = { total, pending, published };
  } catch {
    databaseAvailable = false;
  }

  return (
    <DashboardClient
      initialPosts={posts}
      initialStats={stats}
      databaseAvailable={databaseAvailable}
    />
  );
}
