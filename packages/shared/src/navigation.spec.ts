import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_MODULES, MODULES } from './modules';
import {
  NAV_GROUPS,
  PLATFORM_NAV,
  NAV_HOME,
  NAV_OUTSIDE,
  allNavItems,
  navAppRoutes,
  navChildren,
  navWebPaths,
} from './navigation';
import { navigationMarkdown } from './navigation-doc';

describe('the navigation tree', () => {
  it('gives every item a key of its own', () => {
    const keys = allNavItems().map((item) => item.key);
    // The tests and the docs key on these; a duplicate would quietly hide one.
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every route to exactly one item', () => {
    const app = navAppRoutes();
    const web = navWebPaths();
    expect(new Set(app).size).toBe(app.length);
    expect(new Set(web).size).toBe(web.length);
  });

  it('puts every item somewhere a client can render it', () => {
    // An item with neither route is a category heading pretending to be a
    // screen.
    for (const item of allNavItems()) {
      expect(Boolean(item.web || item.app)).toBe(true);
    }
  });

  it('keeps Home out of the categories', () => {
    const inGroups = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.key));
    expect(inGroups).not.toContain(NAV_HOME.key);
  });

  it('carries the categories the shop asked for', () => {
    expect(NAV_GROUPS.map((group) => group.label)).toEqual([
      'Order management',
      'Finances',
      'People',
      'Vendor management',
      'Workspace',
    ]);
  });

  it('keeps a module’s own settings inside that module', () => {
    const orders = NAV_GROUPS.find((group) => group.key === 'orders')!;
    expect(orders.groups?.map((inner) => inner.label)).toEqual(['Order settings']);
  });

  // Only the screen you reach before there is a menu at all.
  it('leaves signing in outside every category', () => {
    expect(NAV_OUTSIDE.map((item) => item.key)).toEqual(['login']);
  });

  /*
   * FirstLeap's console is its own tree, not a corner of the shop's menu.
   * Nothing in it is gated by a module — a client's plan cannot decide what we
   * may see about them — and every screen in it needs a platform permission,
   * which no tenant role can hold.
   */
  it('gates the whole platform console on a platform permission', () => {
    for (const group of PLATFORM_NAV) {
      for (const item of group.items) {
        expect(item.permission).toMatch(/^platform\./);
        expect(item.module).toBeUndefined();
      }
    }
  });

  it('groups the console by what a question is about', () => {
    expect(PLATFORM_NAV.map((group) => group.key)).toEqual([
      'platform-business',
      'platform-commercial',
      'platform-us',
    ]);
  });
});

describe('docs/NAVIGATION.md', () => {
  const committed = readFileSync(join(__dirname, '../../../docs/NAVIGATION.md'), 'utf8');

  it('says what the tree actually says', () => {
    // A map that lies is worse than no map. Run `npm run docs:nav` in
    // packages/shared after changing the tree.
    expect(committed).toBe(navigationMarkdown());
  });

  it('draws the flow rather than only listing it', () => {
    expect(committed).toContain('```mermaid');
    expect(committed).toContain('flowchart LR');
  });

  it('names every screen the tree knows about', () => {
    for (const item of allNavItems()) {
      expect(committed).toContain(item.label);
    }
  });
});

describe('what a plan reaches', () => {
  it('marks the screens that are sold separately', () => {
    const byKey = new Map(allNavItems().map((item) => [item.key, item]));
    expect(byKey.get('leads')?.module).toBe(MODULES.LEADS);
    expect(byKey.get('quotes')?.module).toBe(MODULES.QUOTES);
    expect(byKey.get('transactions')?.module).toBe(MODULES.FINANCE);
    expect(byKey.get('payouts')?.module).toBe(MODULES.FINANCE);
    expect(byKey.get('clients')?.module).toBe(MODULES.CLIENTS);
  });

  it('leaves the shop’s own settings inside no plan', () => {
    const byKey = new Map(allNavItems().map((item) => [item.key, item]));
    // Materials, sizes and the status flow are how the product is set up, not
    // something sold beside it.
    expect(byKey.get('materials')?.module).toBeUndefined();
    expect(byKey.get('flow')?.module).toBeUndefined();
    expect(byKey.get('settings')?.module).toBeUndefined();
  });

  it('names only real modules', () => {
    for (const item of allNavItems()) {
      if (item.module) expect(ALL_MODULES).toContain(item.module);
    }
  });
});

/*
 * The pairs both clients check their own source against. If this walks the
 * tree wrongly, two rails go quiet at once.
 */
describe('navChildren', () => {
  const links = navChildren();

  it('pairs each child with the screen it hangs off', () => {
    const orders = links.find((link) => link.child.key === 'order-detail');
    expect(orders?.parent.key).toBe('orders');
  });

  it('reaches children of children, not just the first level', () => {
    // Converting an enquiry is reached from one enquiry, which is itself
    // reached from the list.
    const convert = links.find((link) => link.child.key === 'lead-convert');
    expect(convert?.parent.key).toBe('lead-detail');
  });

  it('covers the platform console and the screens outside the menu too', () => {
    const parents = new Set(links.map((link) => link.parent.key));
    expect(parents.has('home')).toBe(true);
  });

  it('is every child in the tree and nothing else', () => {
    const expected = allNavItems().flatMap((item) =>
      (item.children ?? []).map((child) => child.key),
    );

    expect(links.map((link) => link.child.key).sort()).toEqual(expected.sort());
  });

  it('names no item as its own parent', () => {
    expect(links.filter((link) => link.parent.key === link.child.key)).toEqual([]);
  });
});
