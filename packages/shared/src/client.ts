import type {
  AuthUser,
  Customer,
  Dashboard,
  Job,
  JobStatus,
  LoginResponse,
  Machine,
  MachineBoardEntry,
  MachineStatus,
  MachineUtilization,
  Material,
  MaterialCategory,
  NestPreview,
  Order,
  Paginated,
  QcResult,
  StockSummaryRow,
  StockUnit,
  WasteAnalytics,
} from './types';

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
  /** Called on 401 so the app can drop the session and show the login screen. */
  onUnauthorized?: () => void;
}

type Query = Record<string, string | number | boolean | undefined | null>;

/**
 * One HTTP client for both the web app and the React Native app — no framework
 * imports, just fetch, which both platforms provide.
 */
export class ApiClient {
  private token: string | null = null;

  constructor(private readonly options: ApiClientOptions) {}

  setToken(token: string | null): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  // -- plumbing -------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Query,
  ): Promise<T> {
    const url = new URL(
      `${this.options.baseUrl.replace(/\/$/, '')}${path}`,
    );
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

    if (response.status === 401) {
      this.options.onUnauthorized?.();
    }

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

  // -- auth -----------------------------------------------------------------

  async login(identifier: string, password: string): Promise<LoginResponse> {
    const result = await this.post<LoginResponse>('/auth/login', {
      identifier,
      password,
    });
    this.token = result.accessToken;
    return result;
  }

  me() {
    return this.get<AuthUser>('/auth/me');
  }

  // -- masters --------------------------------------------------------------

  materialCategories() {
    return this.get<MaterialCategory[]>('/materials/categories');
  }

  materials(query?: { search?: string; categoryId?: string; page?: number; limit?: number }) {
    return this.get<Paginated<Material>>('/materials', query);
  }

  customers(query?: { search?: string; page?: number; limit?: number }) {
    return this.get<Paginated<Customer>>('/customers', query);
  }

  createCustomer(body: Partial<Customer> & { code: string; name: string }) {
    return this.post<Customer>('/customers', body);
  }

  // -- inventory ------------------------------------------------------------

  stock(query?: {
    materialId?: string;
    locationId?: string;
    kind?: string;
    status?: string;
    search?: string;
    offcutsOnly?: boolean;
    page?: number;
    limit?: number;
  }) {
    return this.get<Paginated<StockUnit>>('/inventory/stock', query);
  }

  stockSummary() {
    return this.get<StockSummaryRow[]>('/inventory/stock/summary');
  }

  stockUnit(id: string) {
    return this.get<StockUnit>(`/inventory/stock/${id}`);
  }

  stockLocations() {
    return this.get<{ id: string; code: string; name: string; type: string }[]>(
      '/inventory/locations',
    );
  }

  receiveStock(body: {
    materialId: string;
    locationId?: string;
    pieces: number;
    lengthMm?: number;
    widthMm?: number;
    thicknessMm?: number;
    quantity?: number;
    unitCost?: number;
    batchNo?: string;
    note?: string;
  }) {
    return this.post<{ received: number; units: StockUnit[] }>('/inventory/receive', body);
  }

  issueStock(body: { jobId: string; stockUnitIds: string[]; note?: string }) {
    return this.post<{ issued: number }>('/inventory/issue', body);
  }

  closeSheet(body: {
    stockUnitId: string;
    jobId?: string;
    offcuts?: { lengthMm: number; widthMm: number; locationId?: string }[];
    remarks?: string;
  }) {
    return this.post<{
      stockUnit: string;
      sheetAreaSqm: number;
      recoveredOffcuts: number;
      recoveredAreaSqm: number;
    }>('/inventory/close-sheet', body);
  }

  // -- machines -------------------------------------------------------------

  machines() {
    return this.get<Machine[]>('/machines');
  }

  machineBoard() {
    return this.get<MachineBoardEntry[]>('/machines/board');
  }

  downtimeReasons() {
    return this.get<{ id: string; code: string; name: string; isPlanned: boolean }[]>(
      '/machines/downtime-reasons',
    );
  }

  setMachineStatus(id: string, body: { status: MachineStatus; downtimeReasonId?: string; note?: string }) {
    return this.patch<Machine>(`/machines/${id}/status`, body);
  }

  // -- orders ---------------------------------------------------------------

  orders(query?: { status?: string; customerId?: string; search?: string; page?: number; limit?: number }) {
    return this.get<Paginated<Order>>('/orders', query);
  }

  order(id: string) {
    return this.get<Order>(`/orders/${id}`);
  }

  createOrder(body: unknown) {
    return this.post<Order>('/orders', body);
  }

  setOrderStatus(id: string, status: string) {
    return this.patch<Order>(`/orders/${id}/status`, { status });
  }

  pendingForPlanning() {
    return this.get<unknown[]>('/orders/pending-planning');
  }

  // -- production -----------------------------------------------------------

  jobs(query?: {
    status?: JobStatus;
    machineId?: string;
    orderId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    return this.get<Paginated<Job>>('/jobs', query);
  }

  myQueue() {
    return this.get<Job[]>('/jobs/my-queue');
  }

  job(id: string) {
    return this.get<Job>(`/jobs/${id}`);
  }

  createJob(body: unknown) {
    return this.post<Job>('/jobs', body);
  }

  assignJob(id: string, body: { machineId: string; operatorId?: string; sequence?: number }) {
    return this.patch<Job>(`/jobs/${id}/assign`, body);
  }

  resequenceJobs(body: { machineId: string; jobIds: string[] }) {
    return this.post<Job[]>('/jobs/resequence', body);
  }

  startJob(id: string) {
    return this.post<Job>(`/jobs/${id}/start`);
  }

  pauseJob(id: string, body?: { downtimeReasonId?: string; note?: string }) {
    return this.post<Job>(`/jobs/${id}/pause`, body ?? {});
  }

  updateJobProgress(id: string, body: { completedQty?: number; rejectedQty?: number; note?: string }) {
    return this.patch<Job>(`/jobs/${id}/progress`, body);
  }

  completeJob(id: string) {
    return this.post<Job>(`/jobs/${id}/complete`);
  }

  recordQualityCheck(
    id: string,
    body: {
      result: QcResult;
      qtyChecked: number;
      qtyPassed: number;
      qtyRejected?: number;
      reasonId?: string;
      remarks?: string;
    },
  ) {
    return this.post<unknown>(`/jobs/${id}/quality-check`, body);
  }

  // -- nesting --------------------------------------------------------------

  previewNest(body: {
    materialId: string;
    sheetLengthMm?: number;
    sheetWidthMm?: number;
    kerfMm?: number;
    marginMm?: number;
    parts: {
      orderItemId?: string;
      label: string;
      lengthMm: number;
      widthMm: number;
      quantity: number;
      allowRotation?: boolean;
    }[];
  }) {
    return this.post<NestPreview>('/nesting/preview', body);
  }

  createNestPlan(body: unknown) {
    return this.post<unknown>('/nesting/plans', body);
  }

  nestPlans(status?: string) {
    return this.get<unknown[]>('/nesting/plans', { status });
  }

  // -- waste & reports ------------------------------------------------------

  wasteAnalytics(query?: { from?: string; to?: string; materialId?: string }) {
    return this.get<WasteAnalytics>('/waste/analytics', query);
  }

  wasteRecords(query?: { materialId?: string; type?: string; page?: number; limit?: number }) {
    return this.get<Paginated<unknown>>('/waste', query);
  }

  offcutInventory() {
    return this.get<
      { materialId: string; code?: string; name?: string; pieces: number; areaSqm: number; value: number }[]
    >('/waste/offcut-inventory');
  }

  dashboard() {
    return this.get<Dashboard>('/reports/dashboard');
  }

  machineUtilization(query?: { from?: string; to?: string }) {
    return this.get<MachineUtilization[]>('/reports/machine-utilization', query);
  }

  materialYield(query?: { from?: string; to?: string }) {
    return this.get<unknown[]>('/reports/material-yield', query);
  }
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
