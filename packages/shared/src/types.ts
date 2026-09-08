import type { LengthUnit } from './units';

/** Wire types. Every *Mm field is millimetres — the only stored unit. */

export type UserRole = 'ADMIN' | 'MANAGER' | 'SALES' | 'PRODUCTION' | 'VIEWER';
export type StatusCategory = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type AttachmentKind = 'REFERENCE_IMAGE' | 'SIZE_IMAGE' | 'DOCUMENT';
export type StorageBackend = 'S3' | 'DATABASE';
export type WorkflowKind = 'ORDER' | 'LEAD';
export type CustomFieldType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'NUMBER'
  | 'DATE'
  | 'BOOLEAN'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'PHONE'
  | 'EMAIL';
export type CustomFieldEntity = 'LEAD' | 'ORDER' | 'CLIENT';

export interface AuthUser {
  id: string;
  code?: string;
  name?: string;
  role?: UserRole;
  /** The role's display name, which a tenant admin can rename. */
  roleName?: string;
  /** What this person may do. Screens gate on these, never on the role name. */
  permissions: string[];
  /** Set for platform admins, who belong to no workspace. */
  isPlatform?: boolean;
  /** Which job they do on the platform side: OWNER, SUPPORT, BILLING, ENGINEER. */
  platformRole?: string;
  /**
   * Set when somebody from the platform is inside this workspace to help.
   *
   * Everything they do is signed with their name in the shop's own history, and
   * the screen says so the whole time: a support session that looks like an
   * ordinary one is how a shop ends up believing its own admin did something.
   */
  impersonatedBy?: { id: string; name: string };
  /**
   * The workspace they signed into, and what it has bought.
   *
   * The menu is filtered by this as well as by permissions: the plan decides
   * what the business has, the role decides who inside it may touch it.
   */
  workspace?: Workspace;
}

export interface Workspace {
  slug: string;
  tenantId: string;
  modules?: string[];
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
  /** Which workspace was signed in to. Absent for a platform sign-in. */
  workspace?: Workspace;
}

export type TenantIsolation = 'SHARED' | 'DEDICATED';
export type TenantStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  isolation: TenantIsolation;
  status: TenantStatus;
  plan?: string | null;
  /** Modules granted on top of the plan. */
  modules?: string[];
  /** What the plan and the extras add up to, worked out by the API. */
  effectiveModules?: string[];
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  hasDedicatedDatabase: boolean;
  createdAt: string;
  /**
   * Is anybody using it, and is it working for them?
   *
   * Read from the operational log rather than from the shop's own data: a
   * workspace full of orders that nobody has opened for three weeks is a
   * different problem from a quiet one.
   */
  health?: {
    lastSeenAt: string | null;
    writes: number;
    failures: number;
    clientErrors: number;
  };
  counts?: {
    users: number | null;
    orders: number | null;
    clients: number | null;
    unreachable?: boolean;
  };
}

