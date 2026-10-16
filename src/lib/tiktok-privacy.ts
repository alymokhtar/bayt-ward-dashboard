export const TIKTOK_PRIVACY_LEVELS = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
] as const;

export type TikTokPrivacyLevel = (typeof TIKTOK_PRIVACY_LEVELS)[number];

const PRIVACY_LEVEL_SET: ReadonlySet<string> = new Set(TIKTOK_PRIVACY_LEVELS);

export const TIKTOK_PRIVACY_LABELS: Record<TikTokPrivacyLevel, string> = {
  PUBLIC_TO_EVERYONE: "عام",
  MUTUAL_FOLLOW_FRIENDS: "الأصدقاء المتبادلون",
  FOLLOWER_OF_CREATOR: "المتابعون",
  SELF_ONLY: "أنا فقط",
};

export function isTikTokPrivacyLevel(value: unknown): value is TikTokPrivacyLevel {
  return typeof value === "string" && PRIVACY_LEVEL_SET.has(value);
}

export function toTikTokPrivacyLevel(value: unknown): TikTokPrivacyLevel {
  if (!isTikTokPrivacyLevel(value)) {
    throw new Error("Select a valid TikTok privacy option.");
  }

  switch (value) {
    case "PUBLIC_TO_EVERYONE":
      return "PUBLIC_TO_EVERYONE";
    case "MUTUAL_FOLLOW_FRIENDS":
      return "MUTUAL_FOLLOW_FRIENDS";
    case "FOLLOWER_OF_CREATOR":
      return "FOLLOWER_OF_CREATOR";
    case "SELF_ONLY":
      return "SELF_ONLY";
  }
}

export function createTikTokDirectPostPayload(input: {
  title: string;
  privacyLevel: unknown;
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
}) {
  return {
    post_info: {
      title: input.title,
      privacy_level: toTikTokPrivacyLevel(input.privacyLevel),
      brand_organic_toggle: true,
    },
    source_info: {
      source: "FILE_UPLOAD" as const,
      video_size: input.videoSize,
      chunk_size: input.chunkSize,
      total_chunk_count: input.totalChunkCount,
    },
  };
}
