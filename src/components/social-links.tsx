"use client";

import { useEffect, useState } from "react";
import { Camera, MessageCircle, Music2 } from "lucide-react";
import { SOCIAL_LINK_FALLBACKS, SOCIAL_PLATFORMS, type SocialLink, type SocialPlatform } from "@/constants/socials";
import SocialPlatformIcon from "@/components/social-platform-icon";

const FALLBACK_LINKS = Object.values(SOCIAL_LINK_FALLBACKS).filter(
  (link): link is SocialLink => link !== null,
);

const PLATFORM_STYLES: Record<SocialPlatform, string> = {
  facebook: "bg-[#edf3ff] text-[#1877f2]",
  instagram: "bg-[#fff0f2] text-[#c14f77]",
  tiktok: "bg-[#f1eff4] text-[#17151b]",
  youtube: "bg-[#fff0f0] text-[#ff0033]",
  snapchat: "bg-[#fffc00] text-[#111]",
  whatsapp: "bg-[#eaf7ef] text-[#16854a]",
};

function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  if (platform === "youtube" || platform === "snapchat") {
    return <SocialPlatformIcon platform={platform} size={18} />;
  }

  if (platform === "facebook") {
    return <span className="text-lg font-bold leading-none">f</span>;
  }

  const Icon = platform === "instagram"
    ? Camera
    : platform === "tiktok"
      ? Music2
      : MessageCircle;

  return <Icon size={18} strokeWidth={1.8} />;
}

export default function SocialLinks() {
  const [links, setLinks] = useState<SocialLink[]>(FALLBACK_LINKS);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/settings/socials", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok) {
          throw new Error("تعذّر تحميل روابط التواصل الاجتماعي.");
        }

        if (
          !result ||
          typeof result !== "object" ||
          !("links" in result) ||
          !Array.isArray(result.links)
        ) {
          throw new Error("استجابة روابط التواصل غير صالحة.");
        }

        const validLinks = result.links.filter((item): item is SocialLink => {
          if (!item || typeof item !== "object") return false;
          const candidate = item as Partial<SocialLink>;
          const supportedPlatform = SOCIAL_PLATFORMS.find(
            (platform) => platform === candidate.platform,
          );
          return (
            supportedPlatform !== undefined &&
            typeof candidate.label === "string" &&
            typeof candidate.href === "string" &&
            candidate.href.startsWith("https://")
          );
        });

        setLinks(validLinks);
        setLoadError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });

    return () => controller.abort();
  }, []);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-2" aria-label="حسابات بيت ورد على التواصل الاجتماعي">
      {links.map(({ platform, label, href }) => (
        <a
          key={platform}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`زيارة حساب بيت ورد على ${label}`}
          title={label}
          className={`grid size-9 place-items-center rounded-xl transition hover:-translate-y-0.5 hover:shadow-sm ${PLATFORM_STYLES[platform]}`}
        >
          <PlatformIcon platform={platform} />
        </a>
      ))}
      {loadError ? (
        <span role="status" className="basis-full text-center text-[10px] text-[#a07035]">
          تعذّر تحديث الروابط؛ تظهر الروابط الافتراضية.
        </span>
      ) : null}
    </div>
  );
}