export interface GstSlab {
  id: string;
  name: string;
  ratePct: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

export type PaymentMode = 'CASH' | 'ONLINE';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'RECEIVED';
export type PricingMode = 'ITEMISED' | 'LUMP_SUM';

/**
 * How an order's GST relates to the figure the client was quoted.
 *
 * - EXCLUSIVE — the quote is before tax; GST goes on top.
 * - INCLUSIVE — the quote is what they pay; GST comes out of it.
 * - ABSORBED  — the client cannot take a GST bill, so they pay the quoted
 *   figure and the shop absorbs the tax. Splits like INCLUSIVE; what was given
 *   up is recorded separately.
 */
export type TaxTreatment = 'EXCLUSIVE' | 'INCLUSIVE' | 'ABSORBED';

export type RateUnit = 'PER_SQFT' | 'PER_SQM' | 'PER_PIECE' | 'PER_RFT' | 'LUMP_SUM';

export interface CashDeposit {
  id: string;
  amount: string;
  depositedAt: string;
  bankReference?: string | null;
  note?: string | null;
}

export interface Payment {
  id: string;
  amount: string;
  mode: PaymentMode;
  reference?: string | null;
  note?: string | null;
  receivedAt: string;
  receivedBy?: { id: string; name: string } | null;
  deposits: CashDeposit[];
  /**
   * Set on a row that takes an earlier receipt back — its amount is negative.
   * A receipt is never edited or deleted; it is corrected by its opposite.
   */
  reversalOfId?: string | null;
  /** Why it was taken back. On the correction, not on the original. */
  reason?: string | null;
  /** Present on a receipt that has since been taken back. */
  reversedBy?: { id: string; receivedAt: string; reason?: string | null } | null;
}

export interface PaymentSummary {
  orderId: string;
  total: number;
  received: number;
  pending: number;
  status: PaymentStatus;
  receivedPct: number;
  cash: { received: number; deposited: number; inHand: number };
  online: { received: number };
  payments: Payment[];
}

/**
 * One movement of money, whatever kind it was.
 *
 * Payouts are deliberately not among these: they have a ledger of their own,
 * and folding them in here would be the netting-off the books must not do.
 * Spending is, because it belongs to no one order.
 */
export const TRANSACTION_KINDS = [
  'PAYMENT_CASH',
  'PAYMENT_ONLINE',
  'BANK_DEPOSIT',
  'EXPENSE',
] as const;

export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export interface Transaction {
  id: string;
  kind: TransactionKind;
  /**
   * IN is money arriving, TRANSFER is money the shop already had changing
   * hands (cash walked to the bank), OUT is money leaving. Adding a TRANSFER
   * to the takings would count the same rupees twice.
   */
  direction: 'IN' | 'OUT' | 'TRANSFER';
  at: string;
  amount: number;
  reference?: string | null;
  note?: string | null;
  order?: { id: string; code: string; client: { name: string } } | null;
  by?: { id: string; name: string } | null;
}

/** What each kind is called on screen, so neither client invents its own. */
export const TRANSACTION_LABELS: Record<TransactionKind, string> = {
  PAYMENT_CASH: 'Cash in',
  PAYMENT_ONLINE: 'Online in',
  BANK_DEPOSIT: 'Banked',
  EXPENSE: 'Spent',
};

export interface CashPosition {
  cash: {
    received: number;
    deposited: number;
    /** Cash handed out of the drawer — a payout settled in cash, and later an
     * expense paid the same way. Shown on its own line: it leaves the drawer,
     * but it never reduces the order it came from. */
    paidOut: number;
    inHand: number;
    receipts: number;
    depositsUnallocated: number;
  };
  online: { received: number; receipts: number };
  deposits: number;
}

export interface CashInHandRow {
  paymentId: string;
  orderId: string;
  orderCode: string;
  client: string;
  received: number;
  deposited: number;
  inHand: number;
  receivedAt: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; pages: number };
}

export interface ClientLocation {
  id: string;
  name: string;
  address?: string | null;
  useCount?: number;
}

export interface Client {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  /** A second number for the same firm — the site contact, usually. */
  altPhone?: string | null;
  email?: string | null;
  gstin?: string | null;
  /** The trading name on their paperwork, rarely the person's own name. */
  company?: string | null;
  /** GST state, which decides CGST+SGST versus IGST on their documents. */
  stateCode?: string | null;
  stateName?: string | null;
  address?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  notes?: string | null;
  isActive: boolean;
  locations?: ClientLocation[];
  _count?: { orders: number };
}

export interface MaterialThickness {
  id: string;
  valueMm: string;
  label?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  color?: string | null;
  sortOrder: number;
  isActive: boolean;
  thicknesses: MaterialThickness[];
}

