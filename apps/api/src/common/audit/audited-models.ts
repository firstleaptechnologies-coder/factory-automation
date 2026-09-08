import { TENANT_SCOPED_MODELS } from '../tenancy/tenant-models';

/**
 * What gets a history, and what deliberately does not.
 *
 * Every model holding a shop's business data is audited. The exemptions are
 * listed with the reason rather than left out quietly, and a specification test
 * checks that every tenant-scoped model appears in one list or the other — so a
 * model added next year is a failing test, not a silent gap in the trail.
 */
export const NOT_AUDITED: Record<string, string> = {
  AuditLog: 'the trail itself',
  OrderStatusHistory:
    'already a history, written as the move happens and shown beside this one',
  LeadStatusHistory: 'already a history',
  DocumentSequence:
    'a counter — every order punched would write a row saying a number went up by one',
  StoredFile:
    'holds the file bytes; a diff of it would copy every uploaded photo into the log',
  Notification:
    'already a record of something that happened; auditing it would log the log',
  LedgerEntry:
    'a posting of rows that are audited already — auditing it would say everything twice',
};

export const AUDITED_MODELS: Set<string> = new Set(
  [...TENANT_SCOPED_MODELS].filter((model) => !(model in NOT_AUDITED)),
);

/**
 * Columns never copied into the trail.
 *
 * A history that quotes a password hash or another business's connection string
 * is a leak with a nice interface on it.
 */
export const NEVER_LOGGED = new Set(['data', 'passwordHash', 'databaseUrl']);

/** Long text is summarised rather than duplicated in full. */
export const MAX_VALUE_LENGTH = 500;

/** How many rows one bulk write may record individually before it summarises. */
export const MAX_ROWS_PER_WRITE = 200;

/**
 * What a row belongs to, when it is part of something bigger.
 *
 * An order's history is not only the order's own columns: it is the line whose
 * rate was corrected, the payment that was taken, the photo that was replaced.
 * Each of those is its own row with its own id, so the trail records which
 * order it hangs off and the history reads as one story.
 */
export const BELONGS_TO: Record<string, { entity: string; field: string }> = {
  OrderItem: { entity: 'Order', field: 'orderId' },
  OrderAttachment: { entity: 'Order', field: 'orderId' },
  Payment: { entity: 'Order', field: 'orderId' },
  Disbursement: { entity: 'Order', field: 'orderId' },
  EstimateItem: { entity: 'Estimate', field: 'estimateId' },
  ClientLocation: { entity: 'Client', field: 'clientId' },
  MaterialThickness: { entity: 'Material', field: 'materialId' },
  WorkflowStatus: { entity: 'Workflow', field: 'workflowId' },
  WorkflowTransition: { entity: 'Workflow', field: 'workflowId' },
};
