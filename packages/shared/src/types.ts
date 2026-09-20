import type { LetterKind } from './letters';

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
  'PURCHASE',
  'SALARY',
  'ADVANCE',
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
  PURCHASE: 'Bought',
  SALARY: 'Wages',
  ADVANCE: 'Advance',
};

export interface CashPosition {
  cash: {
    received: number;
    deposited: number;
    /** Cash handed out of the drawer — a payout settled in cash, and later an
     * expense paid the same way. Shown on its own line: it leaves the drawer,
     * but it never reduces the order it came from. */
    paidOut: number;
    /** Taken in cash and not yet banked. Differs from `inHand` by `paidOut`. */
    notBanked: number;
    /** What is actually in the drawer. Goes negative when more cash has gone
     * out than the shop has recorded coming in, which is a fact worth seeing
     * rather than a number to hide. */
    inHand: number;
    receipts: number;
    depositsUnallocated: number;
  };
  online: { received: number; receipts: number };
  deposits: number;
}

/**
 * What the shop is owed, and by whom.
 *
 * `owed` and `held` are deliberately two figures. An order short by ₹1,000
 * beside another overpaid by ₹500 is a debt of a thousand and five hundred
 * rupees of somebody else's money, not a net of five hundred — reporting one
 * number would say the debt is smaller than it is.
 */
export interface Outstanding {
  owed: number;
  /** How many orders are short. */
  orders: number;
  /** Taken against orders that came to less than was paid. Not a debt. */
  held: number;
  clients: OutstandingClient[];
}

export interface OutstandingClient {
  clientId: string;
  code: string;
  name: string;
  owed: number;
  orders: number;
}

/**
 * One cash receipt that has not reached the bank.
 *
 * Not "in hand": a payout empties the drawer without touching any receipt, so
 * these sum to more than the shop is holding whenever cash has gone out.
 */
