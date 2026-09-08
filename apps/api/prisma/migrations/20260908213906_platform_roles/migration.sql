-- Not everybody who owns the product does the same job.
ALTER TABLE "PlatformUser" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'OWNER';
