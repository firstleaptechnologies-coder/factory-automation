import { PERMISSIONS, type Permission } from './permissions';

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
        label: 'Punch order',
        icon: 'plus',
        permission: PERMISSIONS.ORDER_PUNCH,
        web: '/punch',
        app: 'PunchTab',
      },
      {
        key: 'orders',
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
              { key: 'order-photos', label: 'Photos', icon: 'camera', app: 'OrderPhotos' },
            ],
          },
        ],
      },
      {
        key: 'leads',
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
        label: 'Transactions',
        icon: 'card',
        permission: PERMISSIONS.CASH_POSITION_VIEW,
        web: '/transactions',
        app: 'Transactions',
      },
      {
        key: 'payouts',
        label: 'Payout ledger',
        icon: 'arrowUpRight',
        permission: PERMISSIONS.DISBURSEMENT_VIEW,
        web: '/disbursements',
        app: 'DisbursementLedger',
      },
    ],
  },
  {
    key: 'vendors',
    label: 'Vendor management',
    blurb: 'Everyone the shop deals with',
    items: [
      {
        key: 'clients',
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
