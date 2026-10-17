ALTER TABLE "Settings"
    ALTER COLUMN "facebookPageId" SET DEFAULT '1398573690014828';

UPDATE "Settings"
SET "facebookPageId" = '1398573690014828',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'store'
  AND "facebookPageId" <> '1398573690014828';
