import type { LengthUnit } from './units';
import type { HistoryEntry } from './history';
import type {
  AttachmentKind,
  AuthUser,
  Client,
  CreateLeadInput,
  CustomFieldDefinition,
  Lead,
  LeadBoard,
  LeadSource,
  ClientLocation,
  LoginResponse,
  Material,
  Order,
  OrderAttachment,
  OrderBoard,
  Paginated,
  Priority,
  PunchItemInput,
  PunchOrderInput,
  SizePreset,
  Workflow,
  WorkflowStatus,
  WorkflowTransition,
  CashDeposit,
  Estimate,
  EstimateInput,
  EstimateStatus,
  FirmProfile,
  Disbursement,
  DisbursementCategory,
  DisbursementLedger,
  DisbursementStatus,
  DisbursementSummary,
  CashInHandRow,
  CashPosition,
  Transaction,
  TransactionKind,
  GstSlab,
  Payment,
  PaymentMode,
  PaymentSummary,
  PricingMode,
  TaxTreatment,
  Tenant,
  TenantIsolation,
  TenantStatus,
} from './types';

/** The editable fields of a client. Shared by create and update. */
export interface ClientDetails {
  name?: string;
  phone?: string;
  altPhone?: string;
  email?: string;
  gstin?: string;
  company?: string;
  stateCode?: string;
  stateName?: string;
  address?: string;
  billingAddress?: string;
  shippingAddress?: string;
  notes?: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  onUnauthorized?: () => void;
}

type Query = Record<string, string | number | boolean | undefined | null>;

/** One fetch-based client for the web app and the React Native app. */
export class ApiClient {
  private token: string | null = null;

  constructor(private readonly options: ApiClientOptions) {}

  setToken(token: string | null): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  get baseUrl(): string {
    return this.options.baseUrl.replace(/\/$/, '');
  }

  /** Absolute URL for an attachment, for <img src>. */
  fileUrl(fileId: string): string {
    return `${this.baseUrl}/files/${fileId}`;
  }

