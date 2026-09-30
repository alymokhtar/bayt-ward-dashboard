import { PostStatus } from "@prisma/client";
import DashboardClient from "./dashboard-client";
import type { SavedPost } from "@/app/actions/create-post";
import { prisma } from "@/lib/prisma";

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
          status: true,
          createdAt: true,
        },
      }),
      prisma.post.count(),
      prisma.post.count({ where: { status: PostStatus.PENDING } }),
      prisma.post.count({ where: { status: PostStatus.PUBLISHED } }),
    ]);

    posts = recentPosts.map((post) => ({
      ...post,
      platforms: Array.isArray(post.platforms)
        ? post.platforms.filter((platform): platform is string => typeof platform === "string")
        : [],
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
