-- The version gate moves from version strings to build numbers.
--
-- The marketing version is for people; the build number is what the binary
-- actually reports, and what can be compared without parsing "1.10.0" against
-- "1.9.0" and getting it wrong.
--
-- latestIsLive is the column that earns the change: uploading a binary is not
-- the same as a store serving it. Without it, CI recording a new build tells
-- every shop to install something the store has not started serving yet.
--
-- Written defensively. Prisma's generated version added latestBuild and
-- storeUrl as NOT NULL with no default, which works only on an empty table —
-- true here today, and unknowable for the production database this will run
-- against months from now. Adding with a default and then dropping it costs
-- nothing and works either way.

ALTER TABLE "AppVersionGate"
  ADD COLUMN "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "latestBuild"       INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "latestIsLive"      BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN "latestVersionName" TEXT,
  ADD COLUMN "liveConfirmedAt"   TIMESTAMP(3),
  ADD COLUMN "minSupportedBuild" INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "storeUrl"          TEXT         NOT NULL DEFAULT '',
  ADD COLUMN "updatedBy"         TEXT;

-- Carry the old marketing version across where there was one, so a row that
-- existed does not come out of this looking like it never had a version.
UPDATE "AppVersionGate" SET "latestVersionName" = "minimumVersion"
  WHERE "minimumVersion" IS NOT NULL AND "latestVersionName" IS NULL;

ALTER TABLE "AppVersionGate"
  DROP COLUMN "minimumVersion",
  DROP COLUMN "recommendedVersion";

-- The schema declares no defaults for these two: a gate with build 0 and no
-- store URL is a gate nobody filled in, and it should be impossible to create
-- one by accident after this migration has run.
ALTER TABLE "AppVersionGate"
  ALTER COLUMN "latestBuild" DROP DEFAULT,
  ALTER COLUMN "storeUrl"    DROP DEFAULT;
