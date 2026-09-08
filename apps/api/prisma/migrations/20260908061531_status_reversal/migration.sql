-- AlterTable
ALTER TABLE "LeadStatusHistory" ADD COLUMN     "reversed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrderStatusHistory" ADD COLUMN     "reversed" BOOLEAN NOT NULL DEFAULT false;
