/**
 * The token store. Everything here is about a page refresh not signing the
 * user out — the failure this module exists to prevent.
 */
const TOKEN_KEY = 'fas.token';

function loadModule() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./api') as typeof import('./api');
}

beforeEach(() => {
  window.localStorage.clear();
  jest.resetModules();
});

it('restores the token at module load, before any component renders', () => {
  window.localStorage.setItem(TOKEN_KEY, 'saved-token');
  const { api } = loadModule();
  // An effect would run too late: a page's own hook fires first and would be
  // bounced to the login screen.
  expect(api.getToken()).toBe('saved-token');
});

it('starts with no token when nothing was stored', () => {
  const { api } = loadModule();
  expect(api.getToken()).toBeNull();
});

it('saves a token to both the client and storage', () => {
  const { api, saveToken } = loadModule();
  saveToken('tok');
  expect(api.getToken()).toBe('tok');
  expect(window.localStorage.getItem(TOKEN_KEY)).toBe('tok');
});

it('clears both on sign-out', () => {
  const { api, saveToken, clearToken } = loadModule();
  saveToken('tok');
  clearToken();
  expect(api.getToken()).toBeNull();
  expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
});

it('loadToken re-arms the client from storage', () => {
  const { api, loadToken } = loadModule();
  window.localStorage.setItem(TOKEN_KEY, 'later');
  expect(loadToken()).toBe('later');
  expect(api.getToken()).toBe('later');
});

it('loadToken reports nothing without touching the client', () => {
  const { loadToken } = loadModule();
  expect(loadToken()).toBeNull();
});

describe('the 401 handler', () => {
  it('drops the stored token, which is no longer valid either way', () => {
    window.localStorage.setItem(TOKEN_KEY, 'stale');
    const { handleUnauthorized } = loadModule();
    window.history.pushState({}, '', '/login');
    handleUnauthorized();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('sends a signed-out user to the login screen', () => {
    const { redirectAfterUnauthorized } = loadModule();
    expect(redirectAfterUnauthorized('/orders')).toBe('/login');
    expect(redirectAfterUnauthorized('/')).toBe('/login');
  });

  it('leaves a user already on the login screen where they are', () => {
    // Reloading it would lose whatever they had just typed.
    const { redirectAfterUnauthorized } = loadModule();
    expect(redirectAfterUnauthorized('/login')).toBeNull();
  });

  it('is what the API client calls on a 401', () => {
    const { api, handleUnauthorized } = loadModule();
    expect(
      (api as unknown as { options: { onUnauthorized: unknown } }).options.onUnauthorized,
    ).toBe(handleUnauthorized);
  });
});
