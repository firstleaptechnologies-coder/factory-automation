import { Platform } from 'react-native';

/**
 * The module picks a host at import time — from the channel the binary carries
 * and the platform it runs on — so both are set before the require.
 *
 * `jest.resetModules()` hands the module a fresh `expo-updates` too, which is
 * why the channel is written on that copy rather than on the one this file
 * imported.
 */
function loadFor(os: 'ios' | 'android', channel: string | null = 'development') {
  jest.resetModules();
  Platform.OS = os;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require('expo-updates') as { channel: string | null }).channel = channel;
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

/**
 * The channel is native: it comes from the binary, so an over-the-air update
 * cannot move a shop's app onto a different server.
 */
it('reads the deployment off the channel the binary carries', () => {
  expect(loadFor('ios', 'development').CHANNEL).toBe('development');
});

it('treats no channel at all as development, which is Metro', () => {
  expect(loadFor('ios', null).API_BASE_URL).toBe('http://localhost:3001/api');
});

it('refuses to fall back to a developer’s desk on an unknown channel', () => {
  // Better a build that plainly cannot reach anything than one quietly sending
  // a shop's orders to whatever is listening on somebody's laptop.
  const { API_BASE_URL } = loadFor('ios', 'not-a-deployment');
  expect(API_BASE_URL).not.toContain('localhost');
  expect(API_BASE_URL).toBe('unconfigured://not-a-deployment');
});

it('says the same for a deployment that has not been built yet', () => {
  // Staging has no server. Production has one and is not built against it yet.
  expect(loadFor('ios', 'staging').API_BASE_URL).toBe('unconfigured://staging');
});

it('sends a production build to the production server, on both platforms', () => {
  // The same host for both: only a developer's desk differs by platform.
  expect(loadFor('ios', 'production').API_BASE_URL).toBe(
    'https://api.firstleaptechnologies.in/api',
  );
  expect(loadFor('android', 'production').API_BASE_URL).toBe(
    'https://api.firstleaptechnologies.in/api',
  );
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
