import type { LengthUnit } from './units';

/** Wire types. Every *Mm field is millimetres — the only stored unit. */

export type UserRole = 'ADMIN' | 'MANAGER' | 'SALES' | 'PRODUCTION' | 'VIEWER';
export type StatusCategory = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type AttachmentKind = 'REFERENCE_IMAGE' | 'SIZE_IMAGE' | 'DOCUMENT';
export type StorageBackend = 'S3' | 'DATABASE';

export interface AuthUser {
  id: string;
  code: string;
  name: string;
  role: UserRole;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
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
  email?: string | null;
  gstin?: string | null;
  company?: string | null;
  address?: string | null;
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
  _count?: { ordersAtStatus: number };
}

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
  id: string;
  code: string;
  name: string;
  description?: string | null;
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
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  attachments: OrderAttachment[];
  statusHistory?: OrderStatusHistoryEntry[];
}

export interface OrderBoard {
  workflow: { id: string; code: string; name: string };
  columns: { status: WorkflowStatus; orders: Order[] }[];
}

/** A value plus the unit it was typed in; the API converts to mm. */
export interface Measurement {
  value: number;
  unit: LengthUnit;
}

export interface PunchItemInput {
  sizePresetId?: string;
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
  newClient?: { name: string; phone?: string; email?: string; company?: string; address?: string };
  location: string;
  workflowId?: string;
  priority?: Priority;
  dueDate?: string;
  notes?: string;
  items: PunchItemInput[];
}
