import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TAB_ROUTES, TABS_ROUTE } from './routes';

/**
 * Every screen can reach what it navigates to.
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

/*
 * The stack has two arms and only one of them is ever mounted: a platform
 * admin belongs to no workspace, so they get the control plane and none of a
 * shop's screens. A route from the wrong arm fails exactly the way a tab route
 * from the stack does — refused, with a console line and nothing on screen.
 */
const PLATFORM_ARM = registry.slice(
  registry.indexOf('user && isPlatform ? ('),
  registry.indexOf(') : user ? ('),
);
const TENANT_ARM = registry.slice(registry.indexOf(') : user ? ('), registry.indexOf(') : ('));

const routesIn = (block: string, navigator: 'Stack' | 'Tabs') =>
  [...block.matchAll(new RegExp(`${navigator}\\.Screen\\s+name="([A-Za-z]+)"`, 'g'))].map(
    (match) => match[1],
  );

const PLATFORM_ROUTES = new Set(routesIn(PLATFORM_ARM, 'Stack'));
const TENANT_ROUTES = new Set([...routesIn(TENANT_ARM, 'Stack'), ...routesIn(registry, 'Tabs')]);

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
 * A route name written out in a screen has to exist in a navigator that screen
 * can reach.
 *
 * Two ways it cannot: the name belongs to no navigator at all (a screen that
 * was renamed, a typo), or it belongs to the other arm of the stack. Both fail
 * the same silent way — react-navigation refuses the action and the tap does
 * nothing.
 */
describe('the routes a screen names', () => {
  /** `navigate`, `replace` and `push` all take a route name the same way. */
  const targets = (source: string) => [
    ...new Set(
      [...source.matchAll(/navigation\.(?:navigate|replace|push)\(\s*['"`]([A-Za-z]+)['"`]/g)].map(
        (match) => match[1],
      ),
    ),
  ];

  const screensOf = (arm: Set<string>) =>
    [...stackScreens, ...tabScreens].filter((component) => {
      const registered = registry.match(
        new RegExp(`\\.Screen\\s+name="([A-Za-z]+)"\\s+component=\\{${component}\\}`),
      );
      return registered ? arm.has(registered[1]) : false;
    });

  it('exist somewhere in the app', () => {
    const everywhere = new Set([...PLATFORM_ROUTES, ...TENANT_ROUTES]);
    const ghosts: string[] = [];

    for (const component of [...stackScreens, ...tabScreens]) {
      for (const target of targets(fileFor(component) ?? '')) {
        if (!everywhere.has(target)) ghosts.push(`${component} -> ${target}`);
      }
    }

    expect(ghosts).toEqual([]);
  });

  it('are not a shop screen reached from the platform console', () => {
    const crossings: string[] = [];

    for (const component of screensOf(PLATFORM_ROUTES)) {
      for (const target of targets(fileFor(component) ?? '')) {
        if (!PLATFORM_ROUTES.has(target)) crossings.push(`${component} -> ${target}`);
      }
    }

    expect(crossings).toEqual([]);
  });

  it('are not a console screen reached from a shop', () => {
    const crossings: string[] = [];

    for (const component of screensOf(TENANT_ROUTES)) {
      for (const target of targets(fileFor(component) ?? '')) {
        if (!TENANT_ROUTES.has(target)) crossings.push(`${component} -> ${target}`);
      }
    }

    expect(crossings).toEqual([]);
  });

  it('reads both arms, so a broken split does not pass silently', () => {
    expect(PLATFORM_ROUTES.size).toBeGreaterThan(3);
    expect(TENANT_ROUTES.size).toBeGreaterThan(30);
    // No route belongs to both, or the two checks above mean nothing.
    const both = [...PLATFORM_ROUTES].filter((route) => TENANT_ROUTES.has(route));
    expect(both).toEqual([]);
  });
});

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
