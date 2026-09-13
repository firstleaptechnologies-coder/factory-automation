import fs from 'fs';
import path from 'path';
import { render, screen } from '@testing-library/react-native';
import { RootNavigator } from './index';

/**
 * Every screen the navigator mounts talks to the API on the way in. Some read
 * a bare list and some a paged envelope, so the stand-in is both at once.
 */
jest.mock('../api/client', () => ({
  api: new Proxy(
    {},
    {
      get: () =>
        jest.fn(async () =>
          Object.assign([], { data: [], meta: { page: 1, pages: 1, total: 0 }, unit: 'FT' }),
        ),
    },
  ),
}));

let mockAuth: Record<string, unknown> = { user: null, loading: false, can: () => true };
jest.mock('../auth/AuthContext', () => ({ useAuth: () => mockAuth }));

const SHOP_USER = { id: 'u1', name: 'Nakul', code: 'ADMIN', permissions: [], isPlatform: false };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { user: null, loading: false, can: () => true, has: () => true };
});

it('says nothing about signing in until the stored session has been read', async () => {
  mockAuth = { user: null, loading: true, can: () => true, has: () => true };
  await render(<RootNavigator />);
  // Flashing the login screen at somebody who is already signed in is worse
  // than a moment of nothing.
  expect(screen.queryByLabelText(/Factory Automation Software/)).toBeNull();
});

it('asks for a sign-in when nobody is signed in', async () => {
  await render(<RootNavigator />);
  // The brand is artwork now, so this asserts the label it is announced
  // with rather than a string on screen.
  expect(await screen.findByLabelText(/Factory Automation Software/)).toBeTruthy();
  // With no workspace remembered, signing in starts by asking which shop.
  expect(screen.getByText('Workspace')).toBeTruthy();
  expect(screen.getByText('Continue')).toBeTruthy();
});

it('opens the shop for somebody signed in to one', async () => {
  mockAuth = { user: SHOP_USER, loading: false, can: () => true, has: () => true };
  await render(<RootNavigator />);
  expect(await screen.findByText('Where the work is')).toBeTruthy();
});

it('sends a platform admin to the control plane instead of a shop', async () => {
  mockAuth = {
    user: { ...SHOP_USER, isPlatform: true },
    loading: false,
    can: () => true,
    has: () => true,
  };
  await render(<RootNavigator />);
  // A platform admin belongs to no workspace, so a shop's screens would have
  // no tenant to read.
  expect(screen.queryByText('Pipeline value')).toBeNull();
});

describe('the routes screens ask for', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');
  const registered = new Set(
    [...source.matchAll(/<(?:Stack|Tabs)\.Screen\s+name="([A-Za-z]+)"/g)].map((m) => m[1]),
  );

  /** Every navigate/replace/push target written anywhere in the app. */
  const asked = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.spec.')) {
        const text = fs.readFileSync(full, 'utf8');
        for (const match of text.matchAll(
          /navigation\.(?:navigate|replace|push)\(\s*'([A-Za-z]+)'/g,
        )) {
          asked.set(match[1], [...(asked.get(match[1]) ?? []), full]);
        }
      }
    }
  };
  walk(path.join(__dirname, '..'));

  it('found the routes to check', () => {
    expect(registered.size).toBeGreaterThan(20);
    expect(asked.size).toBeGreaterThan(10);
  });

  it.each([...asked.keys()].sort())('has a screen registered for %s', (route) => {
    // A route name that is not registered is a crash the moment somebody taps
    // whatever leads to it, and nothing else would catch the typo.
    expect(registered.has(route)).toBe(true);
  });
});
