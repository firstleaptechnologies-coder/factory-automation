import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { PLATFORM_NAV } from '@fas/shared';
import { PlatformShell } from './PlatformShell';

const replace = jest.fn();
let pathname = '/platform';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => pathname,
}));

let user: Record<string, unknown> | null = null;
let permissions: string[] = [];
const signOut = jest.fn();
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user,
    loading: false,
    signOut,
    can: (p: string) => permissions.includes(p),
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  pathname = '/platform';
  user = { id: 'me', name: 'Nakul', isPlatform: true, platformRole: 'OWNER' };
  permissions = [
    'platform.tenant.view',
    'platform.pricing.manage',
    'platform.staff.view',
    'platform.release.view',
  ];
});

const mount = () => render(<PlatformShell><p>inside</p></PlatformShell>);

it('groups the console by what a question is about', () => {
  mount();

  expect(screen.getByText('The business')).toBeInTheDocument();
  expect(screen.getByText('What we sell')).toBeInTheDocument();
  expect(screen.getByText('Ourselves')).toBeInTheDocument();
});

it('carries every screen somebody may reach', () => {
  mount();

  for (const label of ['Overview', 'Workspaces', 'Tiers and prices', 'Billing', 'Staff and roles', 'Releases']) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
});

/*
 * Hiding a link is a courtesy — the API refuses the route either way — but a
 * menu full of screens that say no is not a product.
 */
it('leaves out what this person may not do', () => {
  permissions = ['platform.tenant.view'];
  mount();

  expect(screen.getByText('Workspaces')).toBeInTheDocument();
  expect(screen.queryByText('Staff and roles')).not.toBeInTheDocument();
  expect(screen.queryByText('Releases')).not.toBeInTheDocument();
});

it('drops a whole group when nothing in it is reachable', () => {
  permissions = ['platform.tenant.view'];
  mount();

  expect(screen.queryByText('Ourselves')).not.toBeInTheDocument();
});

/*
 * `/platform` is the overview and sits above everything else, so a prefix
 * match would light it up on every page of the console.
 */
it('lights the overview only on the overview', () => {
  pathname = '/platform/tenants';
  mount();

  expect(screen.getByText('Overview').closest('a')).toHaveAttribute('data-active', 'false');
  expect(screen.getByText('Workspaces').closest('a')).toHaveAttribute('data-active', 'true');
});

// Which is what keeps Workspaces lit while you are inside one.
it('keeps a section lit while you are inside one of its screens', () => {
  pathname = '/platform/tenants/t1';
  mount();

  expect(screen.getByText('Workspaces').closest('a')).toHaveAttribute('data-active', 'true');
});

it('sends somebody signed into a workspace back to their own', () => {
  user = { id: 'u1', name: 'Nakul', isPlatform: false };
  mount();

  expect(replace).toHaveBeenCalledWith('/');
});

it('sends a signed-out visitor to the sign-in screen', () => {
  user = null;
  mount();

  expect(replace).toHaveBeenCalledWith('/login');
});

it('shows nothing of the console to somebody who is not one of us', () => {
  user = { id: 'u1', name: 'Nakul', isPlatform: false };
  mount();

  expect(screen.queryByText('inside')).not.toBeInTheDocument();
});

/*
 * Every row in the console's sidebar, against the pages that exist.
 *
 * Same check as the shop's sidebar, for the same reason: the gating is tested
 * above because it was designed, and the href is the part that is only typed.
 */
describe('every row', () => {
  const pages = (dir: string, prefix = ''): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) out.push(...pages(path, `${prefix}/${entry}`));
      else if (entry === 'page.tsx') out.push(prefix || '/');
    }
    return out;
  };

  const served = pages(join(__dirname, '../app')).map(
    (route) =>
      new RegExp(`^${route.replace(/\[[^\]]+\]/g, '[^/]+').replace(/\//g, '\\/')}$`),
  );

  const rows = PLATFORM_NAV.flatMap((group) =>
    group.items.filter((item) => item.web).map((item) => [item.label, item.web as string] as const),
  );

  it('has rows at all, so an empty walk does not pass silently', () => {
    expect(rows.length).toBeGreaterThan(3);
    expect(served.length).toBeGreaterThan(30);
  });

  it.each(rows)('%s links to %s, and that page exists', (label, web) => {
    mount();

    const link = screen.getByText(label).closest('a');

    expect(link).toHaveAttribute('href', web);
    expect(served.some((page) => page.test(web))).toBe(true);
  });

  // The console and a shop are never mounted together — a platform admin
  // belongs to no workspace — so a shop's path here is a link out of the app.
  it('goes nowhere outside the console', () => {
    const strays = rows.filter(([, web]) => !web.startsWith('/platform'));
    expect(strays).toEqual([]);
  });
});
