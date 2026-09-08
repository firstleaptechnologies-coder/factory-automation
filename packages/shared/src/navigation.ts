import { PERMISSIONS, type Permission } from './permissions';
import { MODULES, type ModuleKey } from './modules';

/**
 * Where everything lives, once, for both clients and the documentation.
 *
 * The product is one module today and will be several: the menu is grouped by
 * what a screen is *for* rather than by which of them happened to exist first,
 * so a new screen has an obvious home and nobody has to redesign the navigation
 * to add one.
 *
 * Written down here rather than in each client because the two drifted: the
 * sidebar and the app's menu disagreed about what existed and what it was
 * called. A specification test walks every registered route on both platforms
 * and fails when one is missing from this tree, which is what stops a screen
 * being shipped that nobody can find.
 */

export interface NavItem {
  /** Stable across renames; the tests and the docs key on it. */
  key: string;
  label: string;
  /** A name from each client's own icon set. */
  icon: string;
  /** Everything under a group needs the same permission to be worth showing. */
  permission?: Permission;
  /**
   * What the workspace must have bought for this to exist for them.
   *
   * Two gates, not one: a shop that has not bought quotes should not see the
   * screen at all, and a shop that has should still only let the right people
   * into it.
   */
  module?: ModuleKey;
  /** Where the web serves it. Absent when the screen is app-only. */
  web?: string;
  /** The app's route name. Absent when the screen is web-only. */
  app?: string;
  /**
   * Reached from this screen rather than from the menu — a board, an archive,
   * a detail. They are part of the flow and not part of the list.
   */
  children?: NavItem[];
}

export interface NavGroup {
  key: string;
  label: string;
  /** What the group is for, shown under its heading. */
  blurb?: string;
  items: NavItem[];
  /** A group inside a group: settings that belong to their own module. */
  groups?: NavGroup[];
}