export interface CashToBankRow {
  paymentId: string;
  orderId: string;
  orderCode: string;
  client: string;
  received: number;
  deposited: number;
  notBanked: number;
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
  /** Set on the row that takes another back, and on the one taken back. */
  reversalOfId?: string | null;
  reversedBy?: { id: string } | null;
  /** Why it was taken back. */
  reason?: string | null;
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

/**
 * The OTA channels, and the only ones anything publishes to.
 *
 * A channel is baked into a binary — `expo-channel-name` in the native files —
 * so this list is not a preference, it is the set of names a real app will ever
 * ask about. A release or a version gate written against any other channel is
 * one nothing will ever read.
 *
 * `development` is carried by TestFlight and Play-internal builds and served by
 * staging; `production` is carried by App Store and Play-production builds.
 * They are named for the branch that publishes them, which is why neither is
 * called "staging" — the environment is staging, the channel is development.
 *
 * deploy/environments.json is where the deployments themselves are described,
 * and ota-channels.spec.ts fails if the two disagree.
 */
export const OTA_CHANNELS = ['development', 'production'] as const;

export type OtaChannel = (typeof OTA_CHANNELS)[number];

/**
 * Which channel a release screen opens on.
 *
 * Production, not the first in the list. The list is in pipeline order —
 * development is where a change goes first — but the screen answers "what are
 * shops running", and that is production. Opening on development would show an
 * empty list most days and bury the one that matters.
 */
export const DEFAULT_OTA_CHANNEL: OtaChannel = 'production';

/**
 * Which channel a deployment manages.
 *
 * One deployment, one channel: the staging API publishes to `development` and
 * the production API to `production`, and each has its own database, so the
 * rows for the other channel are not merely hidden — they do not exist there.
 * A release screen that offered both would therefore be offering one real
 * list and one permanently empty one, and inviting somebody to record a store
 * build against a channel this deployment can never serve.
 *
 * The environment is not the channel — the environment is `staging`, the
 * channel it serves is `development`. Naming one after the other is the
 * specific mistake `ota-channels.spec.ts` exists to stop coming back, so the
 * mapping is written down once, here, and checked against
 * `deploy/environments.json`.
 */
/**
 * The rungs a rollout is walked up.
 *
 * Publishing is a staged decision — up a rung, watch, up again — not a number
 * somebody types; nobody has ever wanted to type "37". Zero is deliberately
 * not a rung: that is Pause, which keeps a release live while serving nobody,
 * and it is a different intention that belongs with the other second thoughts.
 *
 * Written once because it is drawn by both clients and described in the
 * release-flow page, and three copies of a ladder is three chances for the
 * page to describe rungs the screens do not have.
 */
export const ROLLOUT_STEPS = [20, 40, 60, 80, 100] as const;

export const CHANNEL_BY_APP_ENV: Readonly<Record<string, OtaChannel>> = {
  development: 'development',
  staging: 'development',
  production: 'production',
};

/**
 * The channel for a deployment's `APP_ENV`, or null when it names no
 * environment we deploy — null rather than a guess, because guessing
 * `production` for an unknown environment is how a staging screen ends up
 * publishing to shops.
 */
export function channelForAppEnv(appEnv: string | null | undefined): OtaChannel | null {
  if (!appEnv) return null;
  return CHANNEL_BY_APP_ENV[appEnv] ?? null;
}

/**
 * What the newest binary is, and which ones are still allowed to run.
 *
 * Build numbers rather than version strings: the marketing version is for
 * people, the build number is what the binary reports and what can be compared
 * without parsing "1.10.0" against "1.9.0" and getting it backwards.
 */
export interface VersionGate {
  id: string;
  platform: ReleasePlatform;
  channel: string;
  /** The newest native build that exists for this platform and channel. */
  latestBuild: number;
  latestVersionName?: string | null;
  /**
   * Whether the store is serving it yet. Uploading is not publishing — review
   * takes days — and an update prompt for a build nobody can download is a
   * button that does nothing.
   */
  latestIsLive: boolean;
  liveConfirmedAt?: string | null;
  /** Below this, the app stops. Raised by a person, never by a deploy. */
  minSupportedBuild: number;
  storeUrl: string;
  message?: string | null;
  updatedBy?: string | null;
  updatedAt: string;
}

/** What the app is told when it asks whether it may still run. */
export interface VersionCheck {
  supported: boolean;
  updateAvailable: boolean;
  forced: boolean;
  latestBuild?: number;
  latestVersionName?: string | null;
  minSupportedBuild?: number;
  storeUrl?: string;
  message?: string | null;
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
  /** Set on the row that takes another back, and on the one taken back. */
  reversalOfId?: string | null;
  reversedBy?: { id: string } | null;
  /** Why it was taken back. */
  reason?: string | null;
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
  /**
   * Why this is being corrected — about the edit, not the spending.
   *
   * Kept apart from `note`, and shown on the expense's own history so the
   * sentence sits beside the fields it explains.
   */
  editNote?: string;
}

/** One line in an expense's own story. */
export interface ExpenseEdit {
  id: string;
  expenseId: string;
  editType: 'CREATED' | 'UPDATED' | 'REVERSED';
  changes: { field: string; from: string | number | boolean | null; to: string | number | boolean | null }[];
  note?: string | null;
  userId?: string | null;
  userName?: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** A login. Distinct from the person who uses it — see `Employee`. */
export interface WorkspaceUser {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  /** A coarse label kept for display and seeding. */
  role: string;
  /** The role they are actually on — what they may do comes from this. */
  roleId?: string | null;
  roleRef?: { id: string; name: string } | null;
  isActive: boolean;
  createdAt: string;
}

export type EmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'LEFT';

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  ACTIVE: 'Working',
  ON_LEAVE: 'On leave',
  LEFT: 'Left',
};

/**
 * Somebody the shop employs.
 *
 * Not the same thing as a login: most of the floor will never have an account,
 * and an account can be revoked without the person ceasing to exist. Where the
 * two are the same person they are linked, and either can exist alone.
 *
 * The identifiers are last-four only. The whole number is a separate request
 * with a permission of its own — see `employeeIdentifiers`.
 */
export interface Employee {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  altPhone?: string | null;
  email?: string | null;
  designation?: string | null;
  department?: string | null;
  joinedOn: string;
  leftOn?: string | null;
  status: EmploymentStatus;
  aadhaarLast4?: string | null;
  panLast4?: string | null;
  bankAccountName?: string | null;
  bankAccountLast4?: string | null;
  bankIfsc?: string | null;
  address?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  photoFileId?: string | null;
  userId?: string | null;
  user?: { id: string; name: string; code: string; isActive: boolean } | null;
  createdAt: string;
  updatedAt: string;
}

/** The whole numbers, decrypted. Asked for by name, and audited. */
export interface EmployeeIdentifiers {
  aadhaar?: string | null;
  pan?: string | null;
  bankAccountNumber?: string | null;
}

/** What a form sends when adding or correcting an employee. */
export interface EmployeeInput {
  name: string;
  phone?: string;
  altPhone?: string;
  email?: string;
  designation?: string;
  department?: string;
  joinedOn: string;
  status?: EmploymentStatus;
  leftOn?: string;
  aadhaar?: string;
  pan?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  address?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  userId?: string;
}

/**
 * What one person's day was.
 *
 * Called marking in and out, never punching: this app already means something
 * specific by *punch*, and a floor that hears one word for two things will
 * eventually do the wrong one.
 */
export type AttendanceMark =
  | 'PRESENT'
  | 'HALF_DAY'
  | 'ABSENT'
  | 'LEAVE'
  | 'HOLIDAY'
  | 'WEEKLY_OFF';

export const ATTENDANCE_MARKS: AttendanceMark[] = [
  'PRESENT',
  'HALF_DAY',
  'ABSENT',
  'LEAVE',
  'HOLIDAY',
  'WEEKLY_OFF',
];

export const ATTENDANCE_LABELS: Record<AttendanceMark, string> = {
  PRESENT: 'In',
  HALF_DAY: 'Half day',
  ABSENT: 'Absent',
  LEAVE: 'Leave',
  HOLIDAY: 'Holiday',
  WEEKLY_OFF: 'Weekly off',
};

/** One person on the register for a day. */
export interface AttendanceRow {
  employee: {
    id: string;
    code: string;
    name: string;
    designation?: string | null;
    department?: string | null;
    status: EmploymentStatus;
  };
  /** False when nobody has said anything about this person today. */
  marked: boolean;
  mark: AttendanceMark | null;
  inAt?: string | null;
  outAt?: string | null;
  overtimeMinutes: number;
  note?: string | null;
  markedBy?: { id: string; name: string } | null;
}

export interface AttendanceDay {
  date: string;
  rows: AttendanceRow[];
}

export interface AttendanceSummary {
  present: number;
  halfDays: number;
  absent: number;
  leave: number;
  holidays: number;
  /** Present plus half a day for each half day — what a daily wage multiplies. */
  payableDays: number;
  overtimeMinutes: number;
}

export interface AttendanceMonth {
  from: string;
  to: string;
  rows: (AttendanceSummary & { employee: AttendanceRow['employee'] })[];
}

/** What the register sends when it is marked. */
export interface MarkInput {
  employeeId: string;
  mark: AttendanceMark;
  inAt?: string;
  outAt?: string;
  overtimeMinutes?: number;
  note?: string;
}

// ---------------------------------------------------------------------------
// Pay
// ---------------------------------------------------------------------------

/**
 * How somebody is paid.
 *
 * Three kinds rather than one shape, because nobody knows how a given shop
 * pays. One person can be on more than one at once — a base salary plus a rate
 * per panel is a real arrangement — so a payslip is the sum of their lines.
 */
export type PayKind = 'MONTHLY' | 'DAILY' | 'PIECE';

export const PAY_KINDS: PayKind[] = ['MONTHLY', 'DAILY', 'PIECE'];

export const PAY_KIND_LABELS: Record<PayKind, string> = {
  MONTHLY: 'Monthly salary',
  DAILY: 'Daily wage',
  PIECE: 'Per piece',
};

export const PAY_KIND_HINTS: Record<PayKind, string> = {
  MONTHLY: 'A month’s pay, divided by the days this shop calls a month',
  DAILY: 'A day’s wage, multiplied by the days actually worked',
  PIECE: 'So much for each one made — say what a piece is',
};

export interface PayStructure {
  id: string;
  employeeId: string;
  employee?: { id: string; code: string; name: string; designation?: string | null };
  kind: PayKind;
  rate: string | number;
  pieceLabel?: string | null;
  overtimeHourlyRate?: string | number | null;
  effectiveFrom: string;
  /** Set when a later arrangement replaced this one. */
  effectiveTo?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface SalaryAdvance {
  id: string;
  employeeId: string;
  employee?: { id: string; code: string; name: string };
  amount: string | number;
  givenOn: string;
  mode: PaymentMode;
  note?: string | null;
  recoveredAmount: string | number;
  createdAt: string;
}

export type SalaryRunStatus = 'DRAFT' | 'APPROVED' | 'PAID';

export const SALARY_RUN_LABELS: Record<SalaryRunStatus, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  PAID: 'Paid',
};

/** One line of a payslip, snapshotted so it survives a later raise. */
export interface PayLine {
  kind: PayKind | 'OVERTIME';
  label: string;
  rate: number;
  quantity: number;
  amount: number;
}

export interface Payslip {
  id: string;
  runId: string;
  employeeId: string;
  employee: {
    id: string;
    code: string;
    name: string;
    designation?: string | null;
    department?: string | null;
  };
  payableDays: string | number;
  overtimeMinutes: number;
  pieces?: number | null;
  lines: PayLine[];
  gross: string | number;
  advanceDeducted: string | number;
  otherDeductions: string | number;
  deductionNote?: string | null;
  net: string | number;
  note?: string | null;
}

export interface SalaryRun {
  id: string;
  month: string;
  status: SalaryRunStatus;
  workingDays: number;
  note?: string | null;
  approvedAt?: string | null;
  paidAt?: string | null;
  paidMode?: PaymentMode | null;
  createdAt: string;
  _count?: { payslips: number };
}

export interface SalaryRunDetail extends SalaryRun {
  payslips: Payslip[];
  totals: { gross: number; advances: number; deductions: number; net: number; count: number };
}

/** What a kind of person here may do. The shop writes these. */
export interface WorkspaceRole {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  permissions: string[];
  /** Seeded with the workspace: editable, but not removable. */
  isSystem: boolean;
  _count?: { users: number };
}

/** What a letter says, before it is about anybody. The shop writes these. */
export interface LetterTemplate {
  id: string;
  kind: LetterKind;
  name: string;
  body: string;
  isActive: boolean;
}

/** A letter somebody was actually given, kept as it was given. */
export interface Letter {
  id: string;
  employeeId: string;
  employee?: { id: string; code: string; name: string; designation?: string | null };
  kind: LetterKind;
  title: string;
  body: string;
  issuedOn: string;
  createdAt: string;
}

/** A template, once it is about a particular person. */
export interface LetterDraft {
  kind: LetterKind;
  title: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Buying, stock and waste
// ---------------------------------------------------------------------------

/** Somebody the shop buys from. Not the same model as a client. */
export interface Vendor {
  id: string;
  code: string;
  name: string;
  phone?: string | null;
  altPhone?: string | null;
  email?: string | null;
  gstin?: string | null;
  company?: string | null;
  stateCode?: string | null;
  stateName?: string | null;
  address?: string | null;
  notes?: string | null;
  /** What the shop buys from them, in its own words. */
  supplies?: string | null;
  paymentTermDays?: number | null;
  isActive: boolean;
  _count?: { purchases: number };
  createdAt: string;
}

export type PurchaseStatus =
  | 'DRAFT'
  | 'ORDERED'
  | 'PART_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  DRAFT: 'Draft',
  ORDERED: 'Ordered',
  PART_RECEIVED: 'Part arrived',
  RECEIVED: 'Arrived',
  CANCELLED: 'Cancelled',
};

export interface PurchaseItem {
  id: string;
  materialId: string;
  material: { id: string; code: string; name: string; stockUnit: string };
  thicknessId?: string | null;
  thickness?: { id: string; valueMm: string | number; label?: string | null } | null;
  unit: string;
  quantity: string | number;
  rate: string | number;
  gstRatePct: string | number;
  taxAmount: string | number;
  lineTotal: string | number;
  /** How much of this line has actually turned up. */
  receivedQuantity: string | number;
  note?: string | null;
}

export interface Purchase {
  id: string;
  code: string;
  status: PurchaseStatus;
  vendorId: string;
  vendor: { id: string; code: string; name: string; gstin?: string | null };
  orderedOn?: string | null;
  expectedOn?: string | null;
  /** The vendor's own paperwork, once it arrives. */
  billNumber?: string | null;
  billedOn?: string | null;
  paidOn?: string | null;
  paidMode?: PaymentMode | null;
  subtotal: string | number;
  taxTotal: string | number;
  total: string | number;
  otherCharges: string | number;
  note?: string | null;
  items?: PurchaseItem[];
  _count?: { items: number };
  createdAt: string;
}

/** Every change to what is on the rack. Nothing sets a level directly. */
export type StockMoveKind =
  | 'RECEIPT'
  | 'CONSUMPTION'
  | 'OFFCUT'
  | 'WASTE'
  | 'ADJUSTMENT'
  | 'RETURN';

export const STOCK_MOVE_LABELS: Record<StockMoveKind, string> = {
  RECEIPT: 'Arrived',
  CONSUMPTION: 'Issued',
  OFFCUT: 'Offcut back',
  WASTE: 'Wasted',
  ADJUSTMENT: 'Counted',
  RETURN: 'Sent back',
};

/** What a person may record by hand. A delivery arrives against a purchase. */
export const RECORDABLE_MOVES: StockMoveKind[] = [
  'CONSUMPTION',
  'OFFCUT',
  'WASTE',
  'ADJUSTMENT',
  'RETURN',
];

export interface StockMove {
  id: string;
  materialId: string;
  material: { id: string; code: string; name: string; stockUnit: string };
  thickness?: { id: string; valueMm: string | number; label?: string | null } | null;
  kind: StockMoveKind;
  /** Signed: negative took material off the rack. */
  quantity: string | number;
  unit: string;
  rate?: string | number | null;
  order?: { id: string; code: string } | null;
  reason?: string | null;
  note?: string | null;
  at: string;
  recordedBy?: { id: string; name: string } | null;
}

export interface StockLevel {
  material: {
    id: string;
    code: string;
    name: string;
    color?: string | null;
    stockUnit: string;
    reorderLevel?: number | null;
  };
  quantity: number;
  value: number;
  averageRate: number;
  /** At or below the level the shop set. */
  low: boolean;
  byThickness: {
    thickness: { id: string; valueMm: number; label?: string | null };
    quantity: number;
  }[];
}

export interface StockLevels {
  rows: StockLevel[];
  totals: { value: number; low: number };
}

/** What became of the material that left the rack. */
export interface WasteRow {
  material: { id: string; code: string; name: string; stockUnit: string };
  consumed: number;
  offcut: number;
  wasted: number;
  /** Waste as a share of what was issued, not of what was bought. */
  wastePct: number;
}

export interface WasteReport {
  from: string;
  to: string;
  rows: WasteRow[];
  totals: Omit<WasteRow, 'material'>;
}

/** What a form sends when writing an order. */
export interface PurchaseInput {
  vendorId: string;
  expectedOn?: string;
  otherCharges?: number;
  note?: string;
  items: {
    materialId: string;
    thicknessId?: string;
    unit?: string;
    quantity: number;
    rate: number;
    gstRatePct?: number;
    taxAmount?: number;
    note?: string;
  }[];
}

export interface VendorInput {
  name: string;
  phone?: string;
  altPhone?: string;
  email?: string;
  gstin?: string;
  company?: string;
  stateCode?: string;
  stateName?: string;
  address?: string;
  notes?: string;
  supplies?: string;
  paymentTermDays?: number;
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// The paper: invoices, challans and credit notes
// ---------------------------------------------------------------------------
//
// None of it posts to the ledger. An invoice is a claim, not a movement of
// money; the payment against it is the movement, and that already posts.

/**
 * Where a document stands.
 *
 * A number, once used, is used: a document is cancelled rather than deleted
 * and its number is never reissued.
 */
export type DocumentStatus = 'ISSUED' | 'CANCELLED';

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  ISSUED: 'Issued',
  CANCELLED: 'Cancelled',
};

/** Why a credit note was raised. */
export type CreditReason = 'RETURN' | 'CORRECTION' | 'ALLOWANCE' | 'CANCELLED_WORK';

export const CREDIT_REASON_LABELS: Record<CreditReason, string> = {
  RETURN: 'Goods returned',
  CORRECTION: 'Correction to the invoice',
  ALLOWANCE: 'Allowance agreed',
  CANCELLED_WORK: 'Work not carried out',
};

/** One line of an invoice, as it was printed. */
export interface InvoiceItem {
  id: string;
  description: string;
  hsn?: string | null;
  quantity: string | number;
  unit: string;
  rate: string | number;
  amount: string | number;
  gstRatePct: string | number;
  taxAmount: string | number;
  sortOrder: number;
}

/**
 * A tax invoice, raised from an order.
 *
 * Everything on it is snapshotted at the moment of issue: the client's
 * particulars, the shop's, the rates and the tax pair. A reprint next year has
 * to be the document that went out, not a fresh render of what things have
 * become since.
 */
export interface Invoice {
  id: string;
  code: string;
  status: DocumentStatus;
  orderId: string;
  order?: { id: string; code: string };
  issuedOn: string;
  dueOn?: string | null;
  clientName: string;
  clientGstin?: string | null;
  clientAddress?: string | null;
  clientState?: string | null;
  firmName: string;
  firmGstin?: string | null;
  firmState?: string | null;
  /** True when the supply crossed a state line: IGST rather than CGST + SGST. */
  interState: boolean;
  subtotal: string | number;
  discount: string | number;
  taxable: string | number;
  cgst: string | number;
  sgst: string | number;
  igst: string | number;
  total: string | number;
  totalInWords: string;
  terms?: string | null;
  note?: string | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  items?: InvoiceItem[];
  creditNotes?: CreditNote[];
  createdAt: string;
}

/** One line of a challan: what it was and how many, and nothing about money. */
export interface ChallanItem {
  id: string;
  description: string;
  quantity: string | number;
  unit: string;
  sortOrder: number;
}

/**
 * A delivery challan: what went out of the door.
 *
 * No prices on it anywhere, on the screen or on the paper. It travels with the
 * goods and is read by whoever receives them.
 */
export interface Challan {
  id: string;
  code: string;
  status: DocumentStatus;
  orderId: string;
  order?: { id: string; code: string };
  issuedOn: string;
  shipTo?: string | null;
  transport?: string | null;
  vehicle?: string | null;
  note?: string | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  items?: ChallanItem[];
  createdAt: string;
}

/**
 * A credit note against an invoice.
 *
 * It reduces what a client owes and is never a payment. What it credits is
 * shown beside what was collected, never folded into it.
 */
export interface CreditNote {
  id: string;
  code: string;
  status: DocumentStatus;
  invoiceId: string;
  invoice?: { id: string; code: string; clientName: string; orderId?: string };
  issuedOn: string;
  reason: CreditReason;
  note: string;
  taxable: string | number;
  cgst: string | number;
  sgst: string | number;
  igst: string | number;
  total: string | number;
  totalInWords: string;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
}

/**
 * What one order was charged, credited and paid.
 *
 * Three figures rather than one, and they stay three on every screen that
 * shows them. Credited money is never counted as received: an order billed
 * ₹50,000, credited ₹5,000 and paid ₹45,000 is settled, and this says exactly
 * that rather than showing ₹50,000 collected.
 */
export interface Receivable {
  invoice: { id: string; code: string };
  charged: number;
  credited: number;
  received: number;
  due: number;
  settled: boolean;
}

/**
 * A report somebody asked for, and what became of it.
 *
 * Asked for on one request and built on another, so a screen showing these is
 * showing work in progress: QUEUED and GENERATING become READY or FAILED
 * without anybody doing anything, and the screen has to expect that.
 */
export interface Report {
  id: string;
  kind: string;
  format: 'XLSX' | 'PDF';
  status: 'QUEUED' | 'GENERATING' | 'READY' | 'FAILED' | 'EXPIRED';
  fromDate?: string | null;
  toDate?: string | null;
  params?: Record<string, unknown> | null;
  rowCount?: number | null;
  /** Why it failed, in the words the person who asked will read. */
  error?: string | null;
  /** After this the file goes; the row stays. */
  expiresAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  fileId?: string | null;
  requestedBy?: { id: string; name: string } | null;
}
