-- CreateEnum
CREATE TYPE "ExpenseOptionField" AS ENUM ('PAYMENT_TYPE', 'DONE_BY', 'VENDOR', 'SPENT_TYPE', 'TO_NAME');

-- CreateTable
CREATE TABLE "ExpenseOption" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "field" "ExpenseOptionField" NOT NULL,
    "label" TEXT NOT NULL,
    "account" "LedgerAccount",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentType" TEXT NOT NULL,
    "doneBy" TEXT NOT NULL,
    "toName" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "spentType" TEXT NOT NULL,
    "note" TEXT,
    "vendorGstin" TEXT,
    "taxableValue" DECIMAL(14,2),
    "taxAmount" DECIMAL(14,2),
    "itcEligible" BOOLEAN NOT NULL DEFAULT false,
    "billFileId" TEXT,
    "orderId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseOption_tenantId_field_isActive_idx" ON "ExpenseOption"("tenantId", "field", "isActive");

-- CreateIndex
CREATE INDEX "ExpenseOption_tenantId_idx" ON "ExpenseOption"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseOption_tenantId_field_label_key" ON "ExpenseOption"("tenantId", "field", "label");

-- CreateIndex
CREATE INDEX "Expense_tenantId_date_idx" ON "Expense"("tenantId", "date");

-- CreateIndex
CREATE INDEX "Expense_tenantId_spentType_idx" ON "Expense"("tenantId", "spentType");

-- CreateIndex
CREATE INDEX "Expense_tenantId_vendor_idx" ON "Expense"("tenantId", "vendor");

-- CreateIndex
CREATE INDEX "Expense_tenantId_doneBy_idx" ON "Expense"("tenantId", "doneBy");

-- CreateIndex
CREATE INDEX "Expense_tenantId_paymentType_idx" ON "Expense"("tenantId", "paymentType");

-- CreateIndex
CREATE INDEX "Expense_tenantId_orderId_idx" ON "Expense"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "Expense_tenantId_idx" ON "Expense"("tenantId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_billFileId_fkey" FOREIGN KEY ("billFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
