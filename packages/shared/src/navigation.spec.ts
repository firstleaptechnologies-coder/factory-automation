import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NAV_GROUPS,
  NAV_HOME,
  NAV_OUTSIDE,
  allNavItems,
  navAppRoutes,
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
      'Vendor management',
      'Workspace',
    ]);
  });

  it('keeps a module’s own settings inside that module', () => {
    const orders = NAV_GROUPS.find((group) => group.key === 'orders')!;
    expect(orders.groups?.map((inner) => inner.label)).toEqual(['Order settings']);
  });

  it('leaves signing in and the platform outside every category', () => {
    expect(NAV_OUTSIDE.map((item) => item.key)).toEqual(['login', 'platform-tenants']);
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
