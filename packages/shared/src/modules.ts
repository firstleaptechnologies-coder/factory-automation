/**
 * What a workspace has bought.
 *
 * The product is one module today and will be several. A four-machine shop
 * buying order punching should not be paying for payroll, and should not be
 * looking at a menu full of screens they cannot open — so a screen is reachable
 * when the workspace's plan includes its module *and* the person's role holds
 * its permission. Two independent gates: the plan decides what the business
 * bought, the role decides who inside it may touch it.
 *
 * Written down before the modules that need it exist, because retrofitting this
 * across finished features is worse than the features themselves.
 */

export const MODULES = {
  /** Punching, orders, the boards, the status flow. The reason to buy this. */
  ORDERS: 'orders',
  /** Enquiries and the pipeline they move through. */
  LEADS: 'leads',
  /** Priced quotations, before there is an order. */
  QUOTES: 'quotes',
  /** Payments, the cash position, the payout ledger. */
  FINANCE: 'finance',
  /** Clients, their sites and their billing details. */
  CLIENTS: 'clients',

  /** What the shop spends on itself, and the ledger it posts to. */
  EXPENSES: 'expenses',

  /** Employees, attendance and what they are paid. */
  HR: 'hr',

  /** Vendors, what was bought, what is on the rack and what was wasted. */
  PURCHASING: 'purchasing',

  // Not built yet. Named here so the plans they belong to can be sold, and so
  // nothing has to be renamed when they arrive.
  REPORTS: 'reports',
  ANALYTICS: 'analytics',
  AI: 'ai',
} as const;

export type ModuleKey = (typeof MODULES)[keyof typeof MODULES];

export const ALL_MODULES: ModuleKey[] = Object.values(MODULES);

/**
 * What every workspace has, whatever they pay.
 *
 * A shop with no orders and no clients has bought nothing at all, so these are
 * never a line on an invoice and never something to switch off.
 */
export const CORE_MODULES: ModuleKey[] = [MODULES.ORDERS, MODULES.CLIENTS];

export interface Module {
  key: ModuleKey;
  label: string;
  blurb: string;
  /** True while it is named but not built. */
  comingSoon?: boolean;
}

export const MODULE_CATALOGUE: Module[] = [
  { key: MODULES.ORDERS, label: 'Orders', blurb: 'Punching, the boards and the status flow' },
  { key: MODULES.CLIENTS, label: 'Clients', blurb: 'Who the shop works for, and their billing details' },
  { key: MODULES.LEADS, label: 'Leads', blurb: 'Enquiries, and the pipeline they move through' },
  { key: MODULES.QUOTES, label: 'Quotes', blurb: 'Priced quotations, before there is an order' },
  { key: MODULES.FINANCE, label: 'Finances', blurb: 'Payments, the cash position and the payout ledger' },
  { key: MODULES.EXPENSES, label: 'Expenses', blurb: 'What the shop spends, and on what' },
  { key: MODULES.PURCHASING, label: 'Purchasing', blurb: 'Vendors, purchase orders, stock and waste' },
  { key: MODULES.HR, label: 'People', blurb: 'Employees, attendance and salary' },
  { key: MODULES.REPORTS, label: 'Reports', blurb: 'Exports for the shop and for its accountant', comingSoon: true },
  { key: MODULES.ANALYTICS, label: 'Analytics', blurb: 'Cycle times, conversion and what is stuck', comingSoon: true },
  { key: MODULES.AI, label: 'AI', blurb: 'Drafting orders and quotes from what arrives', comingSoon: true },
];

export interface Plan {
  key: string;
  label: string;
  blurb: string;
  modules: ModuleKey[];
}

/**
 * What is sold, as a few named bundles rather than a checkbox per module.
 *
 * A tenant can still be given a module their plan does not include — a shop
 * that wants one thing from the next tier up should not have to buy the tier —
 * but that is an exception recorded against them, not a price list of its own.
 */
export const PLANS: Plan[] = [
  {
    key: 'punch',
    label: 'Punch',
    blurb: 'Take orders and move them through the shop',
    modules: [...CORE_MODULES],
  },
  {
    key: 'shop',
    label: 'Shop',
    blurb: 'Punching, the money on it, and where the work comes from',
    modules: [...CORE_MODULES, MODULES.LEADS, MODULES.QUOTES, MODULES.FINANCE],
  },
  {
    key: 'works',
    label: 'Works',
    blurb: 'The whole product, as it grows',
    modules: [...ALL_MODULES],
  },
];

export const DEFAULT_PLAN = 'shop';

/**
 * The keys a plan may actually have.
 *
 * Exported so a write can be refused rather than accepted and then quietly
 * resolved by `planFor` below — which is how `standard` sat on a workspace for
 * a year, granting the default plan's modules while matching no tier and
 * therefore costing nothing.
 */
export const PLAN_KEYS: string[] = PLANS.map((plan) => plan.key);

/**
 * The plan for a key, falling back to the default for anything unrecognised.
 *
 * Lenient on purpose: this resolves a menu and a set of guards on every
 * request, and a workspace whose plan key is wrong should see a default
 * product rather than no product. The strictness belongs on the write —
 * see `PLAN_KEYS`.
 */
export function planFor(key?: string | null): Plan {
  return PLANS.find((plan) => plan.key === key) ?? PLANS.find((plan) => plan.key === DEFAULT_PLAN)!;
}

/**
 * What a workspace can actually reach.
 *
 * The plan, plus anything granted to them on top of it, plus the core — which
 * no plan can be without. Extras are additive only: taking a module away from a
 * shop that is using it is a conversation, not a checkbox.
 */
export function modulesFor(plan?: string | null, extras: string[] = []): ModuleKey[] {
  return modulesForTier(planFor(plan).modules, extras);
}

/**
 * The same question, asked of a tier that was written rather than compiled.
 *
 * `PLANS` above is the seed — three bundles that existed before there was
 * anywhere to keep them. The tiers are rows now, and the owner writes them:
 * new ones, renamed ones, different modules in them. So what a workspace can
 * reach has to come from the row, or editing a tier changes the invoice and
 * nothing else, which is exactly the shape of a screen that looks like it
 * controls the product and does not.
 *
 * The core is added whatever the tier says. A tier with no orders in it is a
 * workspace that cannot take an order, which is not a product anyone sold.
 */
export function modulesForTier(
  includedModules: readonly string[],
  extras: readonly string[] = [],
): ModuleKey[] {
  const granted = new Set<ModuleKey>(CORE_MODULES);
  for (const one of [...includedModules, ...extras]) {
    if ((ALL_MODULES as string[]).includes(one)) granted.add(one as ModuleKey);
  }
  return ALL_MODULES.filter((module) => granted.has(module));
}

/**
 * Does this workspace have it?
 *
 * A workspace whose modules have not been resolved — an older response, a
 * platform admin, a client that has not signed in yet — is treated as having
 * everything. This gates a menu, not access: the API refuses the route either
 * way, and a blank product is a worse failure than a screen that says no.
 */
export function hasModule(modules: string[] | undefined, key: ModuleKey): boolean {
  if (!modules) return true;
  return modules.includes(key);
}
