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
  'Estimate', 'EstimateItem', 'FirmProfile', 'Notification', 'LedgerEntry',
  'NotificationTemplate', 'Expense', 'ExpenseOption', 'ExpenseEditHistory',
  'Employee', 'Attendance', 'PayStructure', 'SalaryAdvance', 'SalaryRun', 'Payslip',
]);


/**
 * Models that name a tenant without belonging to one.
 *
 * The operational logs record which workspace a request was for, because a
 * pattern is only visible across them — but they are ours rather than the
 * shop's, they live in the platform database, and scoping them to a tenant
 * would hide exactly the view they exist for. Listed here rather than left out
 * quietly, so the coverage spec can tell a deliberate exception from an
 * omission that leaks one business's rows into another's.
 */
export const PLATFORM_MODELS_NAMING_A_TENANT = new Set(['ServerLog', 'ClientLog']);
