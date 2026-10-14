ALTER TYPE "PostStatus" ADD VALUE IF NOT EXISTS 'PUBLISHING';
ALTER TYPE "PostStatus" ADD VALUE IF NOT EXISTS 'UNKNOWN';

ALTER TABLE "Post"
    ADD COLUMN "mediaType" VARCHAR(10) NOT NULL DEFAULT 'image',
    ADD COLUMN "facebookStatus" "PostStatus",
    ADD COLUMN "instagramStatus" "PostStatus",
    ADD COLUMN "facebookPostId" TEXT,
    ADD COLUMN "instagramPostId" TEXT,
    ADD COLUMN "facebookError" TEXT,
    ADD COLUMN "instagramError" TEXT;

ALTER TABLE "Settings"
    ADD COLUMN "metaAccessTokenEncrypted" TEXT NOT NULL DEFAULT '';

CREATE TABLE "AdminLoginAttempt" (
    "ipHash" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminLoginAttempt_pkey" PRIMARY KEY ("ipHash")
);
