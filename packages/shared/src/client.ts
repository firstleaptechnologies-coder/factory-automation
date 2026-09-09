import type { LengthUnit } from './units';
import type { HistoryEntry } from './history';
import type { LetterKind } from './letters';
import type { AppNotification, NotificationSetting } from './notifications';
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
  Release,
  ReleaseStatus,
  VersionGate,
  AttendanceDay,
  AttendanceMonth,
  Employee,
  EmployeeIdentifiers,
  EmployeeInput,
  EmploymentStatus,
  Letter,
  LetterDraft,
  LetterTemplate,
  Purchase,
  PurchaseInput,
  PurchaseStatus,
  StockLevels,
  StockMove,
  StockMoveKind,
  Vendor,
  Invoice,
  Report,
  Challan,
  CreditNote,
  CreditReason,
  Receivable,
  VendorInput,
  WasteReport,
  WorkspaceRole,
  WorkspaceUser,
  MarkInput,
  PayKind,
  PayStructure,
  Payslip,
  SalaryAdvance,
  SalaryRun,
  SalaryRunDetail,
  Expense,
  ExpenseAnalytics,
  ExpenseEdit,
  ExpenseFormOptions,
  ExpenseInput,
  ExpenseOption,
  ExpenseOptionField,
  ExpensePage,
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
      lostStatusId?: string | null;
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
   * Send what this client saw.
   *
   * Batched by the caller and sent behind the ordinary token. Never include a
   * token, a password or a client's private business in `context` — the server
   * cannot tell one string from another, so this is the side that must not.
   */
  sendLogs(batch: {
    client: 'app' | 'web';
    platform?: string;
    appVersion?: string;
    entries: {
      level: 'info' | 'warn' | 'error';
      message: string;
      at: string;
      context?: Record<string, unknown>;
    }[];
  }) {
    return this.post<{ recorded: number }>('/logs', batch);
  }

  /**
   * Everything that happened to one thing, newest first.
   *
   * One method for every kind rather than one per screen: the shape that comes
   * back is the same, and both clients render it the same way.
   */
  history(
    kind: 'orders' | 'leads' | 'quotes' | 'clients' | 'payments' | 'expenses',
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

  /**
   * Takes a settled payout back.
   *
   * The mirror of taking a receipt back: the money has gone, so the correction
   * is the opposite row rather than the removal of the first one.
   */
  reverseDisbursement(id: string, reason: string) {
    return this.post<Disbursement>(`/disbursements/${id}/reverse`, { reason });
  }

  /** Cancels one that was only ever planned. A paid one is taken back. */
  cancelDisbursement(id: string) {
    return this.del<Disbursement>(`/disbursements/${id}`);
  }

  // -- expenses --------------------------------------------------------------

  /**
   * What the shop spends on itself.
   *
   * Separate from payouts, which belong to an order. An expense belongs to the
   * business, posts to the same ledger as everything else, and appears on the
   * Transactions screen beside the money coming in.
   */
  expenses(query?: {
    from?: string;
    to?: string;
    spentType?: string;
    doneBy?: string;
    paymentType?: string;
    vendor?: string;
    orderId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    return this.get<ExpensePage>('/expenses', query);
  }

  expense(id: string) {
    return this.get<Expense>(`/expenses/${id}`);
  }

  createExpense(body: ExpenseInput) {
    return this.post<Expense>('/expenses', body);
  }

  /** The whole expense: a partial body is refused rather than clearing fields. */
  updateExpense(id: string, body: ExpenseInput) {
    return this.patch<Expense>(`/expenses/${id}`, body);
  }

  /**
   * Takes an expense back. There is no delete.
   *
   * The opposite row is recorded and both stand, exactly as taking a receipt
   * back does: money that moved is never quietly unmoved.
   */
  reverseExpense(id: string, reason: string) {
    return this.post<Expense>(`/expenses/${id}/reverse`, { reason });
  }

  /** What changed on one expense, and why — newest first. */
  expenseEdits(id: string) {
    return this.get<ExpenseEdit[]>(`/expenses/${id}/edits`);
  }

  /**
   * The bill, photographed at the counter.
   *
   * Files must already be optimised by the caller — see `optimizeImage` in the
   * web app. The server re-optimises regardless; sending a 12 MP original over
   * a shop wifi is the thing worth avoiding.
   */
  attachExpenseBill(id: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.upload<Expense>(`/expenses/${id}/bill`, form);
  }

  /** React Native variant: RN streams `{uri, type, name}` from disk. */
  attachExpenseBillNative(id: string, file: { uri: string; type: string; name: string }) {
    const form = new FormData();
    form.append('file', file as unknown as Blob);
    return this.upload<Expense>(`/expenses/${id}/bill`, form);
  }

  /** Unpins the bill. The file itself is left alone. */
  removeExpenseBill(id: string) {
    return this.del<Expense>(`/expenses/${id}/bill`);
  }

  expenseAnalytics(query?: { from?: string; to?: string }) {
    return this.get<ExpenseAnalytics>('/expenses/analytics', query);
  }

  /** The active labels for each list on the form. */
  expenseOptions() {
    return this.get<ExpenseFormOptions>('/expenses/options');
  }

  /** Every option including the retired ones — the config screen. */
  allExpenseOptions(field?: ExpenseOptionField) {
    return this.get<ExpenseOption[]>('/expenses/options/all', field ? { field } : undefined);
  }

  createExpenseOption(body: {
    field: ExpenseOptionField;
    label: string;
    account?: 'CASH' | 'BANK';
  }) {
    return this.post<ExpenseOption>('/expenses/options', body);
  }

  updateExpenseOption(
    id: string,
    body: Partial<{ label: string; account: 'CASH' | 'BANK'; isActive: boolean; sortOrder: number }>,
  ) {
    return this.patch<ExpenseOption>(`/expenses/options/${id}`, body);
  }

  /** Retires it. Expenses hold the label, so old rows are unaffected. */
  deleteExpenseOption(id: string) {
    return this.del<ExpenseOption>(`/expenses/options/${id}`);
  }

  reorderExpenseOptions(field: ExpenseOptionField, orderedIds: string[]) {
    return this.patch<ExpenseOption[]>('/expenses/options/order', { field, orderedIds });
  }

  // -- people ----------------------------------------------------------------

  /** The logins this workspace has issued. */
  users() {
    return this.get<WorkspaceUser[]>('/users');
  }

  /** What each kind of person here may do. The shop writes these. */
  roles() {
    return this.get<WorkspaceRole[]>('/roles');
  }

  createRole(body: { name: string; description?: string; permissions: string[] }) {
    return this.post<WorkspaceRole>('/roles', body);
  }

  updateRole(id: string, body: { name: string; description?: string; permissions: string[] }) {
    return this.patch<WorkspaceRole>(`/roles/${id}`, body);
  }

  /** Only a role the shop wrote itself, and only one nobody is on. */
  deleteRole(id: string) {
    return this.del<{ id: string }>(`/roles/${id}`);
  }

  /** Puts somebody on a role. Null takes their role away. */
  assignRole(userId: string, roleId: string | null) {
    return this.patch<WorkspaceUser>(`/roles/users/${userId}`, { roleId });
  }

  /**
   * The employees the shop has, as distinct from the logins it issues.
   *
   * Identifiers come back as last four only; the whole number is a separate
   * request with a permission of its own, so reading one is a deliberate act.
   */
  employees(query?: {
    status?: EmploymentStatus;
    department?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    return this.get<Paginated<Employee>>('/employees', query);
  }

  employee(id: string) {
    return this.get<Employee>(`/employees/${id}`);
  }

  /** The whole Aadhaar, PAN and account number. Audited. */
  employeeIdentifiers(id: string) {
    return this.get<EmployeeIdentifiers>(`/employees/${id}/identifiers`);
  }

  createEmployee(body: EmployeeInput) {
    return this.post<Employee>('/employees', body);
  }

  updateEmployee(id: string, body: EmployeeInput) {
    return this.patch<Employee>(`/employees/${id}`, body);
  }

  /** Somebody has left. The row stays; their login is switched off. */
  markEmployeeLeft(id: string, leftOn: string) {
    return this.post<Employee>(`/employees/${id}/left`, { leftOn });
  }

  // -- the register ----------------------------------------------------------

  /**
   * Everyone who could be marked on one day, with whatever they were marked.
   *
   * The people lead, not the rows: a register showing only what was entered
   * would make a morning nobody marked look like a morning nobody came in.
   */
  attendanceDay(date: string) {
    return this.get<AttendanceDay>('/attendance/day', { date });
  }

  /**
   * Marks the register for one day.
   *
   * A day at a time rather than a row at a time, because that is how a shop
   * marks it. Marking the same day again corrects it.
   */
  markAttendance(date: string, marks: MarkInput[]) {
    return this.post<AttendanceDay>('/attendance/day', { date, marks });
  }

  /** What each person's month came to — what a salary run reads. */
  attendanceSummary(query: { from: string; to: string; employeeId?: string }) {
    return this.get<AttendanceMonth>('/attendance/summary', query);
  }

  // -- pay -------------------------------------------------------------------

  payStructures(employeeId?: string) {
    return this.get<PayStructure[]>('/payroll/structures', employeeId ? { employeeId } : undefined);
  }

  /**
   * Puts somebody on a new arrangement.
   *
   * A raise is a new row rather than an edit: last month's payslip has to stay
   * explicable after this month's rise.
   */
  setPayStructure(body: {
    employeeId: string;
    kind: PayKind;
    rate: number;
    pieceLabel?: string;
    overtimeHourlyRate?: number;
    effectiveFrom: string;
    note?: string;
  }) {
    return this.post<PayStructure>('/payroll/structures', body);
  }

  salaryAdvances(employeeId?: string) {
    return this.get<SalaryAdvance[]>('/payroll/advances', employeeId ? { employeeId } : undefined);
  }

  /** Money handed over before it is earned. It leaves the drawer today. */
  giveSalaryAdvance(body: {
    employeeId: string;
    amount: number;
    givenOn: string;
    mode: PaymentMode;
    note?: string;
  }) {
    return this.post<SalaryAdvance>('/payroll/advances', body);
  }

  salaryRuns() {
    return this.get<SalaryRun[]>('/payroll/runs');
  }

  salaryRun(id: string) {
    return this.get<SalaryRunDetail>(`/payroll/runs/${id}`);
  }

  /** Opens a month and works out what everybody is owed. Draft on purpose. */
  openSalaryRun(body: { month: string; workingDays: number; note?: string }) {
    return this.post<SalaryRunDetail>('/payroll/runs', body);
  }

  adjustPayslip(
    runId: string,
    payslipId: string,
    body: { pieces?: number; otherDeductions?: number; deductionNote?: string; note?: string },
  ) {
    return this.patch<Payslip>(`/payroll/runs/${runId}/payslips/${payslipId}`, body);
  }

  approveSalaryRun(id: string) {
    return this.post<SalaryRunDetail>(`/payroll/runs/${id}/approve`);
  }

  /** Pays it, and posts a ledger entry per person. */
  paySalaryRun(id: string, mode: PaymentMode) {
    return this.post<SalaryRunDetail>(`/payroll/runs/${id}/pay`, { mode });
  }

  /** A draft can be thrown away. Anything further along cannot. */
  discardSalaryRun(id: string) {
    return this.del<{ id: string }>(`/payroll/runs/${id}`);
  }

  // -- buying and stock ------------------------------------------------------

  /**
   * Everybody the shop buys from.
   *
   * A separate list from clients although the columns rhyme: the same firm is
   * occasionally both, and one list would have no way to say which way.
   */
  vendors(query?: { includeInactive?: boolean; search?: string; page?: number; limit?: number }) {
    return this.get<Paginated<Vendor>>('/vendors', query);
  }

  vendor(id: string) {
    return this.get<Vendor>(`/vendors/${id}`);
  }

  createVendor(body: VendorInput) {
    return this.post<Vendor>('/vendors', body);
  }

  updateVendor(id: string, body: VendorInput) {
    return this.patch<Vendor>(`/vendors/${id}`, body);
  }

  /** Retires them. Every purchase ever placed still hangs off the row. */
  retireVendor(id: string) {
    return this.del<Vendor>(`/vendors/${id}`);
  }

  purchases(query?: {
    status?: PurchaseStatus;
    vendorId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    return this.get<Paginated<Purchase>>('/purchases', query);
  }

  purchase(id: string) {
    return this.get<Purchase>(`/purchases/${id}`);
  }

  createPurchase(body: PurchaseInput) {
    return this.post<Purchase>('/purchases', body);
  }

  /** Only a draft. Once it is sent, receive against it instead. */
  updatePurchase(id: string, body: PurchaseInput) {
    return this.patch<Purchase>(`/purchases/${id}`, body);
  }

  placePurchase(id: string) {
    return this.post<Purchase>(`/purchases/${id}/place`);
  }

  /** A delivery. Stock arrives here and nowhere else. */
  receivePurchase(
    id: string,
    body: { lines: { purchaseItemId: string; quantity: number }[]; at?: string; note?: string },
  ) {
    return this.post<Purchase>(`/purchases/${id}/receive`, body);
  }

  /** The vendor's own paperwork, once it arrives. */
  billPurchase(id: string, body: { billNumber: string; billedOn: string; otherCharges?: number }) {
    return this.post<Purchase>(`/purchases/${id}/bill`, body);
  }

  payPurchase(id: string, body: { mode: PaymentMode; paidOn?: string }) {
    return this.post<Purchase>(`/purchases/${id}/pay`, body);
  }

  /** Cancels one nothing has arrived against. */
  cancelPurchase(id: string) {
    return this.del<Purchase>(`/purchases/${id}`);
  }

  /** What is on the rack, and what it is worth. */
  stockLevels(query?: { materialId?: string; search?: string; lowOnly?: boolean }) {
    return this.get<StockLevels>('/stock', {
      ...query,
      lowOnly: query?.lowOnly ? 'true' : undefined,
    });
  }

  /** Every move against one material — the story of the rack. */
  stockMoves(materialId: string) {
    return this.get<StockMove[]>(`/stock/${materialId}/moves`);
  }

  /**
   * Issuing, the offcut back, the waste, a count.
   *
   * Never a delivery: stock arrives against a purchase, so that everything on
   * the rack has a bill behind it.
   */
  recordStockMove(body: {
    materialId: string;
    thicknessId?: string;
    kind: StockMoveKind;
    quantity: number;
    unit?: string;
    orderId?: string;
    at?: string;
    reason?: string;
    note?: string;
  }) {
    return this.post<StockMove>('/stock/moves', body);
  }

  /** What became of the material that left the rack. */
  wasteReport(query: { from: string; to: string; materialId?: string }) {
    return this.get<WasteReport>('/stock/waste', query);
  }

  // -- the platform: ours, not a tenant's ---------------------------------------

  /** Everything the FirstLeap dashboard shows, in one call. */
  platformOverview() {
    return this.get<unknown>('/platform/overview');
  }

  /** Whether the work on a clock actually ran. */
  platformJobHealth() {
    return this.get<unknown>('/platform/job-health');
  }

  platformTiers() {
    return this.get<unknown>('/platform/tiers');
  }

  setTierPrice(key: string, body: { monthlyPrice?: number; includedModules?: string[]; isActive?: boolean }) {
    return this.patch<unknown>(`/platform/tiers/${key}`, body);
  }

  platformModulePrices() {
    return this.get<unknown>('/platform/module-prices');
  }

  setModulePrice(moduleKey: string, monthlyPrice: number) {
    return this.patch<unknown>(`/platform/module-prices/${moduleKey}`, { monthlyPrice });
  }

  createTier(body: {
    key: string;
    label: string;
    blurb?: string;
    monthlyPrice?: number;
    includedModules?: string[];
  }) {
    return this.post<unknown>('/platform/tiers', body);
  }

  deleteTier(key: string) {
    return this.del<unknown>(`/platform/tiers/${key}`);
  }

  /** Who would lose what, asked before the tier is saved rather than after. */
  tierEffect(key: string, includedModules: string[]) {
    return this.post<{
      gaining: string[];
      losing: { module: string; label: string; workspaces: { id: string; name: string }[] }[];
      workspacesOnTier: number;
    }>(`/platform/tiers/${key}/effect`, { includedModules });
  }

  /** Whether a payment gateway is connected at all. A screen must not pretend. */
  billingGateway() {
    return this.get<{
      provider: string;
      connected: boolean;
      webhooksVerifiable: boolean;
    }>('/platform/billing/gateway');
  }

  billingInvoices(query?: { tenantId?: string }) {
    return this.get<unknown>('/platform/billing/invoices', query);
  }

  /** Work out this month's bills now, rather than waiting for the morning. */
  runBilling() {
    return this.post<{ written: number; skipped: number }>('/platform/billing/run', {});
  }

  /** Send one: make somewhere to pay it, and record where. */
  issueInvoice(id: string) {
    return this.post<unknown>(`/platform/billing/invoices/${id}/issue`, {});
  }

  /** Withdraw one. Never deleted — a bill sent and withdrawn happened. */
  voidInvoice(id: string, reason: string) {
    return this.post<unknown>(`/platform/billing/invoices/${id}/void`, { reason });
  }

  /** The book of business: what everybody pays and what needs doing this week. */
  platformBilling() {
    return this.get<unknown>('/platform/billing');
  }

  /** One workspace, all the way down: what they have, who is in it, how it goes. */
  tenantDetail(id: string) {
    return this.get<unknown>(`/platform/tenants/${id}/detail`);
  }

  // -- FirstLeap's own people ---------------------------------------------------

  platformRoles() {
    return this.get<unknown>('/platform/roles');
  }

  createPlatformRole(body: {
    key: string;
    name: string;
    blurb?: string;
    permissions: string[];
  }) {
    return this.post<unknown>('/platform/roles', body);
  }

  savePlatformRole(key: string, body: { name?: string; blurb?: string; permissions: string[] }) {
    return this.patch<unknown>(`/platform/roles/${key}`, body);
  }

  deletePlatformRole(key: string) {
    return this.del<unknown>(`/platform/roles/${key}`);
  }

  platformStaff() {
    return this.get<unknown>('/platform/staff');
  }

  createPlatformStaff(body: {
    email: string;
    name: string;
    role: string;
    password: string;
  }) {
    return this.post<unknown>('/platform/staff', body);
  }

  savePlatformStaff(id: string, body: { name?: string; role?: string; isActive?: boolean }) {
    return this.patch<unknown>(`/platform/staff/${id}`, body);
  }

  // -- reports -----------------------------------------------------------------

  reports(query?: { kind?: string; status?: string; take?: number }) {
    return this.get<Report[]>('/reports', query);
  }

  report(id: string) {
    return this.get<Report>(`/reports/${id}`);
  }

  /**
   * Ask for one. Answers as soon as it is queued, not when it is built —
   * the screen polls the row rather than holding a request open for a quarter
   * of the ledger.
   */
  requestReport(body: {
    kind: string;
    format?: 'XLSX' | 'PDF';
    from?: string;
    to?: string;
    clientId?: string;
  }) {
    return this.post<Report>('/reports', body);
  }

  reportDownloadUrl(id: string): string {
    return `${this.baseUrl}/reports/${id}/download`;
  }

  // -- the paper: invoices, challans and credit notes -------------------------

  invoices(query?: { orderId?: string; from?: string; to?: string; search?: string }) {
    return this.get<Invoice[]>('/invoices', query);
  }

  invoice(id: string) {
    return this.get<Invoice>(`/invoices/${id}`);
  }

  /** The invoice for one order, or null when it has not been raised. */
  orderInvoice(orderId: string) {
    return this.get<Invoice | null>(`/orders/${orderId}/invoice`);
  }

  /** One per order. A correction is a credit note, never a second invoice. */
  raiseInvoice(
    orderId: string,
    body?: { issuedOn?: string; dueOn?: string; terms?: string; note?: string },
  ) {
    return this.post<Invoice>(`/orders/${orderId}/invoice`, body ?? {});
  }

  /** Voids one, keeping its number. The reason is the only record of why. */
  cancelInvoice(id: string, reason: string) {
    return this.post<Invoice>(`/invoices/${id}/cancel`, { reason });
  }

  /**
   * A client's statement, as paper. HTML the browser prints to PDF, like
   * every other document here.
   */
  clientStatementUrl(id: string, period?: { from?: string; to?: string }): string {
    const query = new URLSearchParams();
    if (period?.from) query.set('from', period.from);
    if (period?.to) query.set('to', period.to);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return `${this.baseUrl}/clients/${id}/statement${suffix}`;
  }

  invoiceDocumentUrl(id: string): string {
    return `${this.baseUrl}/invoices/${id}/document`;
  }

  challans(query?: { orderId?: string }) {
    return this.get<Challan[]>('/challans', query);
  }

  challan(id: string) {
    return this.get<Challan>(`/challans/${id}`);
  }

  /** More than one is allowed: a job often leaves in two vans on two days. */
  issueChallan(
    orderId: string,
    body?: {
      issuedOn?: string;
      shipTo?: string;
      transport?: string;
      vehicle?: string;
      note?: string;
    },
  ) {
    return this.post<Challan>(`/orders/${orderId}/challan`, body ?? {});
  }

  cancelChallan(id: string, reason: string) {
    return this.post<Challan>(`/challans/${id}/cancel`, { reason });
  }

  challanDocumentUrl(id: string): string {
    return `${this.baseUrl}/challans/${id}/document`;
  }

  creditNotes(query?: { invoiceId?: string }) {
    return this.get<CreditNote[]>('/credit-notes', query);
  }

  creditNote(id: string) {
    return this.get<CreditNote>(`/credit-notes/${id}`);
  }

  /**
   * Credits part or all of an invoice.
   *
   * The taxable value is what is passed; the GST comes off in the proportion
   * the invoice charged it. Never a payment, and never counted as one.
   */
  creditInvoice(
    invoiceId: string,
    body: { taxable: number; reason: CreditReason; note: string; issuedOn?: string },
  ) {
    return this.post<CreditNote>(`/invoices/${invoiceId}/credit-notes`, body);
  }

  cancelCreditNote(id: string, reason: string) {
    return this.post<CreditNote>(`/credit-notes/${id}/cancel`, { reason });
  }

  creditNoteDocumentUrl(id: string): string {
    return `${this.baseUrl}/credit-notes/${id}/document`;
  }

  /**
   * What an order was charged, credited and paid.
   *
   * Three figures, and they stay three. Nothing here folds what was credited
   * into what was received, so an order can never look paid by money nobody
   * collected.
   */
  orderReceivable(orderId: string) {
    return this.get<Receivable | null>(`/orders/${orderId}/receivable`);
  }

  // -- letters ---------------------------------------------------------------

  /** What a letter says, before it is about anybody. */
  letterTemplates(kind?: LetterKind) {
    return this.get<LetterTemplate[]>('/letters/templates', kind ? { kind } : undefined);
  }

  createLetterTemplate(body: { kind: LetterKind; name: string; body: string }) {
    return this.post<LetterTemplate>('/letters/templates', body);
  }

  updateLetterTemplate(
    id: string,
    body: { kind: LetterKind; name: string; body: string; isActive?: boolean },
  ) {
    return this.patch<LetterTemplate>(`/letters/templates/${id}`, body);
  }

  /**
   * What a template says once it is about a particular person.
   *
   * Worked out on the server so the preview somebody reads and the letter that
   * is filed come from the same substitution.
   */
  letterDraft(templateId: string, employeeId: string) {
    return this.get<LetterDraft>('/letters/draft', { templateId, employeeId });
  }

  letters(query?: { employeeId?: string; kind?: LetterKind }) {
    return this.get<Letter[]>('/letters', query);
  }

  /** Files a letter as it was given. The body is kept, not the template. */
  issueLetter(body: {
    employeeId: string;
    kind: LetterKind;
    title: string;
    body: string;
    issuedOn?: string;
  }) {
    return this.post<Letter>('/letters', body);
  }

  /** The letter itself, on the shop's letterhead. */
  letterDocumentUrl(id: string): string {
    return `${this.baseUrl}/letters/${id}/document`;
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

  // -- notifications --------------------------------------------------------

  /** What happened while you were not looking, newest first. */
  notifications(query?: { unread?: boolean; before?: string }) {
    return this.get<{ items: AppNotification[]; unread: number }>('/notifications', query);
  }

  /** Just the number, for the bell. */
  unreadNotifications() {
    return this.get<{ unread: number }>('/notifications/unread');
  }

  readNotification(id: string) {
    return this.post<{ read: number }>(`/notifications/${id}/read`);
  }

  readAllNotifications() {
    return this.post<{ read: number }>('/notifications/read-all');
  }

  /** Every trigger the product has, with this shop's wording where they set it. */
  notificationSettings() {
    return this.get<NotificationSetting[]>('/notifications/settings/all');
  }

  saveNotificationSetting(
    key: string,
    body: { title?: string; body?: string; enabled?: boolean },
  ) {
    return this.request<NotificationSetting[]>('PUT', `/notifications/settings/${key}`, body);
  }

  // -- releases (the app binary and what it runs) ---------------------------

  /**
   * Open a workspace to help whoever is in it.
   *
   * Comes back with a short-lived token for one of their own accounts. The
   * reason is written into that shop's own history, so it is not optional and
   * it is not for us.
   */
  openWorkspace(tenantId: string, reason: string) {
    return this.post<{
      accessToken: string;
      workspace: { slug: string; name: string };
      as: string;
      expiresIn: string;
    }>(`/platform/tenants/${tenantId}/open`, { reason });
  }

  releases(query?: { channel?: string; platform?: string }) {
    return this.get<Release[]>('/platform/releases', query);
  }



  /** Publish it, move the rollout, or retire it. */
  updateRelease(
    id: string,
    body: { status?: ReleaseStatus; rolloutPercent?: number; changelog?: string },
  ) {
    return this.patch<Release>(`/platform/releases/${id}`, body);
  }

  versionGates() {
    return this.get<VersionGate[]>('/platform/releases/gates/all');
  }

  setVersionGate(body: {
    platform: 'ios' | 'android';
    channel: string;
    minimumVersion: string;
    recommendedVersion?: string;
    message?: string;
  }) {
    return this.request<VersionGate>('PUT', '/platform/releases/gates', body);
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

  updateTenant(
    id: string,
    body: { name?: string; status?: TenantStatus; plan?: string; modules?: string[] },
  ) {
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
