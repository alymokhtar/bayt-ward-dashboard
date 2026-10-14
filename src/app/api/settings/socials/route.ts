import { NextResponse } from "next/server";
import { SOCIAL_LINK_FALLBACKS, SOCIAL_PLATFORMS, type SocialLink, type SocialPlatform } from "@/constants/socials";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_ID = "store";

function getSocialHref(platform: SocialPlatform, value: string | null | undefined) {
  const identifier = value?.trim().replace(/^@/, "");
  if (!identifier) return SOCIAL_LINK_FALLBACKS[platform]?.href ?? null;

  switch (platform) {
    case "facebook":
      if (/^\d+$/.test(identifier)) {
        return `https://www.facebook.com/profile.php?id=${encodeURIComponent(identifier)}`;
      }
      return /^[A-Za-z0-9._-]{1,100}$/.test(identifier)
        ? `https://www.facebook.com/${encodeURIComponent(identifier)}/`
        : SOCIAL_LINK_FALLBACKS.facebook?.href ?? null;
    case "instagram":
      return /^[A-Za-z0-9._]{1,30}$/.test(identifier)
        ? `https://www.instagram.com/${encodeURIComponent(identifier)}/`
        : SOCIAL_LINK_FALLBACKS.instagram?.href ?? null;
    case "tiktok":
      return /^[A-Za-z0-9._]{1,24}$/.test(identifier)
        ? `https://www.tiktok.com/@${encodeURIComponent(identifier)}`
        : SOCIAL_LINK_FALLBACKS.tiktok?.href ?? null;
    case "youtube":
      return /^UC[A-Za-z0-9_-]{20,}$/.test(identifier)
        ? `https://www.youtube.com/channel/${encodeURIComponent(identifier)}`
        : /^[A-Za-z0-9._-]{1,100}$/.test(identifier)
          ? `https://www.youtube.com/@${encodeURIComponent(identifier)}`
          : SOCIAL_LINK_FALLBACKS.youtube?.href ?? null;
    case "snapchat":
    case "whatsapp":
      return null;
  }
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  try {
    const settings = await prisma.settings.findUnique({
      where: { id: SETTINGS_ID },
      select: {
        facebookPageId: true,
        instagramAccountId: true,
        tiktokAccountId: true,
        youtubeChannelId: true,
      },
    });

    const identifiers: Partial<Record<SocialPlatform, string>> = {
      facebook: settings?.facebookPageId,
      instagram: settings?.instagramAccountId,
      tiktok: settings?.tiktokAccountId,
      youtube: settings?.youtubeChannelId,
    };
    const links = SOCIAL_PLATFORMS.flatMap((platform): SocialLink[] => {
      const fallback = SOCIAL_LINK_FALLBACKS[platform];
      const href = getSocialHref(platform, identifiers[platform]);
      if (!href) return [];

      return [{
        platform,
        label: fallback?.label ?? platform,
        href,
      }];
    });

    return NextResponse.json({ links }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "تعذّر تحميل روابط التواصل الاجتماعي." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
