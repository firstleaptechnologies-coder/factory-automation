/**
 * Wire types shared by the API, the web app and the mobile app.
 *
 * These mirror the Prisma models but stay hand-written on purpose: the clients
 * should not depend on @prisma/client, and Decimal columns arrive as strings or
 * numbers over JSON rather than as Prisma Decimals.
 */

export type UserRole =
  | 'ADMIN'
  | 'MANAGER'
  | 'SALES'
  | 'PLANNER'
  | 'OPERATOR'
  | 'STORE'
  | 'QC'
  | 'ACCOUNTS';

export type Uom = 'SHEET' | 'SLAB' | 'SQM' | 'SQFT' | 'RMT' | 'KG' | 'PCS' | 'LTR';

export type MachineType =
  | 'CNC_ROUTER'
  | 'CNC_LASER'
  | 'WATERJET'
  | 'PLASMA'
  | 'EDGE_BANDER'
  | 'PANEL_SAW'
  | 'POLISHER'
  | 'OTHER';

export type MachineStatus =
  | 'IDLE'
  | 'SETUP'
  | 'RUNNING'
  | 'PAUSED'
  | 'MAINTENANCE'
  | 'BREAKDOWN'
  | 'OFFLINE';

export type JobStatus =
  | 'PLANNED'
  | 'QUEUED'
  | 'SETUP'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'CANCELLED';

export type OrderStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'IN_PRODUCTION'
  | 'READY'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'
  | 'CANCELLED';

export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type StockUnitKind = 'FULL_SHEET' | 'PARTIAL' | 'OFFCUT' | 'BULK';

export type StockUnitStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'IN_USE'
  | 'CONSUMED'
  | 'SCRAPPED'
  | 'QUARANTINED';

export type WasteType =
  | 'OFFCUT'
  | 'KERF'
  | 'TRIM'
  | 'SETUP_LOSS'
  | 'REJECTION'
  | 'DAMAGE'
  | 'TEST_CUT';

export type WasteDisposition = 'REUSE' | 'RECYCLE' | 'SELL' | 'DISPOSE' | 'PENDING';

export type QcResult = 'PASS' | 'FAIL' | 'REWORK';

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

export interface MaterialCategory {
  id: string;
  code: string;
  name: string;
  description?: string | null;
}

export interface Material {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  category?: Pick<MaterialCategory, 'id' | 'code' | 'name'>;
  uom: Uom;
  isSheetGood: boolean;
  thicknessMm?: string | null;
  lengthMm?: string | null;
  widthMm?: string | null;
  hasGrain: boolean;
  defaultKerfMm: string;
  standardCost: string;
  isActive: boolean;
}

export interface StockUnit {
  id: string;
  code: string;
  materialId: string;
  material?: Pick<Material, 'id' | 'code' | 'name' | 'uom'>;
  kind: StockUnitKind;
  status: StockUnitStatus;
  lengthMm?: string | null;
  widthMm?: string | null;
  thicknessMm?: string | null;
  areaSqm?: string | null;
  quantity?: string | null;
  locationId?: string | null;
  location?: { id: string; code: string; name: string } | null;
  parentId?: string | null;
  receivedAt: string;
}

export interface StockSummaryRow {
  materialId: string;
  materialCode?: string;
  materialName?: string;
  category?: string;
  kind: StockUnitKind;
  pieces: number;
  areaSqm: number;
  quantity: number;
  belowReorderLevel: boolean;
}

export interface Machine {
  id: string;
  code: string;
  name: string;
  type: MachineType;
  status: MachineStatus;
  bedLengthMm?: string | null;
  bedWidthMm?: string | null;
  hourlyRate: string;
}

export interface Job {
  id: string;
  code: string;
  status: JobStatus;
  priority: Priority;
  sequence: number;
  quantity: string;
  completedQty: string;
  rejectedQty: string;
  machineId?: string | null;
  machine?: Pick<Machine, 'id' | 'code' | 'name'> | null;
  materialId: string;
  material?: Pick<Material, 'id' | 'code' | 'name'>;
  operator?: { id: string; name: string } | null;
  order?: {
    id?: string;
    code: string;
    dueDate?: string | null;
    customer?: { name: string };
  } | null;
  nestPlan?: { id: string; code: string; utilizationPct: string } | null;
  plannedStart?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  notes?: string | null;
}

export interface MachineBoardEntry {
  id: string;
  code: string;
  name: string;
  type: MachineType;
  status: MachineStatus;
  currentJob: Job | null;
  queueLength: number;
  queue: Job[];
}

export interface OrderItem {
  id: string;
  lineNo: number;
  description: string;
  materialId: string;
  material?: Pick<Material, 'id' | 'code' | 'name' | 'uom'>;
  status: string;
  quantity: string;
  uom: Uom;
  lengthMm?: string | null;
  widthMm?: string | null;
  unitPrice: string;
  amount: string;
  producedQty: string;
}

export interface Order {
  id: string;
  code: string;
  customerId: string;
  customer?: { id: string; code: string; name: string };
  poNumber?: string | null;
  status: OrderStatus;
  priority: Priority;
  orderDate: string;
  dueDate?: string | null;
  subtotal: string;
  taxAmount: string;
  total: string;
  items?: OrderItem[];
  _count?: { items: number; jobs: number };
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  isActive: boolean;
  _count?: { orders: number };
}

export interface NestPlacement {
  partId: string;
  label: string;
  sheetIndex: number;
  xMm: number;
  yMm: number;
  lengthMm: number;
  widthMm: number;
  rotationDeg: 0 | 90;
}

export interface NestPreview {
  material: { id: string; code: string; name: string };
  sheetLengthMm: number;
  sheetWidthMm: number;
  kerfMm: number;
  sheetsUsed: number;
  sheetAreaSqm: number;
  partsAreaSqm: number;
  offcutAreaSqm: number;
  utilizationPct: number;
  wasteAreaSqm: number;
  effectiveUtilizationPct: number;
  wasteCost: number;
  placements: NestPlacement[];
  recoverableOffcuts: {
    sheetIndex: number;
    xMm: number;
    yMm: number;
    lengthMm: number;
    widthMm: number;
    areaSqm: number;
  }[];
  unplaced: { partId: string; label: string; quantity: number }[];
}

export interface WasteAnalytics {
  totals: {
    records: number;
    areaSqm: number;
    costImpact: number;
    recoveryRatePct: number;
  };
  byType: {
    type: WasteType;
    records: number;
    areaSqm: number;
    weightKg: number;
    quantity: number;
    costImpact: number;
  }[];
  byMaterial: {
    materialId: string;
    code?: string;
    name?: string;
    category?: string;
    records: number;
    areaSqm: number;
    costImpact: number;
  }[];
  byDisposition: {
    disposition: WasteDisposition;
    records: number;
    areaSqm: number;
    costImpact: number;
  }[];
}

export interface Dashboard {
  orders: { open: number; overdue: number };
  jobs: Partial<Record<JobStatus, number>>;
  jobsCompletedToday: number;
  machines: Pick<Machine, 'id' | 'code' | 'name' | 'status'>[];
  wasteThisMonth: { areaSqm: number; cost: number };
  offcutStock: { pieces: number; areaSqm: number; value: number };
}

export interface MachineUtilization {
  machineId: string;
  code: string;
  name: string;
  runningMinutes: number;
  idleMinutes: number;
  setupMinutes: number;
  downMinutes: number;
  downtimeByReason: Record<string, number>;
  attendedMinutes: number;
  utilizationPct: number;
}
