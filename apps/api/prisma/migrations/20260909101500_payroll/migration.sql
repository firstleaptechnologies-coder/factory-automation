-- CreateEnum
CREATE TYPE "PayKind" AS ENUM ('MONTHLY', 'DAILY', 'PIECE');

-- CreateEnum
CREATE TYPE "SalaryRunStatus" AS ENUM ('DRAFT', 'APPROVED', 'PAID');

-- CreateTable
CREATE TABLE "PayStructure" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "PayKind" NOT NULL,
    "rate" DECIMAL(14,2) NOT NULL,
    "pieceLabel" TEXT,
    "overtimeHourlyRate" DECIMAL(14,2),
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryAdvance" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "givenOn" DATE NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "note" TEXT,
    "recoveredAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "givenById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryRun" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "status" "SalaryRunStatus" NOT NULL DEFAULT 'DRAFT',
    "workingDays" INTEGER NOT NULL,
    "note" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidMode" "PaymentMode",
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payableDays" DECIMAL(6,2) NOT NULL,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "pieces" INTEGER,
    "lines" JSONB NOT NULL,
    "gross" DECIMAL(14,2) NOT NULL,
    "advanceDeducted" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductionNote" TEXT,
    "net" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayStructure_tenantId_employeeId_effectiveFrom_idx" ON "PayStructure"("tenantId", "employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PayStructure_tenantId_idx" ON "PayStructure"("tenantId");

-- CreateIndex
CREATE INDEX "SalaryAdvance_tenantId_employeeId_idx" ON "SalaryAdvance"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "SalaryAdvance_tenantId_givenOn_idx" ON "SalaryAdvance"("tenantId", "givenOn");

-- CreateIndex
CREATE INDEX "SalaryAdvance_tenantId_idx" ON "SalaryAdvance"("tenantId");

-- CreateIndex
CREATE INDEX "SalaryRun_tenantId_status_idx" ON "SalaryRun"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SalaryRun_tenantId_idx" ON "SalaryRun"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryRun_tenantId_month_key" ON "SalaryRun"("tenantId", "month");

-- CreateIndex
CREATE INDEX "Payslip_tenantId_employeeId_idx" ON "Payslip"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "Payslip_tenantId_idx" ON "Payslip"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_tenantId_runId_employeeId_key" ON "Payslip"("tenantId", "runId", "employeeId");

-- AddForeignKey
ALTER TABLE "PayStructure" ADD CONSTRAINT "PayStructure_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryAdvance" ADD CONSTRAINT "SalaryAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SalaryRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

