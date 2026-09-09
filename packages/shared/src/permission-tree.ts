import { MODULES, ModuleKey } from './modules';
import { PERMISSIONS, Permission } from './permissions';

/**
 * Every permission, as the tree a person actually reasons about.
 *
 * Four levels, because "who may do what" is a question asked at four
 * different sizes:
 *
 *   module → feature → group → permission
 *
 * The module is what the workspace **bought**; the permission is what somebody
 * inside it **may do**. Those are two independent gates and always have been —
 * a workspace admin holding every permission still cannot open a module their
 * plan excludes. Hanging the tree off modules makes that visible instead of
 * folklore: an editor can grey out a whole branch a shop has not bought, so
 * nobody spends an afternoon ticking Purchasing permissions for a shop that
 * has no Purchasing.
 *
 * A flat list was the old shape, and it had the two failures a flat list
 * always has. `Buying and stock` appeared **twice, identically** — added once
 * and then again by somebody who could not see it was already there. And
 * `People` appeared twice meaning **different things**: employees and salary
 * under one, users and roles under the other. Both collided as React keys, and
 * neither was noticeable while scrolling sixty-two checkboxes.
 */

export interface PermissionGroupNode {
  /** Stable, and unique across the whole tree. Keys and Select All depend on it. */
  key: string;
  label: string;
  /** What ticking everything here would grant. */
  permissions: Permission[];
}

export interface PermissionFeatureNode {
  key: string;
  label: string;
  /** One line saying what the feature is, for somebody who has not used it. */
  blurb?: string;
  groups: PermissionGroupNode[];
}

export interface PermissionSection {
  key: string;
  label: string;
  /**
   * What the workspace must have bought for any of this to be reachable.
   *
   * Null for the things every workspace has whatever they pay — signing people
   * in, and configuring the shop. There is no plan that excludes those.
   */
  module: ModuleKey | null;
  features: PermissionFeatureNode[];
}

