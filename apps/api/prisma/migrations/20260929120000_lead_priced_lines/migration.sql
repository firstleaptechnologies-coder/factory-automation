-- Priced lines on an enquiry, the same shape as a quotation's.
--
-- Every column is defaulted or nullable, so an enquiry recorded before this
-- migration is a perfectly good enquiry afterwards: no lines, zero totals, and
-- the estimatedValue guess it always had.

ALTER TABLE "Lead" ADD COLUMN "taxTreatment" "TaxTreatment" NOT NULL DEFAULT 'EXCLUSIVE';
ALTER TABLE "Lead" ADD COLUMN "subtotal"   DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "discount"   DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "total"      DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "cgst"       DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "sgst"       DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "igst"       DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "taxAmount"  DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "Lead" ADD COLUMN "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE TABLE "LeadItem" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
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

    CONSTRAINT "LeadItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadItem_leadId_lineNo_key" ON "LeadItem"("leadId", "lineNo");
CREATE INDEX "LeadItem_tenantId_idx" ON "LeadItem"("tenantId");

ALTER TABLE "LeadItem" ADD CONSTRAINT "LeadItem_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadItem" ADD CONSTRAINT "LeadItem_gstSlabId_fkey"
  FOREIGN KEY ("gstSlabId") REFERENCES "GstSlab"("id") ON DELETE SET NULL ON UPDATE CASCADE;
