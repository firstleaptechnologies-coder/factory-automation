-- Modules granted on top of a plan.
ALTER TABLE "Tenant" ADD COLUMN "modules" TEXT[] DEFAULT ARRAY[]::TEXT[];
