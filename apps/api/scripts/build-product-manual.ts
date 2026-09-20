/**
 * Writes docs/product-manual.json from the code that actually runs.
 *
 *   npm run docs:manual
 *
 * Structure is read off the source: which controller serves which route, what
 * module it is gated by, which DTO it accepts and what that DTO validates.
 * Meaning is read off the doc comments beside those things, because what a
 * field is *for* is the one part no amount of reflection can recover.
 *
 * Nothing here is clever about TypeScript. It reads the decorators and the
 * comments as text, which works because these files are written in one style
 * and a parser that understood the whole language would be a great deal of
 * machinery for a job this shape. Where it cannot read something it says so by
 * leaving the definition empty, and the coverage spec fails on that — silence
 * is never mistaken for "nothing to say".
 */
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CORE_MODULES,
  MODULE_CATALOGUE,
  MODULE_NOTES,
  NAV_GROUPS,
  NAV_HOME,
  NAV_OUTSIDE,
  PERMISSION_LABELS,
  PLATFORM_NAV,
  type ManualAction,
  type ManualField,
  type ManualModule,
  type ManualScreen,
  type NavGroup,
  type NavItem,
  type ProductManual,
  undefinedFields,
} from '@fas/shared';

export const API_SRC = join(__dirname, '..', 'src');

/**
 * `MODULES.ORDERS` in a decorator, `'orders'` in the catalogue.
 *
 * The decorator names the constant, so the manual has to translate before it
 * can file a route under a module. Built from the catalogue rather than
 * written out, so a new module needs no edit here.
 */
const MODULE_BY_CONSTANT: Record<string, string> = Object.fromEntries(
  MODULE_CATALOGUE.map((m) => [m.key.toUpperCase().replace(/-/g, '_'), m.key]),
);
const REPO = join(__dirname, '..', '..', '..');

/** Every .ts under a directory, ignoring the tests. */
export function sources(dir: string, match: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path, match));
    else if (match(entry) && !entry.includes('.spec.')) out.push(path);
  }
  return out;
}

/**
 * The doc comment immediately above a line.
 *
 * Both shapes the codebase uses — a `/** … *\/` block and a run of `//` lines —
 * flattened to one paragraph. Anything that is not prose is dropped: a comment
 * that is all code or all punctuation explains nothing to a reader of the
 * manual, however useful it is to a reader of the file.
 */
