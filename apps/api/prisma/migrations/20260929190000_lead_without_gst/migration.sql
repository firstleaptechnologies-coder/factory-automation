-- An enquiry is not a tax document.
--
-- The GST columns added earlier today are dropped: a lead now carries what
-- its lines come to and nothing about tax. GST is worked out on the quotation
-- raised from it, where somebody is actually being asked to pay. Unused tax
-- columns left on a money table invite somebody later assuming a lead is
-- taxed, and acting on it.
--
-- Nothing is lost that was ever collected: these columns shipped this morning
-- and no shop has priced an enquiry through them.

ALTER TABLE "LeadItem" DROP CONSTRAINT IF EXISTS "LeadItem_gstSlabId_fkey";
ALTER TABLE "LeadItem" DROP COLUMN IF EXISTS "gstSlabId";
ALTER TABLE "LeadItem" DROP COLUMN IF EXISTS "gstRatePct";
ALTER TABLE "LeadItem" DROP COLUMN IF EXISTS "taxAmount";
ALTER TABLE "LeadItem" DROP COLUMN IF EXISTS "hsnSac";
-- `netAmount` was the taxable value before GST. With no GST it is `amount`,
-- and two columns holding the same number is one that goes stale.
ALTER TABLE "LeadItem" DROP COLUMN IF EXISTS "netAmount";
-- A line on an enquiry is often written before anybody has a quantity.
ALTER TABLE "LeadItem" ALTER COLUMN "quantity" SET DEFAULT 0;

ALTER TABLE "Lead" DROP COLUMN IF EXISTS "taxTreatment";
ALTER TABLE "Lead" DROP COLUMN IF EXISTS "cgst";
ALTER TABLE "Lead" DROP COLUMN IF EXISTS "sgst";
ALTER TABLE "Lead" DROP COLUMN IF EXISTS "igst";
ALTER TABLE "Lead" DROP COLUMN IF EXISTS "taxAmount";
-- `grandTotal` was the figure including GST. Without tax it is `total`.
ALTER TABLE "Lead" DROP COLUMN IF EXISTS "grandTotal";

-- Where a bill would go, and where the work would be delivered. Asked for on
-- the call that creates the enquiry, so the quotation raised from it does not
-- have to stop and ask again.
ALTER TABLE "Lead" ADD COLUMN "billingAddress"  TEXT;
ALTER TABLE "Lead" ADD COLUMN "shippingAddress" TEXT;
