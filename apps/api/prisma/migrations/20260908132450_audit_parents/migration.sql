-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "rootEntity" TEXT,
ADD COLUMN     "rootId" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_rootEntity_rootId_createdAt_idx" ON "AuditLog"("rootEntity", "rootId", "createdAt");