export interface SizePreset {
  id: string;
  code: string;
  name: string;
  lengthMm: string;
  widthMm: string;
  thicknessMm?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface WorkflowStatus {
  id: string;
  workflowId: string;
  code: string;
  name: string;
  color: string;
  category: StatusCategory;
  parentId?: string | null;
  isInitial: boolean;
  isTerminal: boolean;
  sortOrder: number;
  canvasX: number;
  canvasY: number;
  /** Position on the home screen's summary, or null when it is not on it. */
  homeCardOrder?: number | null;
  _count?: { ordersAtStatus: number };
}

/**
 * How many stages the home screen's summary holds.
 *
 * Five, because the card is read at a glance from across a workshop — a longer
 * list stops being a summary.
 */
export const HOME_CARD_LIMIT = 5;

export interface WorkflowTransition {
  id: string;
  workflowId: string;
  fromStatusId: string;
  toStatusId: string;
  label?: string | null;
  requiresNote: boolean;
  allowedRoles: UserRole[];
}

export interface Workflow {
  /** Days an enquiry may sit untouched before it goes quiet. Lead flows only. */
  leadExpiryDays?: number | null;
  /** The stage an enquiry moves to when a quote is sent. Lead flows only. */
  quoteStatusId?: string | null;
  /** Where an enquiry goes when the client turns the quote down. */
  lostStatusId?: string | null;
  id: string;
  code: string;
  name: string;
  description?: string | null;
  kind: WorkflowKind;
  isDefault: boolean;
  isActive: boolean;
  statuses: WorkflowStatus[];
  transitions: WorkflowTransition[];
  _count?: { statuses: number; transitions: number; orders: number };
}

export interface StoredFileRef {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  originalByteSize?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface OrderAttachment {
  id: string;
  kind: AttachmentKind;
  description?: string | null;
  sortOrder: number;
  file: StoredFileRef;
}

export interface OrderItem {
  id: string;
  lineNo: number;
  sizePresetId?: string | null;
  sizePreset?: { id: string; code: string; name: string } | null;
  lengthMm: string;
  widthMm: string;
  thicknessMm?: string | null;
  materialId: string;
  material: { id: string; code: string; name: string; color?: string | null };
  materialThickness?: { id: string; valueMm: string; label?: string | null } | null;
  quantity: number;
  notes?: string | null;
  rate?: string | null;
  rateUnit: RateUnit;
  amount: string;
  gstSlabId?: string | null;
  gstRatePct: string;
  taxAmount: string;
  /** Same dimensions converted to the unit the request asked for. */
  display?: {
    unit: LengthUnit;
    length: number;
    width: number;
    /** Thickness carries its own unit — millimetres by default. */
    thicknessUnit: LengthUnit;
    thickness: number | null;
  };
}

export interface OrderStatusHistoryEntry {
  id: string;
  fromStatus?: { id: string; name: string; color: string } | null;
  toStatus: { id: string; name: string; color: string };
  note?: string | null;
  /** The move went back the way it came, which the flow does not draw. */
  reversed?: boolean;
  changedBy?: { id: string; name: string } | null;
  changedAt: string;
}

export interface Order {
  id: string;
  code: string;
  client: Pick<Client, 'id' | 'code' | 'name' | 'phone' | 'company'>;
  location: string;
  status: {
    id: string;
    code: string;
    name: string;
    color: string;
    category: StatusCategory;
  };
  workflow: { id: string; code: string; name: string };
  priority: Priority;
  dueDate?: string | null;
  notes?: string | null;
  pricingMode: PricingMode;
  /** How the quoted figure relates to the GST on it. */
  taxTreatment: TaxTreatment;
  /** What the client was actually told, before any of the tax arithmetic. */
  quotedAmount: string;
  /** Under ABSORBED, the GST the shop chose not to charge on top. */
  taxDiscount: string;
  subtotal: string;
  discount: string;
  /** Taxable value, before GST. */
  total: string;
  taxAmount: string;
  /** What the client owes. Payments settle against this. */
  grandTotal: string;
  paymentStatus: PaymentStatus;
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  attachments: OrderAttachment[];
  statusHistory?: OrderStatusHistoryEntry[];
}

export interface OrderBoard {
  workflow: { id: string; code: string; name: string };
  /** `orders` is a capped slice of the column; `total` is what is really in it. */
  columns: { status: WorkflowStatus; orders: Order[]; total: number }[];
}

/** A value plus the unit it was typed in; the API converts to mm. */
export interface Measurement {
  value: number;
  unit: LengthUnit;
}

export interface PunchItemInput {
  sizePresetId?: string;
  rate?: number;
  rateUnit?: RateUnit;
  gstSlabId?: string;
  length?: Measurement;
  width?: Measurement;
  thickness?: Measurement;
  materialId: string;
  materialThicknessId?: string;
  quantity?: number;
  notes?: string;
}

export interface PunchOrderInput {
  clientId?: string;
  startStatusId?: string;
  pricingMode?: PricingMode;
  taxTreatment?: TaxTreatment;
  discount?: number;
  /** The quoted figure, for a LUMP_SUM order. */
  total?: number;
  gstSlabId?: string;
  newClient?: { name: string; phone?: string; email?: string; company?: string; address?: string };
  location: string;
  workflowId?: string;
  priority?: Priority;
  dueDate?: string;
  notes?: string;
  items: PunchItemInput[];
}


// -- leads ------------------------------------------------------------------

export interface LeadSource {
  id: string;
  code: string;
  name: string;
  color?: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** Admin-defined field. Lead forms are generated from these. */
export interface CustomFieldDefinition {
  id: string;
  entity: CustomFieldEntity;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  helpText?: string | null;
  required: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface Lead {
  id: string;
  code: string;
  title: string;
  client?: Pick<Client, 'id' | 'code' | 'name' | 'phone'> | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  company?: string | null;
  location?: string | null;
  source?: LeadSource | null;
  status: {
    id: string;
    code: string;
    name: string;
    color: string;
    category: StatusCategory;
  };
  owner?: { id: string; name: string } | null;
  priority: Priority;
  estimatedValue?: string | null;
  /** What was actually quoted, from the estimate that was sent. */
  quotedValue?: string | null;
  expectedDate?: string | null;
  notes?: string | null;
  customFields: Record<string, unknown>;
  convertedOrderId?: string | null;
  convertedOrder?: { id: string; code: string } | null;
  convertedAt?: string | null;
  createdAt: string;
  /** Last touched. What decides whether an enquiry has gone quiet. */
  updatedAt: string;
  statusHistory?: OrderStatusHistoryEntry[];
  /** The quotes written for this enquiry, newest first. */
  estimates?: LeadEstimate[];
}

export interface LeadBoard {
  workflow: { id: string; code: string; name: string };
  /** `leads` is a capped slice; `total` and `value` describe the whole column. */
  columns: { status: WorkflowStatus; leads: Lead[]; total: number; value: number }[];
}

export interface CreateLeadInput {
  title: string;
  clientId?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  company?: string;
  location?: string;
  sourceId?: string;
  ownerId?: string;
  priority?: Priority;
  estimatedValue?: number;
  expectedDate?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
}


// -- disbursements ----------------------------------------------------------

export type DisbursementStatus = 'PLANNED' | 'PAID' | 'CANCELLED';

export interface DisbursementCategory {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

/**
 * Money paid out of an order to someone else after the client has paid.
 * The order's own value and payment status are unaffected by these.
 */
export interface Disbursement {
  id: string;
  orderId: string;
  category?: DisbursementCategory | null;
  payeeName: string;
  payeeContact?: string | null;
  amount: string;
  status: DisbursementStatus;
  paidAt?: string | null;
  paidMode?: PaymentMode | null;
  reference?: string | null;
  note?: string | null;
  recordedBy?: { id: string; name: string } | null;
  createdAt: string;
  order?: { id: string; code: string; client: { name: string } };
}

export interface DisbursementSummary {
  orderId: string;
  /** What the tenant calls these. Configurable. */
  label: string;
  total: number;
  paid: number;
  pending: number;
  count: number;
  disbursements: Disbursement[];
}

export interface DisbursementLedger extends Paginated<Disbursement> {
  label: string;
  /** Totals for the whole filtered ledger, not just the page in hand. */
  totals: { total: number; paid: number; pending: number; count: number };
}

// ---------------------------------------------------------------------------
// The firm's own details, and the documents it prints
// ---------------------------------------------------------------------------

/**
 * What the shop puts on its own paperwork. One per tenant.
 *
 * Stored as fields rather than only as an uploaded image so a firm that changes
 * its phone number does not have to redraw its letterhead — but an uploaded
 * letterhead is used as the page background where one exists.
 */
export interface FirmProfile {
  id: string;
  name: string;
  gstin?: string | null;
  /** GST state code and name. Decides CGST+SGST versus IGST on a document. */
  stateCode?: string | null;
  stateName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;

  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankBranch?: string | null;

