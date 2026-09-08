-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'ORDERED', 'PART_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockMoveKind" AS ENUM ('RECEIPT', 'CONSUMPTION', 'OFFCUT', 'WASTE', 'ADJUSTMENT', 'RETURN');

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "reorderLevel" DECIMAL(14,3),
ADD COLUMN     "stockUnit" TEXT NOT NULL DEFAULT 'sheet';

-- CreateTable
CREATE TABLE "Vendor" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "altPhone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "company" TEXT,
    "stateCode" TEXT,
    "stateName" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "supplies" TEXT,
    "paymentTermDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "orderedOn" DATE,
    "expectedOn" DATE,
    "billNumber" TEXT,
    "billedOn" DATE,
    "paidOn" DATE,
    "paidMode" "PaymentMode",
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherCharges" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "thicknessId" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'sheet',
    "quantity" DECIMAL(14,3) NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,
    "gstRatePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "receivedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMove" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "thicknessId" TEXT,
    "kind" "StockMoveKind" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'sheet',
    "rate" DECIMAL(14,2),
    "purchaseId" TEXT,
    "purchaseItemId" TEXT,
    "orderId" TEXT,
    "reason" TEXT,
    "note" TEXT,
    "at" DATE NOT NULL,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vendor_tenantId_isActive_idx" ON "Vendor"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "Vendor_tenantId_idx" ON "Vendor"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_tenantId_code_key" ON "Vendor"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Purchase_tenantId_status_idx" ON "Purchase"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Purchase_tenantId_vendorId_idx" ON "Purchase"("tenantId", "vendorId");

-- CreateIndex
CREATE INDEX "Purchase_tenantId_idx" ON "Purchase"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_tenantId_code_key" ON "Purchase"("tenantId", "code");

-- CreateIndex
CREATE INDEX "PurchaseItem_tenantId_purchaseId_idx" ON "PurchaseItem"("tenantId", "purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseItem_tenantId_materialId_idx" ON "PurchaseItem"("tenantId", "materialId");

-- CreateIndex
CREATE INDEX "PurchaseItem_tenantId_idx" ON "PurchaseItem"("tenantId");

-- CreateIndex
CREATE INDEX "StockMove_tenantId_materialId_thicknessId_idx" ON "StockMove"("tenantId", "materialId", "thicknessId");

-- CreateIndex
CREATE INDEX "StockMove_tenantId_kind_at_idx" ON "StockMove"("tenantId", "kind", "at");

-- CreateIndex
CREATE INDEX "StockMove_tenantId_orderId_idx" ON "StockMove"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "StockMove_tenantId_idx" ON "StockMove"("tenantId");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_thicknessId_fkey" FOREIGN KEY ("thicknessId") REFERENCES "MaterialThickness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_thicknessId_fkey" FOREIGN KEY ("thicknessId") REFERENCES "MaterialThickness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_purchaseItemId_fkey" FOREIGN KEY ("purchaseItemId") REFERENCES "PurchaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMove" ADD CONSTRAINT "StockMove_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

