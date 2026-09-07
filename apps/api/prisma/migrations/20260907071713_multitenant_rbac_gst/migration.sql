-- CreateEnum
CREATE TYPE "TenantIsolation" AS ENUM ('SHARED', 'DEDICATED');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'SALES', 'PRODUCTION', 'VIEWER');

-- CreateEnum
CREATE TYPE "WorkflowKind" AS ENUM ('ORDER', 'LEAD');

-- CreateEnum
CREATE TYPE "StatusCategory" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StorageBackend" AS ENUM ('S3', 'DATABASE');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "RateUnit" AS ENUM ('PER_SQFT', 'PER_SQM', 'PER_PIECE', 'PER_RFT', 'LUMP_SUM');

-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('ITEMISED', 'LUMP_SUM');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('REFERENCE_IMAGE', 'SIZE_IMAGE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PARTIAL', 'RECEIVED');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'ONLINE');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'PHONE', 'EMAIL');

-- CreateEnum
CREATE TYPE "CustomFieldEntity" AS ENUM ('LEAD', 'ORDER', 'CLIENT');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isolation" "TenantIsolation" NOT NULL DEFAULT 'SHARED',
    "databaseUrl" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "plan" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstSlab" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratePct" DECIMAL(5,2) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GstSlab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'SALES',
    "roleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "company" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientLocation" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialThickness" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "valueMm" DECIMAL(12,3) NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MaterialThickness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizePreset" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lengthMm" DECIMAL(12,3) NOT NULL,
    "widthMm" DECIMAL(12,3) NOT NULL,
    "thicknessMm" DECIMAL(12,3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SizePreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "WorkflowKind" NOT NULL DEFAULT 'ORDER',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStatus" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7785',
    "category" "StatusCategory" NOT NULL DEFAULT 'OPEN',
    "parentId" TEXT,
    "isInitial" BOOLEAN NOT NULL DEFAULT false,
    "isEntryPoint" BOOLEAN NOT NULL DEFAULT false,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "canvasX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "canvasY" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "WorkflowStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTransition" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "fromStatusId" TEXT NOT NULL,
    "toStatusId" TEXT NOT NULL,
    "label" TEXT,
    "requiresNote" BOOLEAN NOT NULL DEFAULT false,
    "allowedRoles" "UserRole"[] DEFAULT ARRAY[]::"UserRole"[],

    CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoredFile" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "backend" "StorageBackend" NOT NULL,
    "bucket" TEXT,
    "objectKey" TEXT,
    "data" BYTEA,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "originalByteSize" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" TEXT NOT NULL,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "encryptionKeyId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "locationId" TEXT,
    "workflowId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "pricingMode" "PricingMode" NOT NULL DEFAULT 'ITEMISED',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstSlabId" TEXT,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "sizePresetId" TEXT,
    "lengthMm" DECIMAL(12,3) NOT NULL,
    "widthMm" DECIMAL(12,3) NOT NULL,
    "thicknessMm" DECIMAL(12,3),
    "materialId" TEXT NOT NULL,
    "materialThicknessId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "rate" DECIMAL(14,2),
    "rateUnit" "RateUnit" NOT NULL DEFAULT 'PER_SQFT',
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "gstSlabId" TEXT,
    "gstRatePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAttachment" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatusId" TEXT,
    "toStatusId" TEXT NOT NULL,
    "note" TEXT,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashDeposit" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "depositedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bankReference" TEXT,
    "note" TEXT,
    "depositedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSource" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "entity" "CustomFieldEntity" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL DEFAULT 'TEXT',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "helpText" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "clientId" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "company" TEXT,
    "location" TEXT,
    "sourceId" TEXT,
    "workflowId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "ownerId" TEXT,
    "estimatedValue" DECIMAL(14,2),
    "expectedDate" TIMESTAMP(3),
    "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
    "notes" TEXT,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "convertedOrderId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadStatusHistory" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fromStatusId" TEXT,
    "toStatusId" TEXT NOT NULL,
    "note" TEXT,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "tenantId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUser_email_key" ON "PlatformUser"("email");

-- CreateIndex
CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_code_key" ON "Role"("tenantId", "code");

-- CreateIndex
CREATE INDEX "GstSlab_tenantId_isActive_idx" ON "GstSlab"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "GstSlab_tenantId_name_key" ON "GstSlab"("tenantId", "name");

-- CreateIndex
CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_code_key" ON "User"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_phone_key" ON "User"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Client_isActive_idx" ON "Client"("isActive");

-- CreateIndex
CREATE INDEX "Client_tenantId_idx" ON "Client"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_tenantId_code_key" ON "Client"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ClientLocation_clientId_useCount_idx" ON "ClientLocation"("clientId", "useCount");

-- CreateIndex
CREATE INDEX "ClientLocation_tenantId_idx" ON "ClientLocation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientLocation_clientId_name_key" ON "ClientLocation"("clientId", "name");

-- CreateIndex
CREATE INDEX "Material_isActive_sortOrder_idx" ON "Material"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Material_tenantId_idx" ON "Material"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_tenantId_code_key" ON "Material"("tenantId", "code");

-- CreateIndex
CREATE INDEX "MaterialThickness_materialId_isActive_idx" ON "MaterialThickness"("materialId", "isActive");

-- CreateIndex
CREATE INDEX "MaterialThickness_tenantId_idx" ON "MaterialThickness"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialThickness_materialId_valueMm_key" ON "MaterialThickness"("materialId", "valueMm");

-- CreateIndex
CREATE INDEX "SizePreset_isActive_sortOrder_idx" ON "SizePreset"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "SizePreset_tenantId_idx" ON "SizePreset"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SizePreset_tenantId_code_key" ON "SizePreset"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Workflow_kind_isActive_idx" ON "Workflow"("kind", "isActive");

-- CreateIndex
CREATE INDEX "Workflow_tenantId_idx" ON "Workflow"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_tenantId_code_key" ON "Workflow"("tenantId", "code");

-- CreateIndex
CREATE INDEX "WorkflowStatus_workflowId_sortOrder_idx" ON "WorkflowStatus"("workflowId", "sortOrder");

-- CreateIndex
CREATE INDEX "WorkflowStatus_parentId_idx" ON "WorkflowStatus"("parentId");

-- CreateIndex
CREATE INDEX "WorkflowStatus_tenantId_idx" ON "WorkflowStatus"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStatus_workflowId_code_key" ON "WorkflowStatus"("workflowId", "code");

-- CreateIndex
CREATE INDEX "WorkflowTransition_fromStatusId_idx" ON "WorkflowTransition"("fromStatusId");

-- CreateIndex
CREATE INDEX "WorkflowTransition_tenantId_idx" ON "WorkflowTransition"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTransition_workflowId_fromStatusId_toStatusId_key" ON "WorkflowTransition"("workflowId", "fromStatusId", "toStatusId");

-- CreateIndex
CREATE INDEX "StoredFile_checksum_idx" ON "StoredFile"("checksum");

-- CreateIndex
CREATE INDEX "StoredFile_createdAt_idx" ON "StoredFile"("createdAt");

-- CreateIndex
CREATE INDEX "StoredFile_tenantId_idx" ON "StoredFile"("tenantId");

-- CreateIndex
CREATE INDEX "Order_clientId_createdAt_idx" ON "Order"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_statusId_idx" ON "Order"("statusId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE INDEX "Order_tenantId_idx" ON "Order"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_code_key" ON "Order"("tenantId", "code");

-- CreateIndex
CREATE INDEX "OrderItem_materialId_idx" ON "OrderItem"("materialId");

-- CreateIndex
CREATE INDEX "OrderItem_tenantId_idx" ON "OrderItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_lineNo_key" ON "OrderItem"("orderId", "lineNo");

-- CreateIndex
CREATE INDEX "OrderAttachment_orderId_kind_sortOrder_idx" ON "OrderAttachment"("orderId", "kind", "sortOrder");

-- CreateIndex
CREATE INDEX "OrderAttachment_tenantId_idx" ON "OrderAttachment"("tenantId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_changedAt_idx" ON "OrderStatusHistory"("orderId", "changedAt");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_tenantId_idx" ON "OrderStatusHistory"("tenantId");

-- CreateIndex
CREATE INDEX "Payment_orderId_receivedAt_idx" ON "Payment"("orderId", "receivedAt");

-- CreateIndex
CREATE INDEX "Payment_mode_idx" ON "Payment"("mode");

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE INDEX "CashDeposit_paymentId_idx" ON "CashDeposit"("paymentId");

-- CreateIndex
CREATE INDEX "CashDeposit_depositedAt_idx" ON "CashDeposit"("depositedAt");

-- CreateIndex
CREATE INDEX "CashDeposit_tenantId_idx" ON "CashDeposit"("tenantId");

-- CreateIndex
CREATE INDEX "LeadSource_isActive_sortOrder_idx" ON "LeadSource"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "LeadSource_tenantId_idx" ON "LeadSource"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSource_tenantId_code_key" ON "LeadSource"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_entity_isActive_sortOrder_idx" ON "CustomFieldDefinition"("entity", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_tenantId_idx" ON "CustomFieldDefinition"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_tenantId_entity_key_key" ON "CustomFieldDefinition"("tenantId", "entity", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_convertedOrderId_key" ON "Lead"("convertedOrderId");

-- CreateIndex
CREATE INDEX "Lead_statusId_idx" ON "Lead"("statusId");

-- CreateIndex
CREATE INDEX "Lead_ownerId_idx" ON "Lead"("ownerId");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_tenantId_idx" ON "Lead"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_tenantId_code_key" ON "Lead"("tenantId", "code");

-- CreateIndex
CREATE INDEX "LeadStatusHistory_leadId_changedAt_idx" ON "LeadStatusHistory"("leadId", "changedAt");

-- CreateIndex
CREATE INDEX "LeadStatusHistory_tenantId_idx" ON "LeadStatusHistory"("tenantId");

-- CreateIndex
CREATE INDEX "AppSetting_tenantId_idx" ON "AppSetting"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_tenantId_key_key" ON "AppSetting"("tenantId", "key");

-- CreateIndex
CREATE INDEX "DocumentSequence_tenantId_idx" ON "DocumentSequence"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_tenantId_key_key" ON "DocumentSequence"("tenantId", "key");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientLocation" ADD CONSTRAINT "ClientLocation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialThickness" ADD CONSTRAINT "MaterialThickness_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStatus" ADD CONSTRAINT "WorkflowStatus_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStatus" ADD CONSTRAINT "WorkflowStatus_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkflowStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "WorkflowStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTransition" ADD CONSTRAINT "WorkflowTransition_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "WorkflowStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ClientLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "WorkflowStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_gstSlabId_fkey" FOREIGN KEY ("gstSlabId") REFERENCES "GstSlab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_sizePresetId_fkey" FOREIGN KEY ("sizePresetId") REFERENCES "SizePreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_materialThicknessId_fkey" FOREIGN KEY ("materialThicknessId") REFERENCES "MaterialThickness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_gstSlabId_fkey" FOREIGN KEY ("gstSlabId") REFERENCES "GstSlab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttachment" ADD CONSTRAINT "OrderAttachment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttachment" ADD CONSTRAINT "OrderAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "WorkflowStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "WorkflowStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDeposit" ADD CONSTRAINT "CashDeposit_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDeposit" ADD CONSTRAINT "CashDeposit_depositedById_fkey" FOREIGN KEY ("depositedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "WorkflowStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusHistory" ADD CONSTRAINT "LeadStatusHistory_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusHistory" ADD CONSTRAINT "LeadStatusHistory_fromStatusId_fkey" FOREIGN KEY ("fromStatusId") REFERENCES "WorkflowStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusHistory" ADD CONSTRAINT "LeadStatusHistory_toStatusId_fkey" FOREIGN KEY ("toStatusId") REFERENCES "WorkflowStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStatusHistory" ADD CONSTRAINT "LeadStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