  termsAndConditions?: string | null;
  signatoryName?: string | null;

  letterheadFileId?: string | null;
  logoFileId?: string | null;
  /** The accent on printed documents — estimates, bills. */
  accentColor: string;
  /** The accent the app and the web are painted in. */
  themeAccent: string;
  updatedAt: string;
}

export type EstimateStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CONVERTED';

export interface EstimateItem {
  id: string;
  lineNo: number;
  name: string;
  description?: string | null;
  /** HSN for goods, SAC for services. */
  hsnSac?: string | null;
  quantity: string;
  unit: string;
  ratePerUnit: string;
  discountPct: string;
  discountAmount: string;
  gstSlabId?: string | null;
  gstRatePct: string;
  taxAmount: string;
  /** Taxable value after the line discount. */
  netAmount: string;
  /** What the line comes to including its GST. */
  amount: string;
}

export interface Estimate {
  id: string;
  code: string;
  clientId?: string | null;
  client?: Client | null;
  clientName?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  clientGstin?: string | null;
  clientStateCode?: string | null;

  status: EstimateStatus;
  issuedOn: string;
  validTill?: string | null;
  notes?: string | null;
  termsOverride?: string | null;
  taxTreatment: TaxTreatment;

  subtotal: string;
  discount: string;
  total: string;
  cgst: string;
  sgst: string;
  igst: string;
  taxAmount: string;
  grandTotal: string;
  /** Discount plus the tax that would have ridden on it. */
  savedAmount: string;

