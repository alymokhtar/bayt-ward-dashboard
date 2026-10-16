ALTER TABLE "Settings"
    RENAME COLUMN "youtubeToken" TO "youtubeAccessToken";

UPDATE "Settings"
SET "youtubeAccessToken" = '';

ALTER TABLE "Settings"
    ADD COLUMN "youtubeChannelTitle" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "youtubeRefreshToken" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "youtubeTokenExpiresAt" TIMESTAMP(3);

ALTER TABLE "Post"
    ADD COLUMN "youtubeStatus" "PostStatus",
    ADD COLUMN "youtubeTitle" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "youtubeDescription" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "youtubeTags" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "youtubePrivacyStatus" VARCHAR(10) NOT NULL DEFAULT 'unlisted',
    ADD COLUMN "youtubeVideoId" TEXT,
    ADD COLUMN "youtubeVideoUrl" TEXT,
    ADD COLUMN "youtubeError" TEXT;