/** The one screen that sits outside every category. */
export const NAV_HOME: NavItem = {
  key: 'home',
  label: 'Home',
  icon: 'home',
  web: '/',
  app: 'Home',
  children: [
    {
      key: 'notifications',
      label: 'Notifications',
      icon: 'bell',
      web: '/notifications',
      app: 'Notifications',
    },
    { key: 'search', label: 'Search', icon: 'search', app: 'Search' },
  ],
};

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'orders',
    label: 'Order management',
    blurb: 'Taking work in and moving it along',
    items: [
      {
        key: 'punch',
        module: MODULES.ORDERS,
        label: 'Punch order',
        icon: 'plus',
        permission: PERMISSIONS.ORDER_PUNCH,
        web: '/punch',
        app: 'PunchTab',
      },
      {
        key: 'orders',
        module: MODULES.ORDERS,
        label: 'Orders',
        icon: 'clipboard',
        permission: PERMISSIONS.ORDER_VIEW,
        web: '/orders',
        app: 'Orders',
        children: [
          { key: 'order-board', label: 'Board', icon: 'layers', web: '/board', app: 'Board' },
          {
            key: 'order-detail',
            label: 'One order',
            icon: 'clipboard',
            web: '/orders/[id]',
            app: 'OrderDetail',
            children: [
              {
                key: 'order-payments',
                label: 'Payments',
                icon: 'card',
                web: '/orders/[id]/payments',
                app: 'Payments',
              },
              {
                key: 'order-payouts',
                label: 'Payouts on this order',
                icon: 'arrowUpRight',
                web: '/orders/[id]/disbursements',
                app: 'Disbursements',
              },
              {
                key: 'order-invoice',
                label: 'Invoice and challans',
                icon: 'receipt',
                web: '/orders/[id]/invoice',
                app: 'OrderInvoice',
              },
              { key: 'order-photos', label: 'Photos', icon: 'camera', app: 'OrderPhotos' },
            ],
          },
        ],
      },
      {
        key: 'leads',
        module: MODULES.LEADS,
        label: 'Leads',
        icon: 'trend',
        permission: PERMISSIONS.LEAD_VIEW,
        web: '/leads',
        app: 'Leads',
        children: [
          {
            key: 'lead-board',
            label: 'Board',
            icon: 'layers',
            web: '/leads/board',
            app: 'LeadBoard',
          },
          {
            key: 'lead-archive',
            label: 'Archived',
            icon: 'history',
            web: '/leads/archived',
            app: 'ArchivedLeads',
          },
          { key: 'lead-new', label: 'New lead', icon: 'plus', app: 'LeadCreate' },
          {
            key: 'lead-detail',
            label: 'One enquiry',
            icon: 'trend',
            web: '/leads/[id]',
            app: 'LeadDetail',
            children: [
              {
                key: 'lead-convert',
                label: 'Convert to an order',
                icon: 'arrowUpRight',
                app: 'LeadConvert',
              },
            ],
          },
        ],
      },
      {
        key: 'quotes',
        module: MODULES.QUOTES,
        label: 'Quotes',
        icon: 'tag',
        permission: PERMISSIONS.ESTIMATE_VIEW,
        web: '/quotes',
        app: 'Estimates',
        children: [
          { key: 'quote-new', label: 'New quote', icon: 'plus', web: '/quotes/new', app: 'EstimateEdit' },
          {
            key: 'quote-detail',
            label: 'One quote',
            icon: 'tag',
            web: '/quotes/[id]',
            app: 'EstimateDetail',
          },
        ],
      },
    ],
    groups: [
      {
        key: 'order-settings',
        label: 'Order settings',
        blurb: 'What punching offers, and the journey work follows',
        items: [
          {
            key: 'materials',
            label: 'Materials',
            icon: 'layers',
            permission: PERMISSIONS.CONFIG_VIEW,
            web: '/admin/materials',
            app: 'AdminMaterials',
          },
          {
            key: 'sizes',
            label: 'Sizes',
            icon: 'ruler',
            permission: PERMISSIONS.CONFIG_VIEW,
            web: '/admin/sizes',
            app: 'AdminSizes',
          },
          {
            key: 'flow',
            label: 'Status flow',
            icon: 'flow',
            permission: PERMISSIONS.CONFIG_VIEW,
            web: '/admin/flow',
            app: 'AdminFlow',
            children: [
              { key: 'flow-canvas', label: 'Flow builder', icon: 'flow', app: 'FlowCanvas' },
              {
                key: 'main-card',
                label: 'Main card',
                icon: 'tune',
                web: '/admin/main-card',
                app: 'MainCard',
              },
            ],
          },
          {
            key: 'lead-fields',
            label: 'Lead fields',
            icon: 'tune',
            permission: PERMISSIONS.CONFIG_VIEW,
            web: '/admin/lead-fields',
            app: 'AdminLeadFields',
          },
        ],
      },
    ],
  },
  {
    key: 'finances',
    label: 'Finances',
    blurb: 'Money in, money out, and where it is sitting',
    items: [
      {
        key: 'transactions',
        module: MODULES.FINANCE,
        label: 'Transactions',
        icon: 'card',
        permission: PERMISSIONS.CASH_POSITION_VIEW,
        web: '/transactions',
        app: 'Transactions',
      },
      {
        key: 'payouts',
        module: MODULES.FINANCE,
        label: 'Payout ledger',
        icon: 'arrowUpRight',
        permission: PERMISSIONS.DISBURSEMENT_VIEW,
        web: '/disbursements',
        app: 'DisbursementLedger',
      },
      {
        key: 'invoices',
        module: MODULES.FINANCE,
        label: 'Invoices',
        icon: 'receipt',
        permission: PERMISSIONS.INVOICE_VIEW,
        web: '/invoices',
        app: 'Invoices',
        children: [
          {
            key: 'invoice-detail',
            label: 'One invoice',
            icon: 'receipt',
            web: '/invoices/[id]',
            app: 'InvoiceDetail',
          },
        ],
      },
      {
        key: 'expenses',
        module: MODULES.EXPENSES,
        label: 'Expenses',
        icon: 'receipt',
        permission: PERMISSIONS.EXPENSE_VIEW,
        web: '/expenses',
        app: 'Expenses',
        children: [
          {
            key: 'expense-form',
            label: 'Record an expense',
            icon: 'plus',
            web: '/expenses/new',
            app: 'ExpenseForm',
          },
          {
            key: 'expense-detail',
            label: 'One expense',
            icon: 'receipt',
            web: '/expenses/[id]',
            app: 'ExpenseDetail',
          },
          {
            key: 'expense-analytics',
            label: 'Where the money went',
            icon: 'trend',
            web: '/expenses/analytics',
            app: 'ExpenseAnalytics',
          },
          {
            key: 'expense-options',
            label: 'Expense dropdowns',
            icon: 'tune',
            permission: PERMISSIONS.EXPENSE_CONFIG,
            web: '/admin/expense-options',
            app: 'AdminExpenseOptions',
          },
        ],
      },
    ],
  },
  {
    key: 'people',
    label: 'People',
    blurb: 'Who works here, and what they are paid',
    items: [
      {
        key: 'employees',
        module: MODULES.HR,
        label: 'Employees',
        icon: 'users',
        permission: PERMISSIONS.EMPLOYEE_VIEW,
        web: '/employees',
        app: 'Employees',
        children: [
          {
            key: 'employee-form',
            label: 'Add an employee',
            icon: 'plus',
            permission: PERMISSIONS.EMPLOYEE_MANAGE,
            web: '/employees/new',
            app: 'EmployeeForm',
          },
          {
            key: 'employee-detail',
            label: 'One employee',
            icon: 'user',
            web: '/employees/[id]',
            app: 'EmployeeDetail',
            children: [
              {
                key: 'employee-letters',
                label: 'Their letters',
                icon: 'clipboard',
                web: '/employees/[id]/letters',
                app: 'EmployeeLetters',
              },
            ],
          },
          {
            key: 'letter-templates',
            label: 'Letter templates',
            icon: 'tune',
            permission: PERMISSIONS.EMPLOYEE_MANAGE,
            web: '/admin/letter-templates',
            app: 'AdminLetterTemplates',
          },
        ],
      },
      {
        key: 'salary',
        module: MODULES.HR,
        label: 'Salary',
        icon: 'card',
        permission: PERMISSIONS.SALARY_VIEW,
        web: '/salary',
        app: 'Salary',
        children: [
          {
            key: 'salary-run',
            label: 'One month',
            icon: 'clipboard',
            web: '/salary/[id]',
            app: 'SalaryRun',
          },
          {
            key: 'salary-pay',
            label: 'How people are paid',
            icon: 'tune',
            permission: PERMISSIONS.SALARY_MANAGE,
            web: '/salary/structures',
            app: 'PayStructures',
          },
          {
            key: 'salary-advances',
            label: 'Advances',
            icon: 'arrowUpRight',
            permission: PERMISSIONS.SALARY_MANAGE,
            web: '/salary/advances',
            app: 'SalaryAdvances',
          },
        ],
      },
      {
        key: 'attendance',
        module: MODULES.HR,
        label: 'Attendance',
        icon: 'check',
        permission: PERMISSIONS.ATTENDANCE_VIEW,
        web: '/attendance',
        app: 'Attendance',
        children: [
          {
            key: 'attendance-month',
            label: 'The month, per person',
            icon: 'history',
            web: '/attendance/month',
            app: 'AttendanceMonth',
          },
        ],
      },
    ],
  },
  {
    key: 'vendors',
    label: 'Vendor management',
    blurb: 'Everyone the shop deals with',
    items: [
      {
        key: 'vendor-list',
        module: MODULES.PURCHASING,
        label: 'Vendors',
        icon: 'box',
        permission: PERMISSIONS.VENDOR_VIEW,
        web: '/vendors',
        app: 'Vendors',
        children: [
          {
            /*
             * Web only. The app writes a vendor on the same screen it reads
             * one — there is not enough to a vendor to justify two — so it has
             * no separate route to name here.
             */
            key: 'vendor-new',
            label: 'Add a vendor',
            icon: 'plus',
            permission: PERMISSIONS.VENDOR_MANAGE,
            web: '/vendors/new',
          },
          {
            key: 'vendor-detail',
            label: 'One vendor',
            icon: 'box',
            web: '/vendors/[id]',
            app: 'VendorDetail',
          },
        ],
      },
      {
        key: 'purchases',
        module: MODULES.PURCHASING,
        label: 'Purchases',
        icon: 'clipboard',
        permission: PERMISSIONS.PURCHASE_VIEW,
        web: '/purchases',
        app: 'Purchases',
        children: [
          {
            key: 'purchase-new',
            label: 'New order',
            icon: 'plus',
            permission: PERMISSIONS.PURCHASE_MANAGE,
            web: '/purchases/new',
            app: 'PurchaseEdit',
          },
          {
            key: 'purchase-detail',
            label: 'One purchase',
            icon: 'clipboard',
            web: '/purchases/[id]',
            app: 'PurchaseDetail',
          },
        ],
      },
      {
        key: 'stock',
        module: MODULES.PURCHASING,
        label: 'Stock',
        icon: 'layers',
        permission: PERMISSIONS.STOCK_VIEW,
        web: '/stock',
        app: 'Stock',
        children: [
          {
            key: 'stock-material',
            label: 'One material’s moves',
            icon: 'history',
            web: '/stock/[materialId]',
            app: 'StockMoves',
          },
          {
            key: 'stock-waste',
            label: 'Waste',
            icon: 'trend',
            web: '/stock/waste',
            app: 'Waste',
          },
        ],
      },
      {
        key: 'clients',
        module: MODULES.CLIENTS,
        label: 'Clients',
        icon: 'users',
        permission: PERMISSIONS.CLIENT_VIEW,
        web: '/clients',
        app: 'Clients',
        children: [
          {
            key: 'client-detail',
            label: 'One client',
            icon: 'users',
            web: '/clients/[id]',
            app: 'ClientDetail',
            children: [
              {
                key: 'client-firm',
                label: 'Billing details',
                icon: 'clipboard',
                web: '/clients/[id]/firm',
                app: 'ClientFirm',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'workspace',
    label: 'Workspace',
    blurb: 'The shop itself, and this device',
    items: [
      {
        key: 'firm',
        label: 'Firm details',
        icon: 'clipboard',
        permission: PERMISSIONS.CONFIG_VIEW,
        web: '/admin/firm',
        app: 'FirmProfile',
      },
      {
        key: 'roles',
        label: 'Roles and people',
        icon: 'users',
        permission: PERMISSIONS.USER_VIEW,
        web: '/admin/roles',
        app: 'AdminRoles',
      },
      { key: 'settings', label: 'Settings', icon: 'settings', app: 'Settings' },
    ],
  },
];

/**
 * Screens that belong to nobody's menu.
 *
 * Signing in happens before there is a menu, and the platform screens belong to
 * whoever runs the product rather than to a shop.
 */
export const NAV_OUTSIDE: NavItem[] = [
  { key: 'login', label: 'Sign in', icon: 'user', web: '/login', app: 'Login' },
  {
    key: 'platform-tenants',
    label: 'Workspaces',
    icon: 'box',
    permission: PERMISSIONS.PLATFORM_TENANT_VIEW,
    web: '/platform/tenants',
    app: 'Tenants',
  },
  {
    /*
     * What the app is running, and who has it yet.
     *
     * There is one app in the stores for every workspace, so this belongs to
     * whoever owns the product — a shop's admin decides how their shop works,
     * not what code the phone in their hand is running.
     */
    key: 'platform-releases',
    label: 'Releases',
    icon: 'box',
    permission: PERMISSIONS.PLATFORM_RELEASE_VIEW,
    web: '/platform/releases',
  },
];

/** Every item in the tree, groups and children flattened out. */
export function allNavItems(): NavItem[] {
  const out: NavItem[] = [];
  const walk = (items: NavItem[]) => {
    for (const item of items) {
      out.push(item);
      if (item.children) walk(item.children);
    }
  };
  const walkGroup = (group: NavGroup) => {
    walk(group.items);
    group.groups?.forEach(walkGroup);
  };

  walk([NAV_HOME]);
  NAV_GROUPS.forEach(walkGroup);
  walk(NAV_OUTSIDE);
  return out;
}

/** Every app route name the tree knows about. */
export function navAppRoutes(): string[] {
  return allNavItems()
    .map((item) => item.app)
    .filter((route): route is string => Boolean(route));
}

/** Every web path the tree knows about, as Next.js writes them. */
export function navWebPaths(): string[] {
  return allNavItems()
    .map((item) => item.web)
    .filter((path): path is string => Boolean(path));
}
