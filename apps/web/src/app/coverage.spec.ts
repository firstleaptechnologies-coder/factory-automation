import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { navChildren, navWebPaths } from '@fas/shared';

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

/*
 * A page the tree says is reached from another page has to be reachable.
 *
 * The checks above ask whether every page has a *place*. `children` is the
 * place for the ones that are not in the sidebar — a board, a detail, a
 * settings page hanging off the list it configures — and saying so is a claim
 * that some page links to it. Nothing was checking the claim, and two pages
 * were built, routed and listed with no link anywhere: the expense dropdowns
 * and the letter templates. Both clients, both dead.
 *
 * If this fails: put a link in on the page the tree names as the parent — or
 * move the item, if it turned out to belong somewhere else.
 */
describe('a page reached from another page', () => {
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

  /** A path is written either as a `router.push` or as a `Link href`. */
  const linked = new Set(
    sources.flatMap((source) => [
      ...[...source.matchAll(/router\.(?:push|replace)\(\s*[`'"]([^`'"$)]+)/g)].map(
        (match) => match[1],
      ),
      ...[...source.matchAll(/href=\{?\s*[`'"]([^`'"$}]+)/g)].map((match) => match[1]),
    ]),
  );

  const children = navChildren().filter((link) => link.child.web);

  it('finds some, so an empty walk does not pass silently', () => {
    expect(sources.length).toBeGreaterThan(50);
    expect(children.length).toBeGreaterThan(20);
    expect(linked.size).toBeGreaterThan(20);
  });

  it('has a way in from somewhere on the site', () => {
    const dead = children
      .filter((link) => {
        const path = link.child.web as string;
        // A detail page is `/orders/[id]`; what a page links to is
        // `/orders/${order.id}`, so the prefix is what can be matched.
        const prefix = path.replace(/\/\[.*$/, '');
        return ![...linked].some((one) => one === path || one.startsWith(`${prefix}/`));
      })
      .map((link) => `${link.child.label} (${link.child.web}), under ${link.parent.label}`);

    expect(dead).toEqual([]);
  });
});
