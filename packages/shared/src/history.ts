/**
 * What happened to something, in words both clients say the same way.
 *
 * The API records changes as field names and values; how those read to a person
 * belongs here, once, rather than in a web component and again in a screen. A
 * history that says "Rate: ₹100 → ₹150" on one client and "rate changed" on the
 * other is two products.
 */

export type HistoryKind = 'created' | 'changed' | 'deleted' | 'moved';

export interface HistoryChange {
  field: string;
  from: unknown;
  to: unknown;
}

export interface HistoryEntry {
  id: string;
  /** ISO timestamp. */
  at: string;
  kind: HistoryKind;
  /** The dotted name it was recorded under: `order.updated`, `order.moved_back`. */
  action: string;
  /** What it happened to — `Order`, `OrderItem`, `Payment`. */
  entity: string;
  entityId: string;
  entityCode?: string | null;
  /** Who did it, already resolved to a name. */
  by?: string | null;
  /** Why, when somebody said. */
  reason?: string | null;
  /** A status move: where it went. */
  from?: string | null;
  to?: string | null;
  /** True when the move went back the way it came. */
  reversed?: boolean;
  changes?: HistoryChange[];
}

/** What a row is called when it is named in a sentence. */
export const ENTITY_LABELS: Record<string, string> = {
  Order: 'Order',
  OrderItem: 'Line',
  OrderAttachment: 'Attachment',
  Payment: 'Payment',
  CashDeposit: 'Deposit',
  Disbursement: 'Payout',
  Lead: 'Enquiry',
  Estimate: 'Quote',
  EstimateItem: 'Quote line',
  Client: 'Client',
  ClientLocation: 'Site',
  User: 'User',
  Role: 'Role',
  Material: 'Material',
  MaterialThickness: 'Thickness',
  SizePreset: 'Size',
  Workflow: 'Flow',
  WorkflowStatus: 'Stage',
  WorkflowTransition: 'Move',
  GstSlab: 'GST slab',
  FirmProfile: 'Firm details',
  LeadSource: 'Lead source',
  CustomFieldDefinition: 'Lead field',
  DisbursementCategory: 'Payout category',
  AppSetting: 'Setting',
};

/**
 * Field names as the shop says them.
 *
 * Anything not named here is turned into words from the column name, which is
 * right often enough that listing every column would be worse than useless — it
 * would be a second place to forget.
 */
export const FIELD_LABELS: Record<string, string> = {
  amount: 'Amount',
  altPhone: 'Second phone',
  billingAddress: 'Billing address',
  clientId: 'Client',
  code: 'Code',
  description: 'Description',
  discountPct: 'Discount',
  dueDate: 'Due date',
  estimatedValue: 'Estimated value',
  expectedCloseDate: 'Expected close',
  gstin: 'GSTIN',
  gstRatePct: 'GST rate',
  grandTotal: 'Grand total',
  heightMm: 'Height',
  isActive: 'Active',
  lineTotal: 'Line total',
  materialId: 'Material',
  mode: 'Paid by',
  name: 'Name',
  notes: 'Notes',
  paidAt: 'Paid on',
  phone: 'Phone',
  priority: 'Priority',
  pricingMode: 'Priced by',
  quantity: 'Quantity',
  quotedValue: 'Quoted value',
  rate: 'Rate',
  rateUnit: 'Rate unit',
  reference: 'Reference',
  shippingAddress: 'Shipping address',
  sortOrder: 'Order',
  statusId: 'Stage',
  subtotal: 'Subtotal',
  taxAmount: 'Tax',
  taxTreatment: 'GST treatment',
  thicknessMm: 'Thickness',
  total: 'Total',
  widthMm: 'Width',
};

/** Columns nobody wants to read about: ids and bookkeeping. */
const NOT_WORTH_SHOWING = new Set([
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'createdById',
  'updatedById',
  'searchText',
]);

export function fieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  // amountPaid → "Amount paid"; a decent guess beats a raw column name.
  const words = field
    .replace(/Id$/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity;
}

/** The changes worth putting in front of somebody. */
export function shownChanges(entry: HistoryEntry): HistoryChange[] {
  return (entry.changes ?? []).filter((change) => !NOT_WORTH_SHOWING.has(change.field));
}

/** A value, as a person reads it. */
export function historyValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'number') return String(value);
  const text = String(value);
  // An ISO timestamp is unreadable and its date is usually the point.
  const date = /^(\d{4})-(\d{2})-(\d{2})T/.exec(text);
  return date ? `${date[3]}/${date[2]}/${date[1]}` : text;
}

/** One line saying what happened, without the detail underneath it. */
export function describeHistory(entry: HistoryEntry): string {
  const what = entityLabel(entry.entity).toLowerCase();

  if (entry.kind === 'moved') {
    const move = entry.from ? `${entry.from} → ${entry.to}` : `Punched at ${entry.to}`;
    return entry.reversed ? `${move} · went back` : move;
  }
  if (entry.kind === 'created') return `${entityLabel(entry.entity)} added`;
  if (entry.kind === 'deleted') return `${entityLabel(entry.entity)} removed`;

  const changes = shownChanges(entry);
  if (changes.length === 0) return `${entityLabel(entry.entity)} edited`;
  if (changes.length === 1) return `${fieldLabel(changes[0].field)} changed`;
  return `${changes.length} things changed on the ${what}`;
}
