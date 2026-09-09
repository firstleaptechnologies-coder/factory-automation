-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "billingDay" INTEGER,
ADD COLUMN     "billingRef" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Tenant_trialEndsAt_idx" ON "Tenant"("trialEndsAt");

