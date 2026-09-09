import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { navAppRoutes } from '@fas/shared';

/**
 * Every screen has a place in the menu.
 *
 * A screen nobody can find is a screen nobody uses, and the two clients drifted
 * apart precisely because each kept its own list. This walks the registered
 * routes and fails when one is missing from the shared tree — so adding a
 * screen means deciding what it is for, which is the decision that keeps the
 * navigation coherent as the product grows.
 *
 * If this fails: add the screen to `NAV_GROUPS` in packages/shared (as an item
 * if it belongs in the menu, as a `children` entry if it is reached from
 * another screen), then update docs/NAVIGATION.md.
 */
const registry = readFileSync(join(__dirname, 'index.tsx'), 'utf8');

const registered = [...registry.matchAll(/(?:Stack|Tabs)\.Screen\s+name="([A-Za-z]+)"/g)].map(
  (match) => match[1],
);

it('registers screens at all, so a broken read does not pass silently', () => {
  expect(registered.length).toBeGreaterThan(20);
});

it('gives every registered screen a place in the navigation tree', () => {
  const known = new Set([
    ...navAppRoutes(),
    // The tab navigator itself, which holds the screens rather than being one,
    // and the menu, which is the tree rather than a place in it.
    'Main',
    'Admin',
  ]);
  const missing = registered.filter((route) => !known.has(route));
  expect(missing).toEqual([]);
});

it('does not promise a screen the app does not have', () => {
  const exists = new Set([...registered, 'Main', 'Admin']);
  const ghosts = navAppRoutes().filter((route) => !exists.has(route));
  expect(ghosts).toEqual([]);
});
