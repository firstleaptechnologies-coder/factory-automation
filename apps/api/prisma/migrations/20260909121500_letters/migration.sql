-- CreateEnum
CREATE TYPE "LetterKind" AS ENUM ('OFFER', 'APPOINTMENT', 'NDA', 'RESPONSIBILITY', 'EXPERIENCE', 'RELIEVING', 'WARNING');

-- CreateTable
CREATE TABLE "LetterTemplate" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "kind" "LetterKind" NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Letter" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "LetterKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "issuedOn" DATE NOT NULL,
    "issuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Letter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LetterTemplate_tenantId_kind_isActive_idx" ON "LetterTemplate"("tenantId", "kind", "isActive");

-- CreateIndex
CREATE INDEX "LetterTemplate_tenantId_idx" ON "LetterTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "Letter_tenantId_employeeId_issuedOn_idx" ON "Letter"("tenantId", "employeeId", "issuedOn");

-- CreateIndex
CREATE INDEX "Letter_tenantId_idx" ON "Letter"("tenantId");

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