  /**
   * A response that is not JSON — a rendered document, above all.
   *
   * Kept beside the JSON path rather than bolted onto it so `handle` can stay
   * strict about parsing; a document that came back as an error page would
   * otherwise be handed on as if it were the document.
   */
  async fetchText(path: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
    });
    if (response.status === 401) this.options.onUnauthorized?.();
    const text = await response.text();
    if (!response.ok) {
      throw new ApiError(
        response.status,
        extractMessage(safeParse(text)) ?? `Request failed (${response.status})`,
        text,
      );
    }
    return text;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Query,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    return this.handle<T>(response);
  }

  /** Multipart upload; the browser sets the boundary, so no Content-Type here. */
  private async upload<T>(path: string, form: FormData): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      body: form,
    });
    return this.handle<T>(response);
  }

  private async handle<T>(response: Response): Promise<T> {
    if (response.status === 401) this.options.onUnauthorized?.();

    const text = await response.text();
    const payload = text ? safeParse(text) : null;

    if (!response.ok) {
      throw new ApiError(
        response.status,
        extractMessage(payload) ?? `Request failed (${response.status})`,
        payload,
      );
    }
    return payload as T;
  }

  private get<T>(path: string, query?: Query) {
    return this.request<T>('GET', path, undefined, query);
  }
  private post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }
  private patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body);
  }
  private del<T>(path: string) {
    return this.request<T>('DELETE', path);
  }

  // -- auth -----------------------------------------------------------------

  /**
   * Sign in to one workspace.
   *
   * The workspace comes first because every tenant keeps its own separate set
   * of people — an employee code means nothing until you know which business
   * it belongs to.
   */
  async login(
    workspace: string,
    identifier: string,
    password: string,
  ): Promise<LoginResponse> {
    const result = await this.post<LoginResponse>('/auth/login', {
      workspace,
      identifier,
      password,
    });
    this.token = result.accessToken;
    return result;
  }

  /** Sign in to the platform itself, above every workspace. */
  async platformLogin(email: string, password: string): Promise<LoginResponse> {
    const result = await this.post<LoginResponse>('/auth/platform/login', {
      email,
      password,
    });
    this.token = result.accessToken;
    return result;
  }

  /** Check a workspace exists before asking for a password. */
  workspaceExists(workspace: string) {
    return this.post<{ slug: string; exists: boolean }>('/auth/workspace', { workspace });
  }

  me() {
    return this.get<AuthUser>('/auth/me');
  }

  // -- clients --------------------------------------------------------------

  clients(query?: { search?: string; page?: number; limit?: number }) {
    return this.get<Paginated<Client>>('/clients', query);
  }

  /** Type-ahead for the punch screen. */
  searchClients(term: string) {
    return this.get<Client[]>('/clients/search', { q: term });
  }

  client(id: string) {
    return this.get<Client>(`/clients/${id}`);
  }

  createClient(body: ClientDetails & { name: string }) {
    return this.post<Client>('/clients', body);
  }

  /** Everything on a client's firm record. All of it optional but the name. */
  updateClient(id: string, body: ClientDetails) {
    return this.patch<Client>(`/clients/${id}`, body);
  }

  addClientLocation(clientId: string, body: { name: string; address?: string }) {
    return this.post<ClientLocation>(`/clients/${clientId}/locations`, body);
  }

  // -- configuration --------------------------------------------------------

  materials(includeInactive = false) {
    return this.get<Material[]>('/config/materials', { includeInactive });
  }

  sizePresets(includeInactive = false) {
    return this.get<SizePreset[]>('/config/size-presets', { includeInactive });
  }

  createMaterial(body: unknown) {
    return this.post<Material>('/config/materials', body);
  }

  updateMaterial(id: string, body: unknown) {
    return this.patch<Material>(`/config/materials/${id}`, body);
  }

  addThickness(materialId: string, body: { value: { value: number; unit: LengthUnit }; label?: string }) {
    return this.post<unknown>(`/config/materials/${materialId}/thicknesses`, body);
  }

  removeThickness(id: string) {
    return this.del<unknown>(`/config/thicknesses/${id}`);
  }

  createSizePreset(body: unknown) {
    return this.post<SizePreset>('/config/size-presets', body);
  }

  updateSizePreset(id: string, body: unknown) {
    return this.patch<SizePreset>(`/config/size-presets/${id}`, body);
  }

  settings() {
    return this.get<Record<string, unknown>>('/config/settings');
  }

  setSetting(key: string, value: unknown) {
    return this.patch<unknown>(`/config/settings/${key}`, { value });
  }

  // -- workflows ------------------------------------------------------------

  workflows() {
    return this.get<Workflow[]>('/workflows');
  }

  /** The flow orders run on. Pass `LEAD` for the enquiry pipeline instead. */
  defaultWorkflow(kind?: 'ORDER' | 'LEAD') {
    return this.get<Workflow>('/workflows/default', kind ? { kind } : undefined);
  }

  workflow(id: string) {
    return this.get<Workflow>(`/workflows/${id}`);
  }

  createWorkflow(body: { code: string; name: string; description?: string }) {
    return this.post<Workflow>('/workflows', body);
  }

  addStatus(workflowId: string, body: Partial<WorkflowStatus> & { code: string; name: string }) {
    return this.post<WorkflowStatus>(`/workflows/${workflowId}/statuses`, body);
  }

  updateStatus(statusId: string, body: Partial<WorkflowStatus>) {
    return this.patch<WorkflowStatus>(`/workflows/statuses/${statusId}`, body);
  }

  removeStatus(statusId: string) {
    return this.del<unknown>(`/workflows/statuses/${statusId}`);
  }

  /** Save the whole canvas: node positions plus every arrow. */
  saveWorkflowGraph(
    workflowId: string,
    body: {
      positions: { id: string; canvasX: number; canvasY: number }[];
      transitions: Omit<WorkflowTransition, 'id' | 'workflowId'>[];
    },
  ) {
    return this.post<Workflow>(`/workflows/${workflowId}/graph`, body);
  }

  /**
   * Which stages the home screen counts, in the order they appear there.
   *
   * Sent as the whole list because the order is the point — the position of
   * each stage on the card is its place in this array.
   */
  /**
   * Change the flow itself — its name, or how long an enquiry may sit untouched
   * before it goes quiet and moves to the archive.
   */
  updateWorkflow(
    workflowId: string,
    body: {
      name?: string;
      description?: string;
      leadExpiryDays?: number | null;
      quoteStatusId?: string | null;
    },
  ) {
    return this.patch<Workflow>(`/workflows/${workflowId}`, body);
  }

  setHomeCardStatuses(workflowId: string, statusIds: string[]) {
    return this.patch<Workflow>(`/workflows/${workflowId}/home-card`, { statusIds });
  }

  /**
   * Re-state an order's money terms — the GST treatment above all.
   *
   * Re-prices every line from the rate it was quoted at, so switching a vendor
   * to "GST absorbed" after the fact gives the same numbers as punching it that
   * way would have. Can change whether the order counts as settled.
   */
  repriceOrder(
    orderId: string,
    body: {
      pricingMode?: PricingMode;
      taxTreatment?: TaxTreatment;
      gstSlabId?: string;
      discount?: number;
      total?: number;
    },
  ) {
    return this.patch<Order>(`/orders/${orderId}/terms`, body);
  }

  allowedNext(statusId: string) {
    return this.get<(WorkflowTransition & { toStatus: WorkflowStatus })[]>(
      `/workflows/statuses/${statusId}/next`,
    );
  }

  /**
   * Where this status came from — the moves back.
   *
   * A separate call rather than a flag on `allowedNext`, so a screen that has
   * not been taught about going back cannot show one among the ordinary moves.
   */
  allowedBack(statusId: string) {
    return this.get<{ transitionId: string; toStatus: WorkflowStatus }[]>(
      `/workflows/statuses/${statusId}/back`,
    );
  }

  // -- orders ---------------------------------------------------------------

  orders(query?: {
    clientId?: string;
    statusId?: string;
    materialId?: string;
    search?: string;
    from?: string;
    to?: string;
    unit?: LengthUnit;
    page?: number;
    limit?: number;
  }) {
    return this.get<Paginated<Order> & { unit: LengthUnit }>('/orders', query);
  }

  orderBoard(workflowId?: string) {
    return this.get<OrderBoard>('/orders/board', { workflowId });
  }

  order(id: string, unit?: LengthUnit) {
    return this.get<Order>(`/orders/${id}`, { unit });
  }

  /**
   * Everything that happened to one thing, newest first.
   *
   * One method for every kind rather than one per screen: the shape that comes
   * back is the same, and both clients render it the same way.
   */
  history(
    kind: 'orders' | 'leads' | 'quotes' | 'clients' | 'payments',
    id: string,
  ) {
    return this.get<HistoryEntry[]>(`/history/${kind}/${id}`);
  }

  punchOrder(body: PunchOrderInput) {
    return this.post<Order>('/orders', body);
  }

  updateOrder(id: string, body: { location?: string; priority?: string; dueDate?: string; notes?: string }) {
    return this.patch<Order>(`/orders/${id}`, body);
  }

  changeOrderStatus(
    id: string,
    body: { toStatusId: string; note?: string; reverse?: boolean },
  ) {
    return this.post<Order>(`/orders/${id}/status`, body);
  }

  /**
   * Files must already be optimised by the caller — see `optimizeImage` in the
   * web app. The server re-optimises regardless, but sending a 12 MP original
   * over a shop wifi is the thing worth avoiding.
   */
  addAttachments(
    orderId: string,
    files: File[],
    meta: { kind: AttachmentKind; description?: string },
  ) {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    form.append('kind', meta.kind);
    if (meta.description) form.append('description', meta.description);
    return this.upload<OrderAttachment[]>(`/orders/${orderId}/attachments`, form);
  }

  /**
   * React Native variant of `addAttachments`.
   *
   * RN's fetch accepts `{uri, type, name}` as a multipart part and streams the
   * file from disk; the DOM `File` the web client passes does not exist there.
   * Same endpoint, same contract — only the part shape differs.
   */
  addAttachmentsNative(
    orderId: string,
    files: { uri: string; type: string; name: string }[],
    meta: { kind: AttachmentKind; description?: string },
  ) {
    const form = new FormData();
    for (const file of files) form.append('files', file as unknown as Blob);
    form.append('kind', meta.kind);
    if (meta.description) form.append('description', meta.description);
    return this.upload<OrderAttachment[]>(`/orders/${orderId}/attachments`, form);
  }

  removeAttachment(attachmentId: string) {
    return this.del<unknown>(`/orders/attachments/${attachmentId}`);
  }

  // -- money ----------------------------------------------------------------

  gstSlabs(includeInactive = false) {
    return this.get<GstSlab[]>('/config/gst-slabs', { includeInactive });
  }

  createGstSlab(body: { name: string; ratePct: number; isDefault?: boolean }) {
    return this.post<GstSlab>('/config/gst-slabs', body);
  }

  updateGstSlab(id: string, body: Partial<GstSlab> & { ratePct?: number }) {
    return this.patch<GstSlab>(`/config/gst-slabs/${id}`, body);
  }

  paymentSummary(orderId: string) {
    return this.get<PaymentSummary>(`/orders/${orderId}/payments`);
  }

  recordPayment(
    orderId: string,
    body: {
      amount: number;
      mode: PaymentMode;
      reference?: string;
      note?: string;
      receivedAt?: string;
      /** Cash banked at the same time as it was received. */
      depositedAmount?: number;
      bankReference?: string;
    },
  ) {
    return this.post<Payment>(`/orders/${orderId}/payments`, body);
  }

  /**
   * Take a receipt back.
   *
   * Not a delete: the correction is a new row recording the opposite, so both
   * stand and the reason travels with it.
   */
  reversePayment(paymentId: string, reason: string) {
    return this.post<Payment>(`/payments/${paymentId}/reverse`, { reason });
  }

  recordDeposit(body: {
    amount: number;
    paymentId?: string;
    depositedAt?: string;
    bankReference?: string;
    note?: string;
  }) {
    return this.post<CashDeposit>('/payments/deposits', body);
  }

  /**
   * Every movement of money except a payout, filterable and paged.
   *
   * Payouts have their own ledger — `disbursements` — on purpose.
   */
  transactions(query?: {
    kind?: TransactionKind;
    from?: string;
    to?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    return this.get<Paginated<Transaction>>('/payments/transactions', query);
  }

  cashPosition(query?: { from?: string; to?: string }) {
    return this.get<CashPosition>('/payments/cash-position', query);
  }

  cashInHand() {
    return this.get<CashInHandRow[]>('/payments/cash-in-hand');
  }

  // -- disbursements --------------------------------------------------------
  //
  // Money paid out of an order after the client's money has arrived. Kept
  // beside the order, never netted off it: the order is still worth what it
  // was quoted at, and its payment status still reflects what was collected.

  /** What this tenant calls these charges. "ISC" unless they renamed it. */
  disbursementLabel() {
    return this.get<{ label: string }>('/disbursements/label');
  }

  setDisbursementLabel(label: string) {
    return this.patch<{ label: string }>('/disbursements/label', { label });
  }

  disbursementCategories(includeInactive = false) {
    return this.get<DisbursementCategory[]>(
      '/disbursements/categories',
      includeInactive ? { includeInactive: 'true' } : undefined,
    );
  }

  createDisbursementCategory(body: { code: string; name: string; sortOrder?: number }) {
    return this.post<DisbursementCategory>('/disbursements/categories', body);
  }

  deactivateDisbursementCategory(id: string) {
    return this.del<DisbursementCategory>(`/disbursements/categories/${id}`);
  }

  disbursementLedger(query?: {
    status?: DisbursementStatus;
    categoryId?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    return this.get<DisbursementLedger>('/disbursements', query);
  }

  orderDisbursements(orderId: string) {
    return this.get<DisbursementSummary>(`/disbursements/order/${orderId}`);
  }

  createDisbursement(
    orderId: string,
    body: {
      payeeName: string;
      amount: number;
      categoryId?: string;
      payeeContact?: string;
      note?: string;
      /** Pass PAID with a mode to log one that has already gone out. */
      status?: DisbursementStatus;
      paidMode?: PaymentMode;
      paidAt?: string;
      reference?: string;
    },
  ) {
    return this.post<Disbursement>(`/disbursements/order/${orderId}`, body);
  }

  settleDisbursement(
    id: string,
    body: { paidMode: PaymentMode; paidAt?: string; reference?: string; note?: string },
  ) {
    return this.post<Disbursement>(`/disbursements/${id}/settle`, body);
  }

  updateDisbursement(id: string, body: Partial<{ payeeName: string; payeeContact: string; amount: number; categoryId: string; note: string }>) {
    return this.patch<Disbursement>(`/disbursements/${id}`, body);
  }

  /** Cancels rather than deletes — the accountant may still need to see it. */
  cancelDisbursement(id: string) {
    return this.del<Disbursement>(`/disbursements/${id}`);
  }

  // -- the firm, and the documents it prints ---------------------------------

  /** The shop's own details, as they appear on anything it prints. */
  firmProfile() {
    return this.get<FirmProfile>('/firm');
  }

  /**
   * Just the colours. Readable by every signed-in user, unlike the full firm
   * profile, so a production hand who cannot see bank details still gets their
   * shop's branding.
   */
  firmTheme() {
    return this.get<{ accent: string }>('/firm/theme');
  }

  saveFirmProfile(body: Partial<FirmProfile>) {
    return this.patch<FirmProfile>('/firm', pickFirmFields(body));
  }

  /** The caller builds the FormData, because a file means something different
   *  in a browser and on a phone. */
  uploadLetterhead(form: FormData, kind: 'letterhead' | 'logo' = 'letterhead') {
    return this.upload<FirmProfile>(`/firm/letterhead?kind=${kind}`, form);
  }

  clearLetterhead(kind: 'letterhead' | 'logo' = 'letterhead') {
    return this.del<FirmProfile>(`/firm/letterhead?kind=${kind}`);
  }

  estimates(query?: {
    status?: EstimateStatus;
    clientId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    return this.get<Paginated<Estimate>>('/estimates', query);
  }

  estimate(id: string) {
    return this.get<Estimate>(`/estimates/${id}`);
  }

  createEstimate(body: EstimateInput) {
    return this.post<Estimate>('/estimates', body);
  }

  updateEstimate(id: string, body: EstimateInput & { status?: EstimateStatus }) {
    return this.patch<Estimate>(`/estimates/${id}`, body);
  }

  setEstimateStatus(id: string, status: EstimateStatus) {
    return this.post<Estimate>(`/estimates/${id}/status`, { status });
  }

  /**
   * Turn an accepted quotation into an order. The estimate is kept as the
   * record of what was agreed, and the money carries across unchanged.
   */
  convertEstimate(
    id: string,
    body: { location: string; workflowId?: string; startStatusId?: string; notes?: string },
  ) {
    return this.post<Order>(`/estimates/${id}/convert`, body);
  }

  deleteEstimate(id: string) {
    return this.del<unknown>(`/estimates/${id}`);
  }

  /**
   * The printable document as HTML, letterhead inlined.
   *
   * HTML rather than a PDF so the app can convert it on the device and hand it
   * straight to WhatsApp, while the web prints the very same markup — one
   * layout, one set of totals.
   */
  estimateDocumentUrl(id: string): string {
    return `${this.baseUrl}/estimates/${id}/document`;
  }

  // -- platform -------------------------------------------------------------

  tenants() {
    return this.get<Tenant[]>('/platform/tenants');
  }

  tenant(id: string) {
    return this.get<Tenant>(`/platform/tenants/${id}`);
  }

  createTenant(body: {
    slug: string;
    name: string;
    isolation?: TenantIsolation;
    databaseUrl?: string;
    plan?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    ownerName: string;
    ownerCode: string;
    ownerPassword: string;
    ownerEmail?: string;
  }) {
    return this.post<Tenant & { signIn: { workspace: string; code: string } }>(
      '/platform/tenants',
      body,
    );
  }

  updateTenant(id: string, body: { name?: string; status?: TenantStatus; plan?: string }) {
    return this.patch<Tenant>(`/platform/tenants/${id}`, body);
  }

  // -- leads ----------------------------------------------------------------

  leads(query?: {
    statusId?: string;
    ownerId?: string;
    sourceId?: string;
    search?: string;
    converted?: boolean;
    /** The enquiries that have gone quiet, rather than the ones that have not. */
    archived?: boolean;
    page?: number;
    limit?: number;
  }) {
    return this.get<Paginated<Lead>>('/leads', query);
  }

  leadBoard(workflowId?: string) {
    return this.get<LeadBoard>('/leads/board', { workflowId });
  }

  lead(id: string) {
    return this.get<Lead>(`/leads/${id}`);
  }

  createLead(body: CreateLeadInput) {
    return this.post<Lead>('/leads', body);
  }

  updateLead(id: string, body: Partial<CreateLeadInput>) {
    return this.patch<Lead>(`/leads/${id}`, body);
  }

  changeLeadStatus(
    id: string,
    body: { toStatusId: string; note?: string; reverse?: boolean },
  ) {
    return this.post<Lead>(`/leads/${id}/status`, body);
  }

  /** Turn an enquiry into work. Sizes are supplied here, not on the lead. */
  convertLead(
    id: string,
    body: {
      location: string;
      priority?: Priority;
      dueDate?: string;
      notes?: string;
      items: PunchItemInput[];
      convertedStatusId?: string;
    },
  ) {
    return this.post<{ lead: Lead; order: Order }>(`/leads/${id}/convert`, body);
  }

  leadSources(includeInactive = false) {
    return this.get<LeadSource[]>('/leads/sources', { includeInactive });
  }

  createLeadSource(body: { code: string; name: string; color?: string }) {
    return this.post<LeadSource>('/leads/sources', body);
  }

  /** Definitions the lead form builds itself from. */
  leadFields(includeInactive = false) {
    return this.get<CustomFieldDefinition[]>('/leads/fields', { includeInactive });
  }

  createLeadField(body: Partial<CustomFieldDefinition> & { key: string; label: string }) {
    return this.post<CustomFieldDefinition>('/leads/fields', { entity: 'LEAD', ...body });
  }

  updateLeadField(id: string, body: Partial<CustomFieldDefinition>) {
    return this.patch<CustomFieldDefinition>(`/leads/fields/${id}`, body);
  }

  deactivateLeadField(id: string) {
    return this.del<unknown>(`/leads/fields/${id}`);
  }
}

/**
 * The fields the firm profile actually accepts.
 *
 * Both apps load the whole profile row into their form state and hand it
 * straight back on save, so the server-managed columns — id, tenantId, the two
 * file ids, updatedAt — travelled with it and the API rejected the lot with
 * "property id should not exist". Narrowing here rather than in each screen
 * means a new caller cannot reintroduce it, and a new editable field is one
 * entry in this list.
 */
const FIRM_FIELDS = [
  'name',
  'gstin',
  'stateCode',
  'stateName',
  'phone',
  'email',
  'address',
  'website',
  'bankName',
  'bankAccountName',
  'bankAccountNumber',
  'bankIfsc',
  'bankBranch',
  'termsAndConditions',
  'signatoryName',
  'accentColor',
  'themeAccent',
] as const satisfies readonly (keyof FirmProfile)[];

export function pickFirmFields(body: Partial<FirmProfile>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of FIRM_FIELDS) {
    const value = body[field];
    // `null` is how the API says "no value"; sending it back fails @IsString.
    if (value !== undefined && value !== null) out[field] = value;
  }
  return out;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractMessage(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return undefined;
}
