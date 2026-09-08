/**
 * What a role is allowed to do.
 *
 * Permissions are string keys rather than a fixed role enum because every shop
 * divides work differently — one has a dedicated QC person, another has the
 * owner doing everything. A tenant admin composes roles from these; the API
 * checks the key, never the role name.
 */

export const PERMISSIONS = {
  // Orders
  ORDER_VIEW: 'order.view',
  ORDER_PUNCH: 'order.punch',
  ORDER_EDIT: 'order.edit',
  ORDER_MOVE_STATUS: 'order.move_status',
  /*
   * Sending an order back the way it came.
   *
   * The flow the admin drew is one-way, and that is the point of it. But work
   * genuinely goes backwards — a piece fails QC and returns to sanding, a
   * client changes the design after it was approved — and without this the
   * only way to record it was to draw a permanent backwards arrow that anyone
   * could then take by accident. Held separately so it stays rare.
   */
  ORDER_MOVE_BACK: 'order.move_back',
  ORDER_ATTACH: 'order.attach',
  /**
   * Re-stating an order's terms — above all how its GST is treated. Kept apart
   * from ordinary pricing because it decides what the shop declares on a
   * supply, which is the accountant's call rather than the sales desk's.
   */
  ORDER_TERMS: 'order.terms',

  // Estimates
  ESTIMATE_VIEW: 'estimate.view',
  ESTIMATE_MANAGE: 'estimate.manage',

  // Leads
  LEAD_VIEW: 'lead.view',
  LEAD_CREATE: 'lead.create',
  LEAD_EDIT: 'lead.edit',
  LEAD_MOVE_STATUS: 'lead.move_status',
  /** Sending an enquiry back a stage. See ORDER_MOVE_BACK. */
  LEAD_MOVE_BACK: 'lead.move_back',
  LEAD_CONVERT: 'lead.convert',

  // Clients
  CLIENT_VIEW: 'client.view',
  CLIENT_MANAGE: 'client.manage',

  // Money
  PAYMENT_VIEW: 'payment.view',
  PAYMENT_RECORD: 'payment.record',
  /**
   * Taking a receipt back.
   *
   * The key still says delete because it is what tenants' roles already carry;
   * nothing is deleted any more. A receipt entered wrongly is corrected by
   * recording its opposite, which leaves both rows standing — so this permits a
   * correction that is visible, never a removal that is not.
   */
  PAYMENT_DELETE: 'payment.delete',
  CASH_DEPOSIT: 'payment.deposit',
  CASH_POSITION_VIEW: 'payment.cash_position',
  PRICING_EDIT: 'pricing.edit',

  // Disbursements — money paid out of an order to third parties. Gated
  // separately because a shop may want only its owner and accountant to see
  // what is owed to whom.
  DISBURSEMENT_VIEW: 'disbursement.view',
  DISBURSEMENT_MANAGE: 'disbursement.manage',

  // Expenses — what the shop spends on itself. Separate from payments because
  // the person who records the diesel is rarely the person who takes the money
  // in, and configuring the dropdowns is a third thing again.
  EXPENSE_VIEW: 'expense.view',
  EXPENSE_MANAGE: 'expense.manage',
  EXPENSE_CONFIG: 'expense.config',

  // People — the employees the shop has, as distinct from the logins it
  // issues. Seeing the staff list is one thing; reading somebody's Aadhaar is
  // another, and is gated on its own so the question "who looked at that" has
  // a small set of possible answers.
  EMPLOYEE_VIEW: 'employee.view',
  EMPLOYEE_MANAGE: 'employee.manage',
  EMPLOYEE_IDENTIFIERS: 'employee.identifiers',

  // The register. Marking it is a daily job for whoever stands at the door;
  // reading it is what the salary run and the shop's questions need.
  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_MARK: 'attendance.mark',

  // Shop configuration
  CONFIG_VIEW: 'config.view',
  CONFIG_MANAGE: 'config.manage',
  WORKFLOW_MANAGE: 'workflow.manage',
  GST_MANAGE: 'gst.manage',

  // People
  USER_VIEW: 'user.view',
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',

  // Platform — only ever granted to platform users, never to a tenant role.
  PLATFORM_TENANT_MANAGE: 'platform.tenant.manage',
  PLATFORM_TENANT_VIEW: 'platform.tenant.view',
  /**
   * The app binary and what it runs.
   *
   * There is one app in the stores for every workspace, so a release belongs to
   * whoever owns the product rather than to any shop — a tenant admin decides
   * how their shop works, not what code the phone in their hand is running.
   */
  PLATFORM_RELEASE_VIEW: 'platform.release.view',
  PLATFORM_RELEASE_MANAGE: 'platform.release.manage',
  /** Provisioning a new workspace, which seeds a whole shop. */
  PLATFORM_TENANT_CREATE: 'platform.tenant.create',
  /**
   * Opening somebody's workspace to help them.
   *
   * Held apart from everything else because it is the one platform power that
   * reaches inside a shop's own data. It is time-limited, it needs a reason,
   * and it writes that reason into the shop's own audit trail — so they can see
   * we were there even if nobody told them.
   */
  PLATFORM_IMPERSONATE: 'platform.impersonate',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/** Everything only the people who own the product may do. */
export const PLATFORM_PERMISSIONS: Permission[] = ALL_PERMISSIONS.filter((permission) =>
  permission.startsWith('platform.'),
);

/** Permissions a tenant role may hold — everything except the platform keys. */
export const TENANT_PERMISSIONS: Permission[] = ALL_PERMISSIONS.filter(
  (permission) => !permission.startsWith('platform.'),
);

/** Grouped for the role editor, so the UI does not have to know the taxonomy. */
export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  {
    label: 'Estimates',
    permissions: [PERMISSIONS.ESTIMATE_VIEW, PERMISSIONS.ESTIMATE_MANAGE],
  },
  {
    label: 'Orders',
    permissions: [
      PERMISSIONS.ORDER_VIEW,
      PERMISSIONS.ORDER_PUNCH,
      PERMISSIONS.ORDER_EDIT,
      PERMISSIONS.ORDER_MOVE_STATUS,
      PERMISSIONS.ORDER_MOVE_BACK,
      PERMISSIONS.ORDER_ATTACH,
      PERMISSIONS.ORDER_TERMS,
    ],
  },
  {
    label: 'Leads',
    permissions: [
      PERMISSIONS.LEAD_VIEW,
      PERMISSIONS.LEAD_CREATE,
      PERMISSIONS.LEAD_EDIT,
      PERMISSIONS.LEAD_MOVE_STATUS,
      PERMISSIONS.LEAD_MOVE_BACK,
      PERMISSIONS.LEAD_CONVERT,
    ],
  },
  {
    label: 'Clients',
    permissions: [PERMISSIONS.CLIENT_VIEW, PERMISSIONS.CLIENT_MANAGE],
  },
  {
    label: 'Money',
    permissions: [
      PERMISSIONS.PAYMENT_VIEW,
      PERMISSIONS.PAYMENT_RECORD,
      PERMISSIONS.PAYMENT_DELETE,
      PERMISSIONS.CASH_DEPOSIT,
      PERMISSIONS.CASH_POSITION_VIEW,
      PERMISSIONS.PRICING_EDIT,
      PERMISSIONS.DISBURSEMENT_VIEW,
      PERMISSIONS.DISBURSEMENT_MANAGE,
    ],
  },
  {
    label: 'Expenses',
    permissions: [
      PERMISSIONS.EXPENSE_VIEW,
      PERMISSIONS.EXPENSE_MANAGE,
      PERMISSIONS.EXPENSE_CONFIG,
    ],
  },
  {
    label: 'People',
    permissions: [
      PERMISSIONS.EMPLOYEE_VIEW,
      PERMISSIONS.EMPLOYEE_MANAGE,
      PERMISSIONS.EMPLOYEE_IDENTIFIERS,
      PERMISSIONS.ATTENDANCE_VIEW,
      PERMISSIONS.ATTENDANCE_MARK,
    ],
  },
  {
    label: 'Configuration',
    permissions: [
      PERMISSIONS.CONFIG_VIEW,
      PERMISSIONS.CONFIG_MANAGE,
      PERMISSIONS.WORKFLOW_MANAGE,
      PERMISSIONS.GST_MANAGE,
    ],
  },
  {
    label: 'People',
    permissions: [
      PERMISSIONS.USER_VIEW,
      PERMISSIONS.USER_MANAGE,
      PERMISSIONS.ROLE_MANAGE,
    ],
  },
];

