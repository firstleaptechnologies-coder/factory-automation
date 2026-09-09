import { ALL_MODULES, CORE_MODULES, ModuleKey } from './modules';

/**
 * What a workspace is charged, and why.
 *
 * A tier has one monthly price and covers a set of modules. Anything a client
 * is given beyond their tier is charged at that module's own price, added on.
 * So the bill is a base and a list, and every line says which module it is for
 * — which is the point: a client who asks "what am I paying for Purchasing?"
 * gets a number, not a tier they have to reason about.
 *
 * Three rules are enforced here rather than trusted to whoever fills the price
 * list in:
 *
 *  1. **The core is never a line.** Orders and Clients are what makes this a
 *     product at all; a shop with neither has bought nothing. They are in every
 *     tier and never charged separately.
 *  2. **A module included in the tier is never also charged as an add-on.**
 *     Otherwise moving a module into a tier quietly bills for it twice.
 *  3. **An unpriced add-on is shown, not hidden.** A module granted with no
 *     price is a decision somebody has not made yet, and a bill that silently
 *     omits it is how a client uses something for a year for nothing.
 */

/**
 * Money, to the paisa.
 *
 * Negative zero is normalised away: arithmetic that lands on it is common
 * enough (a change of nothing, a refund of nothing) and "−₹0" on a screen is
 * nonsense.
 */
export function rupees(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

export interface Tier {
  key: string;
  label: string;
  blurb: string;
  /** Charged every month, covering `includedModules`. */
  monthlyPrice: number;
  includedModules: ModuleKey[];
  isActive?: boolean;
}

/** What one module costs when it is not in the tier. */
export type ModulePrices = Partial<Record<ModuleKey, number>>;

export interface BillLine {
  kind: 'tier' | 'module';
  /** The module this line is for, when it is an add-on. */
  module?: ModuleKey;
  label: string;
  amount: number;
  /** True when the module is granted but nobody has priced it. */
  unpriced?: boolean;
}

export interface Bill {
  lines: BillLine[];
  /** Every module the workspace can reach, tier and add-ons together. */
  modules: ModuleKey[];
  /** Add-ons granted with no price set. Never silently dropped. */
  unpriced: ModuleKey[];
  monthlyTotal: number;
}

/**
 * The monthly bill for one workspace.
 *
 * `extras` is what the workspace has been granted on top of its tier — the
 * same additive list the entitlement layer uses, so what is charged and what
 * can be opened cannot drift apart.
 */
export function billFor(
  tier: Tier | undefined,
  extras: string[],
  prices: ModulePrices,
  labels: Partial<Record<ModuleKey, string>> = {},
): Bill {
  const lines: BillLine[] = [];

  const included = new Set<ModuleKey>([...CORE_MODULES, ...(tier?.includedModules ?? [])]);

  if (tier) {
    lines.push({
      kind: 'tier',
      label: tier.label,
      amount: rupees(Math.max(0, tier.monthlyPrice)),
    });
  }

  const unpriced: ModuleKey[] = [];

  // Charged in catalogue order, so two bills for the same modules read the
  // same way whatever order somebody happened to tick them in.
  const addOns = ALL_MODULES.filter(
    (module) => extras.includes(module) && !included.has(module),
  );

  for (const module of addOns) {
    const price = prices[module];
    if (price === undefined || price === null) {
      unpriced.push(module);
      lines.push({
        kind: 'module',
        module,
        label: labels[module] ?? module,
        amount: 0,
        unpriced: true,
      });
      continue;
    }
    lines.push({
      kind: 'module',
      module,
      label: labels[module] ?? module,
      amount: rupees(Math.max(0, price)),
    });
  }

  const modules = ALL_MODULES.filter(
    (module) => included.has(module) || addOns.includes(module),
  );

  return {
    lines,
    modules,
    unpriced,
    monthlyTotal: rupees(lines.reduce((sum, line) => sum + line.amount, 0)),
  };
}

/**
 * What the whole book is worth a month.
 *
 * Only workspaces that are actually paying. A trial and a suspended workspace
 * are both worth nothing this month, and counting either is how a revenue
 * figure stops being one.
 */
export function monthlyRecurring(
  bills: { status: string; monthlyTotal: number }[],
): { active: number; total: number } {
  const paying = bills.filter((bill) => bill.status === 'ACTIVE');
  return {
    active: paying.length,
    total: rupees(paying.reduce((sum, bill) => sum + bill.monthlyTotal, 0)),
  };
}

/**
 * Moving a module into a tier, as a price change rather than a surprise.
 *
 * What it costs is what the clients *on that tier* stop paying, and only the
 * ones actually being charged for it. Two things this must not do, both of
 * which overstate the loss:
 *
 *  - Count a client whose tier already includes the module. They pay nothing
 *    extra for it, so including it elsewhere changes nothing for them.
 *  - Count a client on a different tier. Changing what Shop contains cannot
 *    affect somebody on Punch.
 *
 * So the caller passes the workspaces on the tier being edited, described by
 * the add-ons they are actually billed for — not by everything they can reach.
 */
export function effectOfIncluding(
  module: ModuleKey,
  workspacesOnThisTier: { billedAddOns: string[] }[],
  prices: ModulePrices,
): { affected: number; monthlyChange: number } {
  const price = prices[module] ?? 0;
  const affected = workspacesOnThisTier.filter((w) => w.billedAddOns.includes(module)).length;
  return { affected, monthlyChange: rupees(-price * affected) };
}
