export const SOCIAL_PLATFORMS = [
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
  "snapchat",
  "whatsapp",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const FACEBOOK_PAGE_ID = "1398573690014828";

export type SocialLink = {
  platform: SocialPlatform;
  label: string;
  href: string;
};

export const SOCIAL_LINK_FALLBACKS: Record<SocialPlatform, SocialLink | null> = {
  facebook: {
    platform: "facebook",
    label: "Facebook",
    href: `https://www.facebook.com/${FACEBOOK_PAGE_ID}/`,
  },
  instagram: {
    platform: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/bayt.ward2012/",
  },
  tiktok: {
    platform: "tiktok",
    label: "TikTok",
    href: "https://www.tiktok.com/@baytward",
  },
  youtube: {
    platform: "youtube",
    label: "YouTube",
    href: "https://www.youtube.com/@baytward",
  },
  snapchat: null,
  whatsapp: null,
};
