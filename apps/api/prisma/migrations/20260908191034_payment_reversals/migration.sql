-- A receipt is never edited and never deleted: a mistake is corrected by
-- recording its opposite, and both rows stand.

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "reversalOfId" TEXT;

-- AlterTable
ALTER TABLE "CashDeposit" ADD COLUMN     "reversalOfId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reversalOfId_key" ON "Payment"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "CashDeposit_reversalOfId_key" ON "CashDeposit"("reversalOfId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDeposit" ADD CONSTRAINT "CashDeposit_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "CashDeposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
