-- DropIndex
DROP INDEX "AuditLog_entity_entityId_idx";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorLabel" TEXT,
ADD COLUMN     "entityCode" TEXT,
ADD COLUMN     "reason" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog"("entity", "entityId", "createdAt");
