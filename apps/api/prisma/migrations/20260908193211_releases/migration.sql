-- The app binary and what it runs. Platform-level: one app in the stores for
-- every workspace.

-- CreateEnum
CREATE TYPE "OtaPlatform" AS ENUM ('ios', 'android');
CREATE TYPE "OtaReleaseKind" AS ENUM ('UPDATE', 'ROLLBACK');
CREATE TYPE "OtaReleaseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "OtaRelease" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "runtimeVersion" TEXT NOT NULL,
    "platform" "OtaPlatform" NOT NULL,
    "kind" "OtaReleaseKind" NOT NULL DEFAULT 'UPDATE',
    "status" "OtaReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "rolloutPercent" INTEGER NOT NULL DEFAULT 0,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "extra" JSONB NOT NULL DEFAULT '{}',
    "commitTime" TIMESTAMP(3),
    "changelog" TEXT,
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "OtaRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtaReleaseAsset" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "isLaunchAsset" BOOLEAN NOT NULL DEFAULT false,
    "key" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileExtension" TEXT NOT NULL,
    "backend" "StorageBackend" NOT NULL,
    "bucket" TEXT,
    "objectKey" TEXT,
    "data" BYTEA,
    "byteSize" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "encryptionKeyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtaReleaseAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppVersionGate" (
    "id" TEXT NOT NULL,
    "platform" "OtaPlatform" NOT NULL,
    "channel" TEXT NOT NULL,
    "minimumVersion" TEXT NOT NULL,
    "recommendedVersion" TEXT,
    "message" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppVersionGate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtaRelease_channel_runtimeVersion_platform_status_createdAt_idx" ON "OtaRelease"("channel", "runtimeVersion", "platform", "status", "createdAt");
CREATE UNIQUE INDEX "OtaReleaseAsset_releaseId_key_key" ON "OtaReleaseAsset"("releaseId", "key");
CREATE INDEX "OtaReleaseAsset_releaseId_idx" ON "OtaReleaseAsset"("releaseId");
CREATE UNIQUE INDEX "AppVersionGate_platform_channel_key" ON "AppVersionGate"("platform", "channel");

-- AddForeignKey
ALTER TABLE "OtaReleaseAsset" ADD CONSTRAINT "OtaReleaseAsset_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "OtaRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
