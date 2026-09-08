import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from './AuthContext';

const mockLogin = jest.fn();
const mockPlatformLogin = jest.fn();
const mockMe = jest.fn();
const mockSetToken = jest.fn();
let mockUnauthorized: (() => void) | undefined;

jest.mock('../api/client', () => ({
  api: {
    login: (...args: unknown[]) => mockLogin(...args),
    platformLogin: (...args: unknown[]) => mockPlatformLogin(...args),
    me: () => mockMe(),
    setToken: (token: string | null) => mockSetToken(token),
  },
  setUnauthorizedHandler: (handler: () => void) => {
    mockUnauthorized = handler;
  },
}));

const storage = AsyncStorage as unknown as {
  multiGet: jest.Mock;
  multiSet: jest.Mock;
  multiRemove: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
};

let state: ReturnType<typeof useAuth>;

function Probe() {
  state = useAuth();
  return <Text>{state.loading ? 'loading' : (state.user?.name ?? 'signed out')}</Text>;
}

const mount = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

/** AsyncStorage's multiGet answers in the order the keys were asked for. */
function stored({ token = null, user = null, workspace = null }: Record<string, unknown>) {
  storage.multiGet.mockResolvedValue([
    ['decor.token', token],
    ['decor.user', user],
    ['decor.workspace', workspace],
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  stored({});
  storage.multiSet.mockResolvedValue(undefined);
  storage.multiRemove.mockResolvedValue(undefined);
});

it('settles as signed out when nothing was stored', async () => {
  await mount();
  expect(await screen.findByText('signed out')).toBeTruthy();
  expect(mockMe).not.toHaveBeenCalled();
});

it('adopts the cached user while the server is still being asked', async () => {
  stored({ token: 'tok', user: JSON.stringify({ name: 'Nakul', permissions: [] }) });
  mockMe.mockReturnValue(new Promise(() => {}));
  await mount();
  // The app is still on its splash — `loading` only clears once the server has
  // answered — but the user is already in hand, so nothing flashes as signed
  // out when it does.
  await waitFor(() => expect(state.user?.name).toBe('Nakul'));
  expect(state.loading).toBe(true);
});

it('replaces the cached user with what the server says', async () => {
  stored({ token: 'tok', user: JSON.stringify({ name: 'Old name', permissions: [] }) });
  mockMe.mockResolvedValue({ name: 'Nakul', permissions: ['order.view'] });
  await mount();
  expect(await screen.findByText('Nakul')).toBeTruthy();
  expect(storage.setItem).toHaveBeenCalledWith(
    'decor.user',
    JSON.stringify({ name: 'Nakul', permissions: ['order.view'] }),
  );
});

it('signs out when the stored token is no longer accepted', async () => {
  stored({ token: 'stale' });
  mockMe.mockRejectedValue(new Error('Unauthorized'));
  await mount();
  expect(await screen.findByText('signed out')).toBeTruthy();
  expect(storage.multiRemove).toHaveBeenCalledWith(['decor.token', 'decor.user']);
});

it('remembers the workspace between sessions', async () => {
  stored({ workspace: 'decorbucket' });
  await mount();
  await waitFor(() => expect(state.workspace).toBe('decorbucket'));
});

it('keeps the token, the user and the workspace on sign-in', async () => {
  mockLogin.mockResolvedValue({
    accessToken: 'tok',
    user: { name: 'Nakul', permissions: [] },
    workspace: { slug: 'decorbucket' },
  });
  await mount();
  await screen.findByText('signed out');
  await act(() => state.signIn('DecorBucket', 'ADMIN', 'admin123'));

  expect(storage.multiSet).toHaveBeenCalledWith([
    ['decor.token', 'tok'],
    [
      'decor.user',
      // The workspace is kept with the user: the menu needs what the shop
      // bought as well as what the person may do, and both have to survive the
      // app being closed.
      JSON.stringify({
        name: 'Nakul',
        permissions: [],
        workspace: { slug: 'decorbucket' },
      }),
    ],
    ['decor.workspace', 'decorbucket'],
  ]);
  expect(await screen.findByText('Nakul')).toBeTruthy();
});

it('prefers the slug the server resolved over what was typed', async () => {
  mockLogin.mockResolvedValue({
    accessToken: 'tok',
    user: { name: 'Nakul', permissions: [] },
    workspace: { slug: 'decorbucket' },
  });
  await mount();
  await screen.findByText('signed out');
  await act(() => state.signIn('DECORBUCKET', 'ADMIN', 'pw'));
  await waitFor(() => expect(state.workspace).toBe('decorbucket'));
});

it('falls back to what was typed when the server names no workspace', async () => {
  mockLogin.mockResolvedValue({ accessToken: 'tok', user: { name: 'N', permissions: [] } });
  await mount();
  await screen.findByText('signed out');
  await act(() => state.signIn('decorbucket', 'ADMIN', 'pw'));
  await waitFor(() => expect(state.workspace).toBe('decorbucket'));
});

it('does not record a workspace for a platform admin', async () => {
  mockPlatformLogin.mockResolvedValue({
    accessToken: 'ptok',
    user: { name: 'Ops', isPlatform: true, permissions: [] },
  });
  await mount();
  await screen.findByText('signed out');
  await act(() => state.signInAsPlatform('ops@example.com', 'pw'));
  // A platform admin belongs to no workspace.
  expect(storage.multiSet.mock.calls[0][0]).toHaveLength(2);
});

it('keeps the workspace after signing out', async () => {
  stored({ token: 'tok', workspace: 'decorbucket' });
  mockMe.mockResolvedValue({ name: 'Nakul', permissions: [] });
  await mount();
  await screen.findByText('Nakul');
  await act(() => state.signOut());
  // The next person at this device is almost always from the same shop.
  expect(storage.multiRemove).toHaveBeenCalledWith(['decor.token', 'decor.user']);
  expect(state.workspace).toBe('decorbucket');
  expect(mockSetToken).toHaveBeenCalledWith(null);
});

it('forgetting the workspace signs the person out too', async () => {
  stored({ workspace: 'decorbucket' });
  await mount();
  await waitFor(() => expect(state.workspace).toBe('decorbucket'));
  await act(() => state.forgetWorkspace());
  expect(storage.removeItem).toHaveBeenCalledWith('decor.workspace');
  expect(state.workspace).toBeNull();
});

it('signs out by itself when a request comes back unauthorised', async () => {
  stored({ token: 'tok' });
  mockMe.mockResolvedValue({ name: 'Nakul', permissions: [] });
  await mount();
  await screen.findByText('Nakul');
  await act(async () => mockUnauthorized?.());
  expect(await screen.findByText('signed out')).toBeTruthy();
});

describe('can', () => {
  it('is false for everyone before sign-in', async () => {
    await mount();
    await screen.findByText('signed out');
    expect(state.can('order.view')).toBe(false);
  });

  it('answers from the permissions on the token, not a role name', async () => {
    stored({ token: 'tok' });
    mockMe.mockResolvedValue({ name: 'Ravi', permissions: ['order.view'] });
    await mount();
    await screen.findByText('Ravi');
    // A tenant can rename or recombine roles freely; the keys do not move.
    expect(state.can('order.view')).toBe(true);
    expect(state.can('disbursement.manage')).toBe(false);
  });

  it('copes with a user carrying no permissions at all', async () => {
    stored({ token: 'tok' });
    mockMe.mockResolvedValue({ name: 'Ravi' });
    await mount();
    await screen.findByText('Ravi');
    expect(state.can('order.view')).toBe(false);
  });
});

it('refuses to be used outside the provider', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(render(<Probe />)).rejects.toThrow(/useAuth must be used inside AuthProvider/);
  spy.mockRestore();
});
