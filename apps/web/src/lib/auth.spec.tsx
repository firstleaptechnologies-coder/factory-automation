import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const login = jest.fn();
const platformLogin = jest.fn();
const me = jest.fn();
const saveToken = jest.fn();
const clearToken = jest.fn();
let storedToken: string | null = null;

jest.mock('./api', () => ({
  api: {
    login: (...args: unknown[]) => login(...args),
    platformLogin: (...args: unknown[]) => platformLogin(...args),
    me: () => me(),
  },
  loadToken: () => storedToken,
  saveToken: (token: string) => saveToken(token),
  clearToken: () => clearToken(),
}));

let state: ReturnType<typeof useAuth>;

function Probe() {
  state = useAuth();
  return <span>{state.loading ? 'loading' : (state.user?.name ?? 'signed out')}</span>;
}

function mount() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  storedToken = null;
});

it('settles as signed out when there is no token', async () => {
  mount();
  await screen.findByText('signed out');
  expect(me).not.toHaveBeenCalled();
});

it('restores the session from a stored token', async () => {
  storedToken = 'tok';
  me.mockResolvedValue({ name: 'Nakul', permissions: ['order.view'] });
  mount();
  await screen.findByText('Nakul');
});

it('drops a token the server no longer accepts', async () => {
  storedToken = 'stale';
  me.mockRejectedValue(new Error('Unauthorized'));
  mount();
  await screen.findByText('signed out');
  expect(clearToken).toHaveBeenCalled();
});

it('remembers the workspace between sessions', async () => {
  window.localStorage.setItem('decor.workspace', 'decorbucket');
  mount();
  await waitFor(() => expect(state.workspace).toBe('decorbucket'));
});

it('keeps the token and the workspace on sign-in', async () => {
  login.mockResolvedValue({ accessToken: 'tok', user: { name: 'Nakul', permissions: [] } });
  mount();
  await screen.findByText('signed out');
  await act(() => state.signIn('decorbucket', 'ADMIN', 'admin123'));

  expect(saveToken).toHaveBeenCalledWith('tok');
  expect(window.localStorage.getItem('decor.workspace')).toBe('decorbucket');
  expect(push).toHaveBeenCalledWith('/');
  await screen.findByText('Nakul');
});

it('sends a platform admin to the platform screens', async () => {
  platformLogin.mockResolvedValue({
    accessToken: 'ptok',
    user: { name: 'Ops', isPlatform: true, permissions: [] },
  });
  mount();
  await screen.findByText('signed out');
  await act(() => state.signInAsPlatform('ops@example.com', 'pw'));
  expect(push).toHaveBeenCalledWith('/platform/tenants');
});

it('keeps the workspace after sign-out', async () => {
  window.localStorage.setItem('decor.workspace', 'decorbucket');
  storedToken = 'tok';
  me.mockResolvedValue({ name: 'Nakul', permissions: [] });
  mount();
  await screen.findByText('Nakul');

  act(() => state.signOut());
  // The next person at this desk is almost always from the same shop.
  expect(clearToken).toHaveBeenCalled();
  expect(window.localStorage.getItem('decor.workspace')).toBe('decorbucket');
  expect(push).toHaveBeenCalledWith('/login');
  await screen.findByText('signed out');
});

it('forgets the workspace when a browser moves between businesses', async () => {
  window.localStorage.setItem('decor.workspace', 'decorbucket');
  mount();
  await waitFor(() => expect(state.workspace).toBe('decorbucket'));
  act(() => state.forgetWorkspace());
  expect(window.localStorage.getItem('decor.workspace')).toBeNull();
  expect(state.workspace).toBeNull();
});

describe('can', () => {
  it('is false for everyone before sign-in', async () => {
    mount();
    await screen.findByText('signed out');
    expect(state.can('order.view')).toBe(false);
  });

  it('answers from the permissions on the token, not a role name', async () => {
    storedToken = 'tok';
    me.mockResolvedValue({ name: 'Ravi', permissions: ['order.view'] });
    mount();
    await screen.findByText('Ravi');
    expect(state.can('order.view')).toBe(true);
    expect(state.can('disbursement.manage')).toBe(false);
  });

  it('copes with a user carrying no permissions at all', async () => {
    storedToken = 'tok';
    me.mockResolvedValue({ name: 'Ravi' });
    mount();
    await screen.findByText('Ravi');
    expect(state.can('order.view')).toBe(false);
  });
});

it('refuses to be used outside the provider', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => render(<Probe />)).toThrow(/useAuth must be used inside AuthProvider/);
  spy.mockRestore();
});
