-- CreateEnum
CREATE TYPE "PlatformInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'FAILED', 'VOID');

-- CreateTable
CREATE TABLE "PlatformInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "lines" JSONB NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PlatformInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "razorpayLinkId" TEXT,
    "razorpayPaymentId" TEXT,
    "paymentUrl" TEXT,
    "failureReason" TEXT,
    "issuedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformBillingEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "handledAt" TIMESTAMP(3),
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformBillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformInvoice_razorpayLinkId_key" ON "PlatformInvoice"("razorpayLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformInvoice_razorpayPaymentId_key" ON "PlatformInvoice"("razorpayPaymentId");

-- CreateIndex
CREATE INDEX "PlatformInvoice_status_idx" ON "PlatformInvoice"("status");

-- CreateIndex
CREATE INDEX "PlatformInvoice_tenantId_idx" ON "PlatformInvoice"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformInvoice_tenantId_period_key" ON "PlatformInvoice"("tenantId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBillingEvent_eventId_key" ON "PlatformBillingEvent"("eventId");

-- CreateIndex
CREATE INDEX "PlatformBillingEvent_event_idx" ON "PlatformBillingEvent"("event");


-- Every workspace gets a billing day, so nothing sits unbillable.
--
-- The day they started on, which is the day they would expect to be charged.
-- Capped at 28 because February has 28 days and a workspace billed on the 30th
-- would be skipped twice a year — a bug that only appears in February and is
-- therefore found by a client, not by us.
UPDATE "Tenant"
   SET "billingDay" = LEAST(EXTRACT(DAY FROM "createdAt")::int, 28)
 WHERE "billingDay" IS NULL;
