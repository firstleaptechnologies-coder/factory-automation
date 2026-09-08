-- How the product is behaving, and what the clients saw. Ours rather than the
-- shop's: the audit trail is their business record and lives beside their data.

-- CreateTable
CREATE TABLE "ServerLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "tenantSlug" TEXT,
    "action" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "userId" TEXT,
    "actorLabel" TEXT,
    "client" TEXT,
    "error" TEXT,
    "reference" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "client" TEXT NOT NULL,
    "platform" TEXT,
    "appVersion" TEXT,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "at" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerLog_at_idx" ON "ServerLog"("at");
CREATE INDEX "ServerLog_outcome_at_idx" ON "ServerLog"("outcome", "at");
CREATE INDEX "ServerLog_action_at_idx" ON "ServerLog"("action", "at");
CREATE INDEX "ServerLog_tenantId_at_idx" ON "ServerLog"("tenantId", "at");
CREATE INDEX "ServerLog_reference_idx" ON "ServerLog"("reference");
CREATE INDEX "ClientLog_at_idx" ON "ClientLog"("at");
CREATE INDEX "ClientLog_level_at_idx" ON "ClientLog"("level", "at");
CREATE INDEX "ClientLog_tenantId_at_idx" ON "ClientLog"("tenantId", "at");