  orderId?: string | null;
  /** The enquiry this was quoted for, where there was one. */
  leadId?: string | null;
  lead?: {
    id: string;
    code: string;
    title: string;
    convertedOrderId?: string | null;
    status?: { id: string; name: string; color: string } | null;
  } | null;
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  items: EstimateItem[];
}

/** A quote as it appears on the enquiry it was written for. */
export interface LeadEstimate {
  id: string;
  code: string;
  status: EstimateStatus;
  grandTotal: string;
  issuedOn: string;
  validTill?: string | null;
  orderId?: string | null;
}

export interface EstimateItemInput {
  name: string;
  description?: string;
  hsnSac?: string;
  quantity: number;
  unit?: string;
  ratePerUnit: number;
  /** A percentage off this line; the money is computed from it. */
  discountPct?: number;
  gstSlabId?: string;
}

export interface EstimateInput {
  clientId?: string;
  clientName?: string;
  /** The enquiry this is being quoted for, where there is one. */
  leadId?: string;
  billingAddress?: string;
  shippingAddress?: string;
  validTill?: string;
  notes?: string;
  termsOverride?: string;
  taxTreatment?: TaxTreatment;
  items: EstimateItemInput[];
}

// ---------------------------------------------------------------------------
// Releases — the app binary and what it runs
// ---------------------------------------------------------------------------
//
// One app in the stores for every workspace, so none of this belongs to a
// tenant. A shop's admin decides how their shop works; only the people who own
// the product decide what code the phone is running.

export type ReleasePlatform = 'ios' | 'android';
export type ReleaseKind = 'UPDATE' | 'ROLLBACK';
export type ReleaseStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Release {
  id: string;
  channel: string;
  runtimeVersion: string;
  platform: ReleasePlatform;
  kind: ReleaseKind;
  status: ReleaseStatus;
  /** 0–100, sticky per install: raising it only ever adds people. */
  rolloutPercent: number;
  /** The build number within its channel, platform and runtime version. */
  sequence: number;
  changelog?: string | null;
  publishedBy?: string | null;
  createdAt: string;
  activatedAt?: string | null;
  _count?: { assets: number };
}

export interface ReleaseAsset {
  id: string;
  isLaunchAsset: boolean;
  key: string;
  contentType: string;
  fileExtension: string;
  byteSize: number;
}

/** The floor under which a binary is asked, or told, to update. */
export interface VersionGate {
  id: string;
  platform: ReleasePlatform;
  channel: string;
  minimumVersion: string;
  recommendedVersion?: string | null;
  message?: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

/** Which dropdown on the expense form an option feeds. */
export const EXPENSE_OPTION_FIELDS = [
  'PAYMENT_TYPE',
  'DONE_BY',
  'VENDOR',
  'SPENT_TYPE',
  'TO_NAME',
] as const;

export type ExpenseOptionField = (typeof EXPENSE_OPTION_FIELDS)[number];

/** What each list is called on the form and on the config screen. */
export const EXPENSE_FIELD_LABELS: Record<ExpenseOptionField, string> = {
  PAYMENT_TYPE: 'Paid by',
  DONE_BY: 'Spent by',
  VENDOR: 'Attributed to',
  SPENT_TYPE: 'Category',
  TO_NAME: 'Paid to',
};

/** A shorter word for the same list, where a form label has to fit. */
export const EXPENSE_FIELD_HINTS: Record<ExpenseOptionField, string> = {
  PAYMENT_TYPE: 'Cash, UPI, cheque — whichever the shop uses',
  DONE_BY: 'Whoever in the shop handed the money over',
  VENDOR: 'Whose money it was, when that is not the shop',
  SPENT_TYPE: 'What kind of spending this is',
  TO_NAME: 'Who received it',
};

export interface ExpenseOption {
  id: string;
  field: ExpenseOptionField;
  label: string;
  /** PAYMENT_TYPE only: CASH means it comes out of the drawer. */
  account?: 'CASH' | 'BANK' | null;
  isActive: boolean;
  sortOrder: number;
}

/** The active labels for each list, ready for the form. */
export type ExpenseFormOptions = Record<ExpenseOptionField, string[]>;

export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;
  paymentType: string;
  doneBy: string;
  toName: string;
  vendor: string;
  spentType: string;
  note?: string | null;
  vendorGstin?: string | null;
  taxableValue?: number | null;
  taxAmount?: number | null;
  itcEligible: boolean;
  billFileId?: string | null;
  bill?: { id: string; fileName: string; mimeType: string; byteSize: number } | null;
  orderId?: string | null;
  order?: { id: string; code: string; client: { name: string } } | null;
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpensePage extends Paginated<Expense> {
  /** The whole filtered set, not the page on screen. */
  total: number;
}

export interface ExpenseSlice {
  label: string;
  amount: number;
  count: number;
}

export interface ExpenseAnalytics {
  total: number;
  count: number;
  monthly: { month: string; amount: number }[];
  bySpentType: ExpenseSlice[];
  byDoneBy: ExpenseSlice[];
  byPaymentType: ExpenseSlice[];
  byVendor: ExpenseSlice[];
  byToName: ExpenseSlice[];
}

/** What a form sends when recording or correcting an expense. */
export interface ExpenseInput {
  date: string;
  description: string;
  amount: number;
  paymentType: string;
  doneBy: string;
  toName: string;
  vendor: string;
  spentType: string;
  note?: string;
  vendorGstin?: string;
  taxableValue?: number;
  taxAmount?: number;
  itcEligible?: boolean;
  billFileId?: string;
  orderId?: string;
}
