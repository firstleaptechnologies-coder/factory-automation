-- AlterTable
ALTER TABLE "WorkflowStatus" ADD COLUMN     "homeCardOrder" INTEGER;

-- CreateIndex
CREATE INDEX "WorkflowStatus_workflowId_homeCardOrder_idx" ON "WorkflowStatus"("workflowId", "homeCardOrder");
