/**
 * Models that hold one tenant's business data.
 *
 * Anything listed here is filtered by tenantId on every read and stamped with
 * it on every write. Tenant and PlatformUser are deliberately absent: they are
 * the control plane and span tenants by definition.
 */
export const TENANT_SCOPED_MODELS = new Set([
  'User', 'Role', 'GstSlab', 'Client', 'ClientLocation', 'Material',
  'MaterialThickness', 'SizePreset', 'Workflow', 'WorkflowStatus',
  'WorkflowTransition', 'StoredFile', 'Order', 'OrderItem', 'OrderAttachment',
  'OrderStatusHistory', 'Payment', 'CashDeposit', 'LeadSource',
  'CustomFieldDefinition', 'Lead', 'LeadStatusHistory', 'AppSetting',
  'DocumentSequence', 'AuditLog', 'Disbursement', 'DisbursementCategory',
  'Estimate', 'EstimateItem', 'FirmProfile',
]);