function commentAbove(lines: string[], index: number): string {
  const collected: string[] = [];
  let i = index - 1;

  // Blank lines break the association: a comment two paragraphs up is about
  // something else.
  while (i >= 0 && lines[i].trim() === '') return '';

  if (lines[i]?.trim().endsWith('*/')) {
    while (i >= 0) {
      const text = lines[i].trim();
      collected.unshift(text.replace(/^\/\*\*?|\*\/$|^\*\s?/g, '').trim());
      if (text.startsWith('/*')) break;
      i -= 1;
    }
  } else {
    while (i >= 0 && lines[i].trim().startsWith('//')) {
      collected.unshift(lines[i].trim().replace(/^\/\/\s?/, ''));
      i -= 1;
    }
  }

  return collected
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One field, from its declaration and whatever decorates it.
 *
 * Decorators sit on the same line as the property in most of these files and
 * on their own lines in a few, so both are gathered: a field whose rules were
 * written across four lines is still a field, and leaving it out would make
 * the manual quietly incomplete in exactly the way the manual exists to stop.
 */
function fieldFrom(lines: string[], index: number): ManualField | null {
  const line = lines[index];

  /*
   * A declaration ends in a semicolon; a decorator does not.
   *
   * Without that, `@ValidateNested({ each: true })` read as a field called
   * "each" — an option to a validator, presented to a vendor as something
   * they fill in. Requiring the semicolon is what tells a property apart from
   * the inside of a decorator's arguments.
   */
  if (!line.trim().endsWith(';')) return null;

  /*
   * The declaration with the decorators taken off it first.
   *
   * `@ValidateNested({ each: true }) @Type(() => X) items: X[];` is one field
   * called `items`, but the first `name: value` on the line is `each: true`
   * inside the decorator's own options — so a vendor's manual listed "each"
   * as something to fill in. Strip what decorates the field, then read it.
   */
  const bare = line.replace(/@[A-Za-z]+\((?:[^()]|\([^()]*\))*\)/g, ' ');

  // `name?: string;` and `page = 1;` are both fields; only the first carries a
  // type, so a defaulted one is described by what it defaults to.
  /*
   * `?` marks a field optional and `!` marks it definitely assigned — and a
   * name followed by `!` is the shape TypeScript requires for a field that is
   * always present. Reading only `?` therefore dropped every REQUIRED field in
   * the product: 85 of them, including an expense's amount and a purchase
   * line's material. The manual listed what was optional about a thing and
   * silently omitted what it could not be created without.
   */
  const property =
    bare.match(/(?:^|\s)([a-zA-Z_][A-Za-z0-9_]*)([?!]?):\s*([^;=]+)/) ??
    bare.match(/(?:^|\s)([a-zA-Z_][A-Za-z0-9_]*)([?!]?)\s*=\s*([^;]+);/);
  if (!property) return null;
  const [, name, optional, rawType] = property;

  // This line, plus any run of decorator-only lines above it.
  let top = index;
  while (top > 0 && /^\s*@[A-Za-z]+\(/.test(lines[top - 1]) && !/[;{}]\s*$/.test(lines[top - 1])) {
    top -= 1;
  }
  const decorated = lines.slice(top, index + 1).join(' ');

  const decorators = [
    ...decorated.matchAll(/@(Is[A-Za-z]+|Type|Min|Max|MinLength|MaxLength|ValidateNested)\(([^)]*)\)/g),
  ];
  if (!decorators.length) return null;

  const constraints: string[] = [];
  let type = rawType.trim().replace(/\s+/g, ' ');

  for (const [, kind, args] of decorators) {
    const value = args.trim();
    if (kind === 'MinLength') constraints.push(`at least ${value} characters`);
    else if (kind === 'MaxLength') constraints.push(`at most ${value} characters`);
    else if (kind === 'Min') constraints.push(`not below ${value}`);
    else if (kind === 'Max') constraints.push(`not above ${value}`);
    else if (kind === 'IsEnum') constraints.push(`one of ${value}`);
    else if (kind === 'IsInt') type = 'whole number';
    else if (kind === 'IsNumber') type = 'number';
    else if (kind === 'IsBoolean' || kind === 'IsBooleanString') type = 'yes or no';
    else if (kind === 'IsDateString') type = 'date';
    else if (kind === 'IsEmail') constraints.push('a valid email address');
    else if (kind === 'IsArray') constraints.push('a list');
    else if (kind === 'IsUrl') constraints.push('a web address');
  }

  return {
    name,
    type,
    required:
      optional !== '?' && !decorated.includes('@IsOptional') && !/=\s*[^;]+;/.test(line),
    // The comment above the field, or above the first of its decorators.
    definition: commentAbove(lines, top),
    constraints,
  };
}

/** Every DTO class in the API, with its fields and their explanations. */
export function readDtos(): Map<string, { summary: string; fields: ManualField[] }> {
  const dtos = new Map<string, { summary: string; fields: ManualField[] }>();

  for (const file of sources(API_SRC, (f) => f.endsWith('.dto.ts'))) {
    const lines = readFileSync(file, 'utf8').split('\n');
    let current: { summary: string; fields: ManualField[] } | null = null;

    lines.forEach((line, index) => {
      const declaration = line.match(/^export class (\w+)/);
      if (declaration) {
        current = { summary: commentAbove(lines, index), fields: [] };
        dtos.set(declaration[1], current);
        return;
      }
      if (!current) return;
      if (line.startsWith('}')) {
        current = null;
        return;
      }
      const field = fieldFrom(lines, index);
      if (field) current.fields.push(field);
    });
  }

  return dtos;
}

interface RawRoute {
  method: string;
  path: string;
  handler: string;
  summary: string;
  permissions: string[];
  module: string | null;
  dto: string | null;
}

/**
 * Every route, read off the controllers.
 *
 * The module comes from `@RequireModule` — the same decorator the guard reads,
 * so the manual files a route under whatever the API actually gates it by,
 * rather than under whatever a person guessed when writing a heading.
 */
function readControllers(): RawRoute[] {
  const routes: RawRoute[] = [];

  for (const file of sources(API_SRC, (f) => f.endsWith('.controller.ts'))) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');

    const base = text.match(/@Controller\('([^']*)'\)/)?.[1] ?? '';
    const classModule = text.match(/@RequireModule\(MODULES\.(\w+)\)/)?.[1] ?? null;
    const classPermissions =
      text.match(/@RequirePermissions\(([^)]*)\)\s*\n@Controller/)?.[1] ?? null;

    let pendingPermissions: string[] = [];
    let pendingModule: string | null = null;

    lines.forEach((line, index) => {
      const permissions = line.match(/@RequirePermissions\(([^)]*)\)/);
      if (permissions) {
        pendingPermissions = [...permissions[1].matchAll(/PERMISSIONS\.(\w+)/g)].map((m) => m[1]);
        return;
      }
      const module = line.match(/@RequireModule\(MODULES\.(\w+)\)/);
      if (module) {
        pendingModule = module[1];
        return;
      }

      const verb = line.match(/@(Get|Post|Patch|Put|Delete)\(\s*'?([^')]*)'?\s*\)/);
      if (!verb) return;

      /*
       * The handler is the next line that is a method rather than another
       * decorator. Taking the next line whatever it was read
       * `@UseInterceptors(...)` as the name of the thing it decorates, and put
       * "UseInterceptors" in a vendor's manual as something the software does.
       */
      const after = lines.slice(index + 1, index + 12);
      const start = after.findIndex((l) => l.trim() && !l.trim().startsWith('@'));

      /*
       * Only this handler's own signature — up to the line that opens its
       * body.
       *
       * Reading a fixed number of lines instead ran off the end of a short
       * handler and into the next route's, so `GET /clients/:id`, which takes
       * nothing at all, was documented as accepting the twelve fields of the
       * POST below it. A manual that invents a request body is worse than one
       * that omits it: somebody would have built against it.
       */
      const body = start === -1 ? -1 : after.slice(start).findIndex((l) => l.includes('{'));
      const signature =
        start === -1 || body === -1 ? '' : after.slice(start, start + body + 1).join(' ');
      const handler = signature.match(/^\s*(?:async\s+)?(\w+)\s*\(/)?.[1] ?? '';
      /*
       * A body or a query — both are things somebody fills in.
       *
       * `search`, `page` and a date range arrive as query parameters and are
       * typed into a box on a screen exactly like anything in a body. Reading
       * only `@Body()` left every list and every report describing itself as
       * taking nothing.
       */
      const dto =
        signature.match(/@Body\(\)\s*\w+:\s*(\w+)/)?.[1] ??
        signature.match(/@Query\(\)\s*\w+:\s*(\w+)/)?.[1] ??
        null;

      routes.push({
        method: verb[1].toUpperCase(),
        path: `/${base}/${verb[2] ?? ''}`.replace(/\/+/g, '/').replace(/\/+$/, '') || '/',
        handler,
        // A route's own comment describes the route; a controller's describes
        // the controller, and repeating it under every route says nothing.
        summary: commentAbove(lines, index),
        permissions: pendingPermissions.length
          ? pendingPermissions
          : [...(classPermissions ?? '').matchAll(/PERMISSIONS\.(\w+)/g)].map((m) => m[1]),
        module: pendingModule ?? classModule,
        dto,
      });

      pendingPermissions = [];
      pendingModule = null;
    });
  }

  return routes;
}

