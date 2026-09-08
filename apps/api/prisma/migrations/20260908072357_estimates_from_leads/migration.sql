-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "leadId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "quotedValue" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Workflow" ADD COLUMN     "quoteStatusId" TEXT;

-- CreateIndex
CREATE INDEX "Estimate_leadId_idx" ON "Estimate"("leadId");

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