/** Human labels, so neither client has to invent its own wording. */
export const PERMISSION_LABELS: Record<string, string> = {
  [PERMISSIONS.ORDER_VIEW]: 'View orders',
  [PERMISSIONS.ORDER_PUNCH]: 'Punch orders',
  [PERMISSIONS.ORDER_EDIT]: 'Edit orders',
  [PERMISSIONS.ORDER_MOVE_STATUS]: 'Move order status',
  [PERMISSIONS.ORDER_MOVE_BACK]: 'Send an order back a stage',
  [PERMISSIONS.ORDER_ATTACH]: 'Attach photos',
  [PERMISSIONS.ORDER_TERMS]: 'Change GST treatment',
  [PERMISSIONS.ESTIMATE_VIEW]: 'See estimates',
  [PERMISSIONS.ESTIMATE_MANAGE]: 'Write and send estimates',
  [PERMISSIONS.LEAD_VIEW]: 'View leads',
  [PERMISSIONS.LEAD_CREATE]: 'Create leads',
  [PERMISSIONS.LEAD_EDIT]: 'Edit leads',
  [PERMISSIONS.LEAD_MOVE_STATUS]: 'Move lead stage',
  [PERMISSIONS.LEAD_MOVE_BACK]: 'Send an enquiry back a stage',
  [PERMISSIONS.LEAD_CONVERT]: 'Convert leads to orders',
  [PERMISSIONS.CLIENT_VIEW]: 'View clients',
  [PERMISSIONS.CLIENT_MANAGE]: 'Add and edit clients',
  [PERMISSIONS.PAYMENT_VIEW]: 'View payments',
  [PERMISSIONS.PAYMENT_RECORD]: 'Record payments',
  [PERMISSIONS.PAYMENT_DELETE]: 'Take a receipt back',
  [PERMISSIONS.EXPENSE_VIEW]: 'View expenses',
  [PERMISSIONS.EXPENSE_MANAGE]: 'Record and edit expenses',
  [PERMISSIONS.EXPENSE_CONFIG]: 'Edit the expense dropdowns',
  [PERMISSIONS.EMPLOYEE_VIEW]: 'View the staff list',
  [PERMISSIONS.EMPLOYEE_MANAGE]: 'Add and edit employees',
  [PERMISSIONS.EMPLOYEE_IDENTIFIERS]: 'Read Aadhaar, PAN and bank details',
  [PERMISSIONS.ATTENDANCE_VIEW]: 'See the attendance register',
  [PERMISSIONS.ATTENDANCE_MARK]: 'Mark people in and out',
  [PERMISSIONS.PLATFORM_RELEASE_VIEW]: 'See app releases',
  [PERMISSIONS.PLATFORM_RELEASE_MANAGE]: 'Publish app releases',
  [PERMISSIONS.PLATFORM_TENANT_CREATE]: 'Provision workspaces',
  [PERMISSIONS.PLATFORM_IMPERSONATE]: 'Open a workspace to help',
  [PERMISSIONS.CASH_DEPOSIT]: 'Record bank deposits',
  // The key stays as it is: renaming a permission string would silently strip
  // it from every role a tenant has already saved.
  [PERMISSIONS.CASH_POSITION_VIEW]: 'View transactions and cash',
  [PERMISSIONS.PRICING_EDIT]: 'Set rates and prices',
  [PERMISSIONS.DISBURSEMENT_VIEW]: 'View payouts on orders',
  [PERMISSIONS.DISBURSEMENT_MANAGE]: 'Record and settle payouts',
  [PERMISSIONS.CONFIG_VIEW]: 'View configuration',
  [PERMISSIONS.CONFIG_MANAGE]: 'Manage materials and sizes',
  [PERMISSIONS.WORKFLOW_MANAGE]: 'Manage the status flow',
  [PERMISSIONS.GST_MANAGE]: 'Manage GST slabs',
  [PERMISSIONS.USER_VIEW]: 'View people',
  [PERMISSIONS.USER_MANAGE]: 'Add and edit people',
  [PERMISSIONS.ROLE_MANAGE]: 'Manage roles',
  [PERMISSIONS.PLATFORM_TENANT_VIEW]: 'View tenants',
  [PERMISSIONS.PLATFORM_TENANT_MANAGE]: 'Create and manage tenants',
};

