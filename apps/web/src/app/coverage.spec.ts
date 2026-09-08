import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { navWebPaths } from '@decor/shared';

/**
 * Every page has a place in the menu.
 *
 * A screen nobody can find is a screen nobody uses, and the two clients drifted
 * apart precisely because each kept its own list. This walks the app directory
 * and fails when a page is missing from the shared tree — so adding one means
 * deciding what it is for, which is the decision that keeps the navigation
 * coherent as the product grows.
 *
 * If this fails: add the page to `NAV_GROUPS` in packages/shared (as an item if
 * it belongs in the menu, as a `children` entry if it is reached from another
 * screen), then update docs/NAVIGATION.md.
 */
function pages(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...pages(path, `${prefix}/${entry}`));
    } else if (entry === 'page.tsx') {
      out.push(prefix || '/');
    }
  }
  return out;
}

const routes = pages(__dirname);

it('finds the pages at all, so a broken read does not pass silently', () => {
  expect(routes.length).toBeGreaterThan(15);
});

it('gives every page a place in the navigation tree', () => {
  const known = new Set(navWebPaths());
  expect(routes.filter((route) => !known.has(route))).toEqual([]);
});

it('does not promise a page the web does not have', () => {
  const exists = new Set(routes);
  expect(navWebPaths().filter((route) => !exists.has(route))).toEqual([]);
});
