-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('PLANNED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "DisbursementCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisbursementCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disbursement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "categoryId" TEXT,
    "payeeName" TEXT NOT NULL,
    "payeeContact" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "DisbursementStatus" NOT NULL DEFAULT 'PLANNED',
    "paidAt" TIMESTAMP(3),
    "paidMode" "PaymentMode",
    "reference" TEXT,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Disbursement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DisbursementCategory_tenantId_isActive_idx" ON "DisbursementCategory"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DisbursementCategory_tenantId_code_key" ON "DisbursementCategory"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Disbursement_tenantId_orderId_idx" ON "Disbursement"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "Disbursement_tenantId_status_idx" ON "Disbursement"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DisbursementCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