/** Roles a new tenant starts with. The admin can edit or add to them. */
export const DEFAULT_ROLES: {
  code: string;
  name: string;
  description: string;
  permissions: Permission[];
}[] = [
  {
    code: 'OWNER',
    name: 'Owner',
    description: 'Full access to everything in this shop',
    permissions: TENANT_PERMISSIONS,
  },
  {
    code: 'MANAGER',
    name: 'Manager',
    description: 'Runs the shop day to day, but cannot change roles',
    permissions: TENANT_PERMISSIONS.filter(
      (p) => p !== PERMISSIONS.ROLE_MANAGE && p !== PERMISSIONS.PAYMENT_DELETE,
    ),
  },
  {
    code: 'SALES',
    name: 'Sales',
    description: 'Punches orders, works leads, takes payments',
    permissions: [
      PERMISSIONS.ORDER_VIEW, PERMISSIONS.ORDER_PUNCH, PERMISSIONS.ORDER_EDIT,
      PERMISSIONS.ORDER_MOVE_STATUS, PERMISSIONS.ORDER_ATTACH,
      PERMISSIONS.ESTIMATE_VIEW, PERMISSIONS.ESTIMATE_MANAGE,
      PERMISSIONS.LEAD_VIEW, PERMISSIONS.LEAD_CREATE, PERMISSIONS.LEAD_EDIT,
      PERMISSIONS.LEAD_MOVE_STATUS, PERMISSIONS.LEAD_CONVERT,
      PERMISSIONS.CLIENT_VIEW, PERMISSIONS.CLIENT_MANAGE,
      PERMISSIONS.PAYMENT_VIEW, PERMISSIONS.PAYMENT_RECORD,
      PERMISSIONS.PRICING_EDIT, PERMISSIONS.CONFIG_VIEW,
    ],
  },
  {
    code: 'PRODUCTION',
    name: 'Production',
    description: 'Moves work through the floor; sees no money',
    permissions: [
      PERMISSIONS.ORDER_VIEW, PERMISSIONS.ORDER_MOVE_STATUS,
      PERMISSIONS.ORDER_ATTACH, PERMISSIONS.CLIENT_VIEW,
      PERMISSIONS.CONFIG_VIEW,
    ],
  },
];

