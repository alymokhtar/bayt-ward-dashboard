ALTER TABLE "Settings"
  ADD COLUMN "snapchatOrganizationId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "snapchatProfileId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "snapchatProfileName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "snapchatAccessToken" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "snapchatRefreshToken" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "snapchatTokenExpiresAt" TIMESTAMP(3);

UPDATE "Settings"
SET "snapchatToken" = '';

ALTER TABLE "Post"
  ADD COLUMN "snapchatStatus" "PostStatus",
  ADD COLUMN "snapchatContentType" VARCHAR(10) NOT NULL DEFAULT 'STORY',
  ADD COLUMN "snapchatStoryTtl" VARCHAR(20) NOT NULL DEFAULT 'ONE_DAY',
  ADD COLUMN "snapchatDescription" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "snapchatLink" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "snapchatMediaId" TEXT,
  ADD COLUMN "snapchatRequestId" TEXT,
  ADD COLUMN "snapchatStoryId" TEXT,
  ADD COLUMN "snapchatSpotlightId" TEXT,
  ADD COLUMN "snapchatError" TEXT;