export const PERMISSION_TREE: readonly PermissionSection[] = [
  {
    key: 'orders',
    label: 'Orders',
    module: MODULES.ORDERS,
    features: [
      {
        key: 'orders.work',
        label: 'Orders',
        blurb: 'Taking work in and moving it through the shop',
        groups: [
          { key: 'orders.see', label: 'Seeing them', permissions: [PERMISSIONS.ORDER_VIEW] },
          {
            key: 'orders.punch',
            label: 'Punching and editing',
            permissions: [PERMISSIONS.ORDER_PUNCH, PERMISSIONS.ORDER_EDIT],
          },
          {
            key: 'orders.flow',
            label: 'Moving through stages',
            // Going back a stage is its own permission: it un-does work
            // somebody has already been told is finished.
            permissions: [PERMISSIONS.ORDER_MOVE_STATUS, PERMISSIONS.ORDER_MOVE_BACK],
          },
          {
            key: 'orders.photos',
            label: 'Photos',
            permissions: [PERMISSIONS.ORDER_ATTACH],
          },
          {
            key: 'orders.tax',
            // Not "terms". It decides whether GST is added on top, taken out
            // of the figure, or absorbed — which changes what the client pays
            // and what the shop owes, so it is its own decision to grant.
            label: 'GST treatment',
            permissions: [PERMISSIONS.ORDER_TERMS],
          },
        ],
      },
    ],
  },
  {
    key: 'clients',
    label: 'Clients',
    module: MODULES.CLIENTS,
    features: [
      {
        key: 'clients.records',
        label: 'Clients',
        blurb: 'Who the shop works for, and their billing details',
        groups: [
          {
            key: 'clients.all',
            label: 'Records',
            permissions: [PERMISSIONS.CLIENT_VIEW, PERMISSIONS.CLIENT_MANAGE],
          },
        ],
      },
    ],
  },
  {
    key: 'leads',
    label: 'Leads',
    module: MODULES.LEADS,
    features: [
      {
        key: 'leads.pipeline',
        label: 'Leads',
        blurb: 'Enquiries, and the pipeline they move through',
        groups: [
          {
            key: 'leads.records',
            label: 'Records',
            permissions: [PERMISSIONS.LEAD_VIEW, PERMISSIONS.LEAD_CREATE, PERMISSIONS.LEAD_EDIT],
          },
          {
            key: 'leads.flow',
            label: 'Moving through stages',
            permissions: [PERMISSIONS.LEAD_MOVE_STATUS, PERMISSIONS.LEAD_MOVE_BACK],
          },
          {
            key: 'leads.convert',
            label: 'Turning into work',
            permissions: [PERMISSIONS.LEAD_CONVERT],
          },
        ],
      },
    ],
  },
  {
    key: 'quotes',
    label: 'Quotes',
    module: MODULES.QUOTES,
    features: [
      {
        key: 'quotes.estimates',
        label: 'Quotes',
        blurb: 'Priced quotations, before there is an order',
        groups: [
          {
            key: 'quotes.all',
            label: 'Quotations',
            permissions: [PERMISSIONS.ESTIMATE_VIEW, PERMISSIONS.ESTIMATE_MANAGE],
          },
        ],
      },
    ],
  },
  {
    key: 'finance',
    label: 'Finances',
    module: MODULES.FINANCE,
    features: [
      {
        key: 'finance.money',
        label: 'Money in and out',
        blurb: 'Receipts, the cash position, and what is paid to others',
        groups: [
          {
            key: 'finance.payments',
            label: 'Payments',
            permissions: [
              PERMISSIONS.PAYMENT_VIEW,
              PERMISSIONS.PAYMENT_RECORD,
              PERMISSIONS.PAYMENT_DELETE,
            ],
          },
          {
            key: 'finance.cash',
            label: 'Cash',
            permissions: [PERMISSIONS.CASH_DEPOSIT, PERMISSIONS.CASH_POSITION_VIEW],
          },
          {
            key: 'finance.pricing',
            label: 'Pricing',
            permissions: [PERMISSIONS.PRICING_EDIT],
          },
          {
            key: 'finance.payouts',
            // Their own group, as everywhere else in the product: a payout sits
            // beside an order and is never netted off it.
            label: 'Payouts',
            permissions: [PERMISSIONS.DISBURSEMENT_VIEW, PERMISSIONS.DISBURSEMENT_MANAGE],
          },
        ],
      },
      {
        key: 'finance.paper',
        label: 'Invoices and credit notes',
        blurb: 'The paper the shop gives people',
        groups: [
          {
            key: 'finance.invoices',
            label: 'Invoices',
            permissions: [
              PERMISSIONS.INVOICE_VIEW,
              PERMISSIONS.INVOICE_ISSUE,
              PERMISSIONS.INVOICE_CANCEL,
            ],
          },
          {
            key: 'finance.credits',
            label: 'Credit notes',
            permissions: [PERMISSIONS.CREDIT_NOTE_ISSUE],
          },
        ],
      },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    module: MODULES.REPORTS,
    features: [
      {
        key: 'reports.exports',
        label: 'Reports and exports',
        blurb: 'Workbooks for the shop and for its accountant',
        groups: [
          {
            key: 'reports.all',
            // Running one and reading one are separate: downloading the GST
            // summary is not the same privilege as queuing a full-year export.
            label: 'Reports',
            permissions: [PERMISSIONS.REPORT_VIEW, PERMISSIONS.REPORT_RUN],
          },
        ],
      },
    ],
  },
  {
    key: 'expenses',
    label: 'Expenses',
    module: MODULES.EXPENSES,
    features: [
      {
        key: 'expenses.spending',
        label: 'Expenses',
        blurb: 'What the shop spends on itself',
        groups: [
          {
            key: 'expenses.records',
            label: 'Records',
            permissions: [PERMISSIONS.EXPENSE_VIEW, PERMISSIONS.EXPENSE_MANAGE],
          },
          {
            key: 'expenses.setup',
            label: 'Categories and dropdowns',
            permissions: [PERMISSIONS.EXPENSE_CONFIG],
          },
        ],
      },
    ],
  },
  {
    key: 'purchasing',
    label: 'Buying and stock',
    module: MODULES.PURCHASING,
    features: [
      {
        key: 'purchasing.vendors',
        label: 'Vendors',
        blurb: 'Everyone the shop buys from',
        groups: [
          {
            key: 'purchasing.vendor',
            label: 'Vendors',
            permissions: [PERMISSIONS.VENDOR_VIEW, PERMISSIONS.VENDOR_MANAGE],
          },
        ],
      },
      {
        key: 'purchasing.buying',
        label: 'Purchases',
        blurb: 'What was ordered, received and billed',
        groups: [
          {
            key: 'purchasing.orders',
            label: 'Purchase orders',
            permissions: [PERMISSIONS.PURCHASE_VIEW, PERMISSIONS.PURCHASE_MANAGE],
          },
          {
            key: 'purchasing.pay',
            label: 'Paying a bill',
            permissions: [PERMISSIONS.PURCHASE_PAY],
          },
        ],
      },
      {
        key: 'purchasing.stock',
        label: 'Stock and waste',
        blurb: 'What is on the rack, and what was thrown away',
        groups: [
          {
            key: 'purchasing.rack',
            label: 'Stock',
            permissions: [PERMISSIONS.STOCK_VIEW, PERMISSIONS.STOCK_MOVE],
          },
        ],
      },
    ],
  },
  {
    key: 'hr',
    label: 'People',
    module: MODULES.HR,
    features: [
      {
        key: 'hr.employees',
        label: 'Employees',
        blurb: 'Who works here',
        groups: [
          {
            key: 'hr.records',
            label: 'Records',
            permissions: [PERMISSIONS.EMPLOYEE_VIEW, PERMISSIONS.EMPLOYEE_MANAGE],
          },
          {
            key: 'hr.identifiers',
            // Its own group because it is the sensitive one: Aadhaar and PAN
            // are encrypted at rest and seeing them is a decision, not a
            // consequence of being able to edit somebody's name.
            label: 'Aadhaar and PAN',
            permissions: [PERMISSIONS.EMPLOYEE_IDENTIFIERS],
          },
        ],
      },
      {
        key: 'hr.attendance',
        label: 'Attendance',
        blurb: 'Who was in, and for how long',
        groups: [
          {
            key: 'hr.register',
            label: 'The register',
            permissions: [PERMISSIONS.ATTENDANCE_VIEW, PERMISSIONS.ATTENDANCE_MARK],
          },
        ],
      },
      {
        key: 'hr.salary',
        label: 'Salary',
        blurb: 'What people are paid, and advances against it',
        groups: [
          {
            key: 'hr.payroll',
            label: 'Runs and payslips',
            permissions: [PERMISSIONS.SALARY_VIEW, PERMISSIONS.SALARY_MANAGE],
          },
          {
            key: 'hr.paying',
            // Paying is separate from preparing: the person who assembles a
            // run is often not the person who releases the money.
            label: 'Paying a run',
            permissions: [PERMISSIONS.SALARY_PAY],
          },
        ],
      },
    ],
  },
  {
    key: 'workspace',
    label: 'The workspace itself',
    // No module: there is no plan that excludes signing people in or setting
    // the shop up.
    module: null,
    features: [
      {
        key: 'workspace.access',
        label: 'Users and roles',
        blurb: 'Who can sign in, and what each of them may do',
        groups: [
          {
            key: 'workspace.users',
            label: 'Users',
            permissions: [PERMISSIONS.USER_VIEW, PERMISSIONS.USER_MANAGE],
          },
          {
            key: 'workspace.roles',
            // The one that grants every other one. Somebody who can edit roles
            // can give themselves anything on this page.
            label: 'Roles',
            permissions: [PERMISSIONS.ROLE_MANAGE],
          },
        ],
      },
      {
        key: 'workspace.setup',
        label: 'Configuration',
        blurb: 'Materials, sizes, the status flow and GST',
        groups: [
          {
            key: 'workspace.config',
            label: 'Shop settings',
            permissions: [PERMISSIONS.CONFIG_VIEW, PERMISSIONS.CONFIG_MANAGE],
          },
          {
            key: 'workspace.flow',
            label: 'Status flow',
            permissions: [PERMISSIONS.WORKFLOW_MANAGE],
          },
          {
            key: 'workspace.gst',
            label: 'GST slabs',
            permissions: [PERMISSIONS.GST_MANAGE],
          },
        ],
      },
    ],
  },
] as const;

/** Every permission under a group, feature or section. */
export function permissionsUnder(
  node: PermissionSection | PermissionFeatureNode | PermissionGroupNode,
): Permission[] {
  if ('permissions' in node) return [...node.permissions];
  if ('groups' in node) return node.groups.flatMap((group) => group.permissions);
  return node.features.flatMap((feature) => permissionsUnder(feature));
}

export type TickState = 'all' | 'some' | 'none';

/**
 * Whether everything under a branch is held, some of it, or none.
 *
 * Three states rather than two, because a half-ticked branch is the common
 * case and showing it as unticked invites somebody to tick it and silently
 * grant the rest.
 */
export function tickState(permissions: Permission[], held: readonly string[]): TickState {
  if (permissions.length === 0) return 'none';
  const heldSet = new Set(held);
  const count = permissions.filter((permission) => heldSet.has(permission)).length;
  if (count === 0) return 'none';
  return count === permissions.length ? 'all' : 'some';
}

/** Toggling a branch: on unless it is already fully on. */
export function toggleBranch(
  permissions: Permission[],
  held: readonly string[],
): string[] {
  const next = new Set(held);
  if (tickState(permissions, held) === 'all') {
    for (const permission of permissions) next.delete(permission);
  } else {
    for (const permission of permissions) next.add(permission);
  }
  return [...next];
}

/** Every permission the tree accounts for, in the order it is shown. */
export function permissionsInTree(): Permission[] {
  return PERMISSION_TREE.flatMap((section) => permissionsUnder(section));
}
