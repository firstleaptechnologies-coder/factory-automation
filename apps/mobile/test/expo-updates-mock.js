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
  // Null, because `isEnabled: false` and a channel name cannot both be true:
  // the channel comes from the native updates config, and a build with updates
  // off has none. Saying 'development' here made the tests describe a build
  // that does not exist, and quietly pointed SettingsScreen at staging.
  channel: null,
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
