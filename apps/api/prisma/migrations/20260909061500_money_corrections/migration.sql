-- AlterTable
ALTER TABLE "Disbursement" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "reversalOfId" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "reason" TEXT,
ADD COLUMN     "reversalOfId" TEXT;

-- CreateTable
CREATE TABLE "ExpenseEditHistory" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "editType" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "note" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseEditHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseEditHistory_tenantId_expenseId_createdAt_idx" ON "ExpenseEditHistory"("tenantId", "expenseId", "createdAt");

-- CreateIndex
CREATE INDEX "ExpenseEditHistory_tenantId_idx" ON "ExpenseEditHistory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Disbursement_reversalOfId_key" ON "Disbursement"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_reversalOfId_key" ON "Expense"("reversalOfId");

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Disbursement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEditHistory" ADD CONSTRAINT "ExpenseEditHistory_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEditHistory" ADD CONSTRAINT "ExpenseEditHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

