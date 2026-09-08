import { Platform } from 'react-native';

/**
 * The module picks a host at import time from `Platform.select`, which the
 * React Native jest preset pins to iOS — so the platform branch is chosen here
 * rather than by setting `Platform.OS`, which that preset ignores.
 */
function loadFor(os: 'ios' | 'android') {
  jest.resetModules();
  Platform.OS = os;
  jest
    .spyOn(Platform, 'select')
    .mockImplementation((spec: Record<string, unknown>) => spec[os] ?? spec.default);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./client') as typeof import('./client');
}

afterEach(() => {
  jest.restoreAllMocks();
  Platform.OS = 'ios';
});

it('reaches the host machine on the Android emulator’s own address', () => {
  // An emulator cannot see localhost — that is the emulator itself.
  expect(loadFor('android').API_BASE_URL).toBe('http://10.0.2.2:3001/api');
});

it('uses localhost everywhere else', () => {
  expect(loadFor('ios').API_BASE_URL).toBe('http://localhost:3001/api');
});

it('points the client at that base', () => {
  const { api, API_BASE_URL } = loadFor('ios');
  expect(api.baseUrl).toBe(API_BASE_URL);
});

it('does nothing on a 401 until somebody is listening', () => {
  const { api } = loadFor('ios');
  const handler = (api as unknown as { options: { onUnauthorized: () => void } }).options
    .onUnauthorized;
  // The auth provider installs the handler; before it mounts there is nothing
  // to sign out, and this must not throw.
  expect(() => handler()).not.toThrow();
});

it('signs the user out through whatever handler was installed', () => {
  const { api, setUnauthorizedHandler } = loadFor('ios');
  const onUnauthorized = jest.fn();
  setUnauthorizedHandler(onUnauthorized);
  (api as unknown as { options: { onUnauthorized: () => void } }).options.onUnauthorized();
  expect(onUnauthorized).toHaveBeenCalled();
});

it('lets the handler be replaced', () => {
  const { api, setUnauthorizedHandler } = loadFor('ios');
  const first = jest.fn();
  const second = jest.fn();
  setUnauthorizedHandler(first);
  setUnauthorizedHandler(second);
  (api as unknown as { options: { onUnauthorized: () => void } }).options.onUnauthorized();
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalled();
});