/** Every screen in a nav tree, flattened, with the module it belongs to. */
function screensIn(groups: NavGroup[]): (ManualScreen & { module: string | null })[] {
  const out: (ManualScreen & { module: string | null })[] = [];

  const walk = (items: NavItem[], inheritedModule: string | null) => {
    for (const item of items) {
      const module = (item.module as string | undefined) ?? inheritedModule;
      out.push({
        key: item.key,
        label: item.label,
        blurb: item.blurb ?? '',
        web: item.web ?? null,
        app: item.app ?? null,
        permission: item.permission ?? null,
        module,
      });
      if (item.children) walk(item.children, module);
    }
  };

  const walkGroup = (group: NavGroup) => {
    walk(group.items, null);
    group.groups?.forEach(walkGroup);
  };

  groups.forEach(walkGroup);
  return out;
}

/** The module tag is how a screen is filed, not something the manual says. */
const plainScreen = ({ module: _module, ...screen }: ManualScreen & { module: string | null }) =>
  screen;

export function buildManual(): ProductManual {
  const dtos = readDtos();
  const routes = readControllers();
  // Home and the sign-in screen sit outside every group — they belong to no
  // module because they are what you see before choosing one — but a manual
  // that began at the second screen would be describing a product nobody has.
  const workspaceScreens = [
    ...screensIn([{ key: 'outside', label: 'Outside', items: [NAV_HOME, ...NAV_OUTSIDE] }]),
    ...screensIn(NAV_GROUPS),
  ];
  const platformScreens = screensIn(PLATFORM_NAV);

  /*
   * A field whose type is another DTO brings that DTO's fields with it.
   *
   * `items: PunchItemDto[]` is one line in the manual and the whole substance
   * of an order — the material, the size, the quantity and the rate all live
   * inside it. Listing the wrapper and stopping there documents the least
   * interesting thing about punching an order.
   *
   * One level of nesting only. Two would mean a measurement's `value` and
   * `unit` under every dimension of every line, which is more noise than
   * anybody reading a manual wants; the parent field's own explanation covers
   * what a measurement is.
   */
  const expand = (fields: ManualField[], depth = 0): ManualField[] =>
    fields.flatMap((field) => {
      const nested = dtos.get(field.type.replace(/\[\]$/, '').trim());
      if (!nested || depth >= 1) return [field];
      const many = field.type.trim().endsWith('[]');
      return [
        field,
        ...nested.fields.map((inner) => ({
          ...inner,
          name: `${field.name}${many ? '[]' : ''}.${inner.name}`,
        })),
      ];
    });

  const actionFor = (route: RawRoute): ManualAction => {
    const dto = route.dto ? dtos.get(route.dto) : undefined;
    return {
      method: route.method,
      path: route.path,
      handler: route.handler,
      summary: route.summary || dto?.summary || '',
      permissions: route.permissions.map((p) => PERMISSION_LABELS[p] ?? p),
      fields: expand(dto?.fields ?? []),
    };
  };

  const modules: ManualModule[] = MODULE_CATALOGUE.map((entry) => ({
    key: entry.key,
    label: entry.label,
    audience: 'workspace' as const,
    // The catalogue's own blurb is the one-line answer; the long form is
    // authored in MODULE_NOTES below, where there is room for it.
    summary: MODULE_NOTES[entry.key]?.summary ?? entry.blurb,
    flow: MODULE_NOTES[entry.key]?.flow ?? [],
    // Orders and Clients come with every workspace: a shop with neither has
    // bought nothing at all, so they are never a line on an invoice.
    sold: !CORE_MODULES.includes(entry.key),
    screens: workspaceScreens.filter((s) => s.module === entry.key).map(plainScreen),
    // `@RequireModule(MODULES.X)` names the constant, not the value — the same
    // decorator the guard reads, so a route is filed under whatever actually
    // gates it rather than under a heading somebody guessed.
    actions: routes
      .filter((r) => r.module && MODULE_BY_CONSTANT[r.module] === entry.key)
      .map(actionFor),
    permissions: Object.entries(PERMISSION_LABELS)
      .filter(([key]) => key.startsWith(`${entry.key}.`))
      .map(([key, label]) => ({ key, label })),
  }));

  /*
   * What every workspace has, whatever they bought.
   *
   * Settings, the people who work there, the status flow, the firm's own
   * details — none of it is gated by a module because a shop with none of it
   * could not be used at all. It is still part of what a vendor is handed, so
   * it is a section of the manual rather than a gap in it.
   */
  const filed = new Set(modules.flatMap((m) => m.screens.map((s) => s.key)));
  modules.push({
    key: 'workspace',
    label: 'Every workspace',
    audience: 'workspace',
    summary: MODULE_NOTES.workspace?.summary ?? '',
    flow: MODULE_NOTES.workspace?.flow ?? [],
    sold: false,
    screens: workspaceScreens.filter((s) => !filed.has(s.key)).map(plainScreen),
    actions: routes
      .filter((r) => !r.module && !r.path.startsWith('/platform'))
      .map(actionFor),
    permissions: Object.entries(PERMISSION_LABELS)
      .filter(([key]) => !key.startsWith('platform.'))
      .filter(([key]) => !MODULE_CATALOGUE.some((m) => key.startsWith(`${m.key}.`)))
      .map(([key, label]) => ({ key, label })),
  });

  // The console. One module rather than several, because it is not sold and
  // nobody picks parts of it.
  modules.push({
    key: 'platform',
    label: 'FirstLeap console',
    audience: 'platform',
    summary: MODULE_NOTES.platform?.summary ?? '',
    flow: MODULE_NOTES.platform?.flow ?? [],
    sold: false,
    screens: platformScreens.map(plainScreen),
    actions: routes.filter((r) => r.path.startsWith('/platform')).map(actionFor),
    permissions: Object.entries(PERMISSION_LABELS)
      .filter(([key]) => key.startsWith('platform.'))
      .map(([key, label]) => ({ key, label })),
  });

  return { generatedAt: new Date().toISOString().slice(0, 10), modules };
}