/**
 * Who works on the product, and what each of them may do.
 *
 * The people who own the product are not all the same person: somebody
 * answering a support call needs to open a workspace and needs nothing to do
 * with releases; whoever ships the app needs the opposite; billing changes what
 * a shop pays for and should not be inside their data at all.
 *
 * A fixed list rather than the composable roles a tenant gets: there are four
 * of us, not four hundred, and the blast radius here is every workspace.
 */
export const PLATFORM_ROLES: {
  key: string;
  label: string;
  blurb: string;
  permissions: Permission[];
}[] = [
  {
    key: 'OWNER',
    label: 'Owner',
    blurb: 'Everything, including provisioning a new workspace',
    permissions: [...PLATFORM_PERMISSIONS],
  },
  {
    key: 'SUPPORT',
    label: 'Support',
    blurb: 'Can open a workspace to help, and see what the app is running',
    permissions: [
      PERMISSIONS.PLATFORM_TENANT_VIEW,
      PERMISSIONS.PLATFORM_IMPERSONATE,
      PERMISSIONS.PLATFORM_RELEASE_VIEW,
    ],
  },
  {
    key: 'BILLING',
    label: 'Billing',
    blurb: 'Changes what a workspace is on. Never inside their data',
    permissions: [PERMISSIONS.PLATFORM_TENANT_VIEW, PERMISSIONS.PLATFORM_TENANT_MANAGE],
  },
  {
    key: 'ENGINEER',
    label: 'Engineering',
    blurb: 'Ships the app. Sees workspaces, does not go into one',
    permissions: [
      PERMISSIONS.PLATFORM_TENANT_VIEW,
      PERMISSIONS.PLATFORM_RELEASE_VIEW,
      PERMISSIONS.PLATFORM_RELEASE_MANAGE,
    ],
  },
];

export const DEFAULT_PLATFORM_ROLE = 'OWNER';

export function platformPermissionsFor(role?: string | null): Permission[] {
  const found = PLATFORM_ROLES.find((one) => one.key === role);
  // An unknown role is given the least, not the most: a typo on a row must not
  // hand somebody every workspace.
  return found?.permissions ?? [PERMISSIONS.PLATFORM_TENANT_VIEW];
}
