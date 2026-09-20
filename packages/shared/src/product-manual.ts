import type { ModuleKey } from './modules';

/**
 * The product manual: what has been built, module by module, in the words of
 * the people who use it.
 *
 * Generated, never hand-maintained. A hand-written manual for a product that
 * ships daily is wrong by its second release, and a manual that is wrong is
 * worse than none — it is consulted exactly when somebody is unsure, and it
 * confirms whatever it says. The same reasoning as docs/NAVIGATION.md and the
 * release-flow page, applied to the whole product.
 *
 * Two halves, and the split is the point:
 *
 *   **Structure is derived.** Which modules exist, which screens belong to
 *   each, which routes those screens call, and what each route accepts — all
 *   read off the code that actually runs. It cannot be stale, because nothing
 *   writes it down twice.
 *
 *   **Meaning is authored**, in the doc comment next to the thing it
 *   describes. What a field is *for* cannot be derived from its type: nothing
 *   about `gstin?: string` says that it decides whether a bill shows CGST and
 *   SGST or a single IGST line. That sentence has to be written by somebody
 *   who knows, and it belongs beside the field so it is changed in the same
 *   edit as the field.
 *
 * `product-manual.spec.ts` fails when a field users type into has no
 * explanation, so the manual cannot fall behind the product: a new field ships
 * with its definition or it does not ship.
 */

/** Who a piece of the product belongs to. */
export type Audience =
  /** A shop: Decor Bucket, FLT. What they buy and what their people use. */
  | 'workspace'
  /** FirstLeap. The console above every shop — never sold, never shipped. */
  | 'platform';

/** One thing somebody types, and what it means. */
export interface ManualField {
  name: string;
  /** As the API validates it — string, number, boolean, date, enum. */
  type: string;
  required: boolean;
  /**
   * What it is for, in the words of somebody who uses it. Empty when nobody
   * has written it yet, which is what the coverage spec fails on.
   */
  definition: string;
  /** Limits the API enforces: a minimum length, a range, the allowed values. */
  constraints: string[];
}

/** One thing the software can be asked to do. */
export interface ManualAction {
  /** `POST /orders`, as the API serves it. */
  method: string;
  path: string;
  /** The handler's own name, which is usually the verb people use. */
  handler: string;
  /** What it does, from the doc comment on the route. */
  summary: string;
  /** Who may ask for it. Empty means anybody signed in. */
  permissions: string[];
  /** What the caller sends. */
  fields: ManualField[];
}

/** One screen, on whichever client serves it. */
export interface ManualScreen {
  key: string;
  label: string;
  /** What it is for, from the navigation tree's own description. */
  blurb: string;
  web: string | null;
  app: string | null;
  permission: string | null;
}

/** One module: a thing a shop buys, or a part of the console. */
export interface ManualModule {
  key: string;
  label: string;
  audience: Audience;
  /** What it is for and who uses it. */
  summary: string;
  /** How work moves through it, step by step. */
  flow: string[];
  /** Whether a shop can buy it, or it comes with every workspace. */
  sold: boolean;
  screens: ManualScreen[];
  actions: ManualAction[];
  permissions: { key: string; label: string }[];
}

export interface ProductManual {
  /** When it was generated, so a printed copy can be dated. */
  generatedAt: string;
  modules: ManualModule[];
}

/** Everything a shop could be sold, in the order it is used. */
export const workspaceModules = (manual: ProductManual): ManualModule[] =>
  manual.modules.filter((m) => m.audience === 'workspace');

/** The console above the shops — ours, and never exported to a vendor. */
export const platformModules = (manual: ProductManual): ManualModule[] =>
  manual.modules.filter((m) => m.audience === 'platform');

/**
 * The fields nobody has explained yet.
 *
 * What the coverage spec fails on, and what the manual screen shows the owner
 * so the gap is visible rather than quietly absent.
 */
export function undefinedFields(
  manual: ProductManual,
): { module: string; action: string; field: string }[] {
  const out: { module: string; action: string; field: string }[] = [];
  for (const module of manual.modules) {
    for (const action of module.actions) {
      for (const field of action.fields) {
        if (!field.definition.trim()) {
          out.push({
            module: module.key,
            action: `${action.method} ${action.path}`,
            field: field.name,
          });
        }
      }
    }
  }
  return out;
}

/**
 * A manual cut down to the modules one vendor actually bought.
 *
 * A shop that did not buy Purchasing should not be handed thirty pages about
 * it: they will either try to use it or ask why it is missing, and both are
 * our doing. The console is never included — what FirstLeap does above a shop
 * is not a shop's business.
 */
export function manualFor(manual: ProductManual, modules: string[]): ProductManual {
  const wanted = new Set(modules);
  return {
    ...manual,
    modules: manual.modules.filter((m) => m.audience === 'workspace' && wanted.has(m.key)),
  };
}

/** The modules a workspace on this plan would be handed. */
export const modulesForPlan = (manual: ProductManual, bought: ModuleKey[]): string[] =>
  workspaceModules(manual)
    .filter((m) => !m.sold || bought.includes(m.key as ModuleKey))
    .map((m) => m.key);
