/**
 * expo-updates, as far as the tests are concerned.
 *
 * The real module reaches into the native runtime through expo-modules-core,
 * which Jest has no way to provide — the same reason Reanimated is mocked
 * beside it. What the app uses is small and stable: whether updates are on,
 * the sticky rollout bucket, what is running, and the hook that says an update
 * is waiting.
 *
 * Disabled by default, which is what a development build really reports.
 */
const params = {};

module.exports = {
  isEnabled: false,
  runtimeVersion: '1',
  channel: 'development',
  manifest: null,
  getExtraParamsAsync: jest.fn(async () => ({ ...params })),
  setExtraParamAsync: jest.fn(async (key, value) => {
    params[key] = value;
  }),
  reloadAsync: jest.fn(async () => undefined),
  useUpdates: () => ({ isUpdatePending: false }),
  /** Only for tests: forget what was set. */
  __reset: () => {
    for (const key of Object.keys(params)) delete params[key];
  },
};
