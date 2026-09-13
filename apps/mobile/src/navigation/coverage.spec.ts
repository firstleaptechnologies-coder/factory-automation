import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { navAppRoutes, navChildren } from '@fas/shared';

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

/*
 * A screen the tree says is reached from another screen has to be reachable.
 *
 * The checks above ask whether every screen has a *place*. `children` is the
 * place for the ones that are not in the menu — a board, a detail, a settings
 * page hanging off the list it configures — and saying so is a claim that some
 * screen opens it. Nothing was checking the claim, and two screens were built,
 * registered and listed with no button anywhere that opened them: the expense
 * dropdowns and the letter templates. Both clients, both dead.
 *
 * If this fails: put a way in on the screen the tree names as the parent — or
 * move the item, if it turned out to belong somewhere else.
 */
describe('a screen reached from another screen', () => {
  const sources: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(path) && !/\.spec\./.test(path)) {
        sources.push(readFileSync(path, 'utf8'));
      }
    }
  })(join(__dirname, '..'));

  /** `navigate`, `replace`, `push` and `goTo` all name the route the same way. */
  const opened = new Set(
    sources.flatMap((source) => [
      ...[...source.matchAll(/navigation\.(?:navigate|replace|push)\(\s*['"`]([A-Za-z]+)['"`]/g)].map(
        (match) => match[1],
      ),
      ...[...source.matchAll(/goTo\(\s*navigation\s*,\s*['"`]([A-Za-z]+)['"`]/g)].map(
        (match) => match[1],
      ),
    ]),
  );

  const children = navChildren().filter((link) => link.child.app);

  it('finds some, so an empty walk does not pass silently', () => {
    expect(sources.length).toBeGreaterThan(50);
    expect(children.length).toBeGreaterThan(20);
    expect(opened.size).toBeGreaterThan(20);
  });

  it('has a way in from somewhere in the app', () => {
    const dead = children
      .filter((link) => !opened.has(link.child.app as string))
      .map((link) => `${link.child.label} (${link.child.app}), under ${link.parent.label}`);

    expect(dead).toEqual([]);
  });
});
