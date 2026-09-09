import {
  NAV_GROUPS,
  NAV_HOME,
  NAV_OUTSIDE,
  PLATFORM_NAV,
  type NavGroup,
  type NavItem,
} from './navigation';

/**
 * docs/NAVIGATION.md, written out from the navigation tree.
 *
 * Generated rather than maintained by hand: a hand-written map of a growing
 * product is out of date by its second release, and a map that lies is worse
 * than none. A test compares the committed file with this, so the doc cannot
 * drift from the tree the clients actually render.
 */
export function navigationMarkdown(): string {

  const line = (item: NavItem, depth: number): string => {
    const pad = '  '.repeat(depth);
    const web = item.web ? `\`${item.web}\`` : '—';
    const app = item.app ? `\`${item.app}\`` : '—';
    const perm = item.permission ? `\`${item.permission}\`` : '—';
    return `| ${pad}${depth ? '↳ ' : ''}${item.label} | ${web} | ${app} | ${perm} |`;
};

  const rows = (items: NavItem[], depth = 0): string[] =>
    items.flatMap((item) => [line(item, depth), ...rows(item.children ?? [], depth + 1)]);

  const groupSection = (group: NavGroup, level = 3): string[] => {
    const out = [
      '',
      `${'#'.repeat(level)} ${group.label}`,
      ...(group.blurb ? ['', `*${group.blurb}*`] : []),
      '',
      '| Screen | Web | App route | Permission |',
      '| --- | --- | --- | --- |',
      ...rows(group.items),
    ];
    for (const inner of group.groups ?? []) out.push(...groupSection(inner, level + 1));
    return out;
};

  const id = (s: string) => s.replace(/[^A-Za-z0-9]/g, '_');

  const chart = (): string[] => {
    const out = ['```mermaid', 'flowchart LR', '  Home([Home])'];
    for (const group of NAV_GROUPS) {
      out.push(`  subgraph cat_${id(group.key)}["${group.label}"]`);
      out.push('    direction TB');
      const draw = (items: NavItem[], parent?: string) => {
        for (const item of items) {
          out.push(`    ${id(item.key)}["${item.label}"]`);
          if (parent) out.push(`    ${parent} --> ${id(item.key)}`);
          draw(item.children ?? [], id(item.key));
        }
      };
      draw(group.items);
      for (const inner of group.groups ?? []) {
        out.push(`    subgraph cat_${id(inner.key)}["${inner.label}"]`);
        out.push('      direction TB');
        draw(inner.items);
        out.push('    end');
      }
      out.push('  end');
      out.push(`  Home --> cat_${id(group.key)}`);
    }
    out.push('```');
    return out;
};

  const doc = [
    '# Navigation',
    '',
    '> Generated from `packages/shared/src/navigation.ts`. That file is the one',
    '> source of truth: the web sidebar, the app menu and this document all read',
    "> it, and a test on each client fails when a registered screen is missing",
    '> from it.',
    '',
    '## How to keep this true',
    '',
    '1. Add the screen to `NAV_GROUPS` (or `children`, when it is reached from',
    '   another screen rather than from the menu).',
    '2. Run `npm --workspace @fas/shared run docs:nav` to rewrite this file.',
    '3. The coverage specs — `apps/web/src/app/coverage.spec.ts` and',
    '   `apps/mobile/src/navigation/coverage.spec.ts` — fail until both are done.',
    '',
    '## The map',
    '',
    ...chart(),
    '',
    '## Home',
    '',
    '| Screen | Web | App route | Permission |',
    '| --- | --- | --- | --- |',
    ...rows([NAV_HOME]),
    '',
    '## Categories',
    ...NAV_GROUPS.flatMap((group) => groupSection(group)),
    '',
    '## FirstLeap’s own console',
    '',
    '*Where the product is run rather than used. Nothing here is gated by a',
    'module — a client’s plan cannot decide what we may see about them — and',
    'every screen needs a platform permission, which no tenant role can hold.*',
    ...PLATFORM_NAV.flatMap((group) => groupSection(group)),
    '',
    '## Outside the menu',
    '',
    '*Signing in happens before there is a menu at all.*',
    '',
    '| Screen | Web | App route | Permission |',
    '| --- | --- | --- | --- |',
    ...rows(NAV_OUTSIDE),
    '',
  ].join('\n');

  return doc;
}
