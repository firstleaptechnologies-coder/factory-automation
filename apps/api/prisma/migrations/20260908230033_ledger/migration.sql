-- Every rupee that moves posts a row here, whatever moved it.

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('IN', 'OUT', 'TRANSFER');
CREATE TYPE "LedgerAccount" AS ENUM ('CASH', 'BANK');

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "account" "LedgerAccount" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "orderId" TEXT,
    "clientId" TEXT,
    "party" TEXT,
    "accountHead" TEXT,
    "voucher" TEXT NOT NULL,
    "taxAmount" DECIMAL(14,2),
    "gstin" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_tenantId_sourceType_sourceId_key" ON "LedgerEntry"("tenantId", "sourceType", "sourceId");
CREATE INDEX "LedgerEntry_tenantId_at_idx" ON "LedgerEntry"("tenantId", "at");
CREATE INDEX "LedgerEntry_tenantId_direction_at_idx" ON "LedgerEntry"("tenantId", "direction", "at");
CREATE INDEX "LedgerEntry_tenantId_orderId_idx" ON "LedgerEntry"("tenantId", "orderId");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
