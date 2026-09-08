-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CONVERTED');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "altPhone" TEXT,
ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "shippingAddress" TEXT,
ADD COLUMN     "stateCode" TEXT,
ADD COLUMN     "stateName" TEXT;

-- CreateTable
CREATE TABLE "FirmProfile" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "stateCode" TEXT,
    "stateName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "website" TEXT,
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "bankBranch" TEXT,
    "termsAndConditions" TEXT,
    "signatoryName" TEXT,
    "letterheadFileId" TEXT,
    "logoFileId" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#E4232F',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FirmProfile_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "Estimate" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT,
    "clientName" TEXT,
    "billingAddress" TEXT,
    "shippingAddress" TEXT,
    "clientGstin" TEXT,
    "clientStateCode" TEXT,
    "status" "EstimateStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTill" TIMESTAMP(3),
    "notes" TEXT,
    "termsOverride" TEXT,
    "taxTreatment" "TaxTreatment" NOT NULL DEFAULT 'EXCLUSIVE',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "savedAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "orderId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Estimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateItem" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hsnSac" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'Sqf',
    "ratePerUnit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstSlabId" TEXT,
    "gstRatePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "EstimateItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FirmProfile_id_key" ON "FirmProfile"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_orderId_key" ON "Estimate"("orderId");

-- CreateIndex
CREATE INDEX "Estimate_tenantId_status_idx" ON "Estimate"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Estimate_tenantId_clientId_idx" ON "Estimate"("tenantId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Estimate_tenantId_code_key" ON "Estimate"("tenantId", "code");

-- CreateIndex
CREATE INDEX "EstimateItem_tenantId_idx" ON "EstimateItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EstimateItem_estimateId_lineNo_key" ON "EstimateItem"("estimateId", "lineNo");

-- AddForeignKey
ALTER TABLE "FirmProfile" ADD CONSTRAINT "FirmProfile_letterheadFileId_fkey" FOREIGN KEY ("letterheadFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmProfile" ADD CONSTRAINT "FirmProfile_logoFileId_fkey" FOREIGN KEY ("logoFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estimate" ADD CONSTRAINT "Estimate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateItem" ADD CONSTRAINT "EstimateItem_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateItem" ADD CONSTRAINT "EstimateItem_gstSlabId_fkey" FOREIGN KEY ("gstSlabId") REFERENCES "GstSlab"("id") ON DELETE SET NULL ON UPDATE CASCADE;
