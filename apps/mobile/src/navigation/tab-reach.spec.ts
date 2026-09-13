import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TAB_ROUTES, TABS_ROUTE } from './routes';

/**
 * A stack screen cannot reach a tab by its name.
 *
 * `navigate` walks up to a parent navigator; it never descends into a sibling.
 * From inside the tabs, `navigate('Leads')` is right. From the menu — a stack
 * screen — the same call is refused, and react-navigation says so by logging
 * "The action 'NAVIGATE' with payload {"name":"Leads"} was not handled by any
 * navigator" and doing nothing. On a phone that is a dead row, with the reason
 * in a console the shop floor never opens.
 *
 * Nothing else catches it: every unit test renders one screen with a mocked
 * `navigation`, where any route name is accepted.
 *
 * If this fails: use `goTo(navigation, route)` from `navigation/routes`, which
 * sends a tab route through the tab navigator it actually lives in.
 */
const here = __dirname;
const registry = readFileSync(join(here, 'index.tsx'), 'utf8');

/** Where each screen component is imported from, so its file can be read. */
const sources = new Map(
  [...registry.matchAll(/import\s+\{\s*([A-Za-z]+)\s*\}\s+from\s+'([^']+)'/g)].map(
    (match) => [match[1], match[2]] as const,
  ),
);

const stackScreens = [...registry.matchAll(/Stack\.Screen\s+name="[A-Za-z]+"\s+component=\{([A-Za-z]+)\}/g)]
  .map((match) => match[1])
  .filter((component) => sources.has(component));

const tabScreens = new Set(
  [...registry.matchAll(/Tabs\.Screen\s+name="[A-Za-z]+"\s+component=\{([A-Za-z]+)\}/g)].map(
    (match) => match[1],
  ),
);

it('reads the navigator at all, so a broken parse does not pass silently', () => {
  expect(stackScreens.length).toBeGreaterThan(20);
  expect(tabScreens.size).toBe(TAB_ROUTES.length);
});

it('finds every stack screen on disk', () => {
  const unreadable = stackScreens.filter((component) => !fileFor(component));
  expect(unreadable).toEqual([]);
});

function fileFor(component: string): string | null {
  const from = sources.get(component);
  if (!from) return null;
  const base = resolve(here, from);
  for (const candidate of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx')]) {
    try {
      return readFileSync(candidate, 'utf8');
    } catch {
      // Try the next extension.
    }
  }
  return null;
}

/*
 * The form the bug actually took.
 *
 * The menu walks `NAV_GROUPS` and navigated to whatever `item.app` held, so
 * the route name is not in the file and no check for a literal could see it.
 * Every row worked except the five that are tabs.
 *
 * So: a route name that is not written out is a route name nobody can check,
 * and it goes through `goTo`, which knows where each screen lives.
 */
describe('navigating to a route the file does not name', () => {
  const screens = [...new Set([...stackScreens, ...tabScreens])];

  /** `navigate(` not followed by a quote — a variable, a field, a call. */
  const computed = /navigation\.navigate\(\s*(?!['"`])/;

  it('goes through goTo, wherever it is done', () => {
    const offenders = screens.filter((component) => {
      const source = fileFor(component) ?? '';
      return computed.test(source) && !source.includes("from '../navigation/routes'")
        && !source.includes("from '../../navigation/routes'");
    });

    expect(offenders).toEqual([]);
  });

  // The check above is only worth having while screens still navigate this
  // way — otherwise it passes for the wrong reason and nobody notices.
  it('is something the app still does, so this is not checking nothing', () => {
    const doing = screens.filter((component) =>
      /goTo\(\s*navigation\s*,\s*(?!['"`])/.test(fileFor(component) ?? ''),
    );

    expect(doing.length).toBeGreaterThan(0);
  });
});

describe.each(TAB_ROUTES)('the %s tab', (route) => {
  it('is not navigated to by name from a screen outside the tabs', () => {
    const byName = new RegExp(`navigate\\(\\s*['"\`]${route}['"\`]`);

    const offenders = stackScreens
      .filter((component) => !tabScreens.has(component))
      .filter((component) => byName.test(fileFor(component) ?? ''));

    expect(offenders).toEqual([]);
  });
});

/*
 * And the helper the fix depends on has to agree with the navigator, or it
 * quietly stops rewriting the routes that need rewriting.
 */
it('lists exactly the routes the tab navigator registers', () => {
  const registered = [...registry.matchAll(/Tabs\.Screen\s+name="([A-Za-z]+)"/g)].map(
    (match) => match[1],
  );

  expect([...TAB_ROUTES].sort()).toEqual(registered.sort());
});

it('names the stack route the tab navigator is registered under', () => {
  expect(registry).toContain(`<Stack.Screen name="${TABS_ROUTE}"`);
});