/** One line per field nobody has explained, stable enough to diff. */
export const gapList = (manual: ProductManual): string[] =>
  undefinedFields(manual)
    .map((g) => `${g.module} | ${g.action} | ${g.field}`)
    .sort();

export const GAPS_FILE = join(REPO, 'docs', 'product-manual-gaps.json');

/**
 * The manual is generated as a TypeScript module rather than a JSON file.
 *
 * Both clients already compile @fas/shared from source, so a module is
 * importable from either of them with no bundler configuration and with its
 * types intact — and it is one artifact rather than two, which is one fewer
 * thing that can disagree with itself.
 */
export const MANUAL_FILE = join(
  REPO,
  'packages',
  'shared',
  'src',
  'product-manual.generated.ts',
);

const asModule = (manual: ProductManual): string =>
  `/* eslint-disable */
// Generated by apps/api/scripts/build-product-manual.ts — do not edit by hand.
//
// Structure comes from the code that runs: controllers, their guards, and the
// DTOs they accept. Meaning comes from the doc comments beside those things.
// To change what this says, change the comment next to the field; to add a
// module's description, edit packages/shared/src/module-notes.ts.
//
//   npm --workspace @fas/api run docs:manual
import type { ProductManual } from './product-manual';

export const PRODUCT_MANUAL: ProductManual = ${JSON.stringify(manual, null, 2)};
`;

if (require.main === module) {
  const manual = buildManual();
  writeFileSync(MANUAL_FILE, asModule(manual));

  const gaps = gapList(manual);
  const fields = manual.modules.flatMap((m) => m.actions.flatMap((a) => a.fields));

  /*
   * The list of fields nobody has explained is written only when asked for.
   *
   * If every run rewrote it, the coverage spec would be toothless: adding a
   * field with no definition would quietly widen what is allowed, and the
   * manual would fall behind exactly as silently as it would with no gate at
   * all. Accepting a new gap has to be something somebody decides and a
   * reviewer can see in the diff.
   */
  if (process.argv.includes('--accept-gaps')) {
    writeFileSync(GAPS_FILE, `${JSON.stringify(gaps, null, 2)}\n`);
    console.log(`accepted ${gaps.length} undocumented fields into docs/product-manual-gaps.json`);
  }

  console.log(
    `product-manual.generated.ts — ${manual.modules.length} modules, ` +
      `${manual.modules.flatMap((m) => m.actions).length} actions, ` +
      `${fields.length - gaps.length}/${fields.length} fields explained`,
  );
}
