import type { LengthUnit } from './units';
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

  async login(identifier: string, password: string): Promise<LoginResponse> {
    const result = await this.post<LoginResponse>('/auth/login', { identifier, password });
    this.token = result.accessToken;
    return result;
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

  createClient(body: { name: string; phone?: string; email?: string; company?: string; address?: string }) {
    return this.post<Client>('/clients', body);
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

  defaultWorkflow() {
    return this.get<Workflow>('/workflows/default');
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

  allowedNext(statusId: string) {
    return this.get<(WorkflowTransition & { toStatus: WorkflowStatus })[]>(
      `/workflows/statuses/${statusId}/next`,
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

  punchOrder(body: PunchOrderInput) {
    return this.post<Order>('/orders', body);
  }

  updateOrder(id: string, body: { location?: string; priority?: string; dueDate?: string; notes?: string }) {
    return this.patch<Order>(`/orders/${id}`, body);
  }

  changeOrderStatus(id: string, body: { toStatusId: string; note?: string }) {
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

  removeAttachment(attachmentId: string) {
    return this.del<unknown>(`/orders/attachments/${attachmentId}`);
  }

  // -- leads ----------------------------------------------------------------

  leads(query?: {
    statusId?: string;
    ownerId?: string;
    sourceId?: string;
    search?: string;
    converted?: boolean;
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

  changeLeadStatus(id: string, body: { toStatusId: string; note?: string }) {
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
