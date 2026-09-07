-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('ITEMISED', 'LUMP_SUM');

-- AlterEnum
ALTER TYPE "RateUnit" ADD VALUE 'LUMP_SUM';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "pricingMode" "PricingMode" NOT NULL DEFAULT 'ITEMISED';
