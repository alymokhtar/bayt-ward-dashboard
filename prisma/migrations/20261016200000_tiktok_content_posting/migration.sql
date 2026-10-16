ALTER TABLE "Settings"
    ADD COLUMN "tiktokOpenId" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "tiktokDisplayName" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "tiktokAccessToken" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "tiktokRefreshToken" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "tiktokTokenExpiresAt" TIMESTAMP(3),
    ADD COLUMN "tiktokRefreshTokenExpiresAt" TIMESTAMP(3);

ALTER TABLE "Post"
    ADD COLUMN "tiktokStatus" "PostStatus",
    ADD COLUMN "tiktokPublishId" TEXT,
    ADD COLUMN "tiktokVideoId" TEXT,
    ADD COLUMN "tiktokVideoUrl" TEXT,
    ADD COLUMN "tiktokError" TEXT,
    ADD COLUMN "tiktokPrivacyLevel" VARCHAR(40) NOT NULL DEFAULT 'PUBLIC_TO_EVERYONE';
