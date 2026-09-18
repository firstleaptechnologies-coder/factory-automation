module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.after-env.js'],
  testMatch: ['<rootDir>/src/**/*.spec.{ts,tsx}'],
  moduleNameMapper: {
    '^@fas/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    // See the file: Reanimated's own entry point installs worklets into a JSI
    // runtime Jest has no way to provide, and its shipped mock imports it too.
    '^react-native-reanimated$': '<rootDir>/test/reanimated-mock.js',
    // Reaches into the native runtime through expo-modules-core, which Jest
    // cannot provide. See the file.
    '^expo-updates$': '<rootDir>/test/expo-updates-mock.js',
    // Reads the binary's own version numbers, through the same native runtime.
    '^expo-application$': '<rootDir>/test/expo-application-mock.js',
    /*
     * Babel compiles @fas/shared from source — the files live in
     * packages/shared/src, outside this project — and emits
     * require('@babel/runtime/helpers/...') into what it produces. Node then
     * resolves that by walking up from *that file's* directory: past
     * packages/shared, past packages, into the repository root. The root
     * install is where it finds one.
     *
     * CI's mobile job deliberately does not run the root install, so on CI
     * there is nothing there and forty suites fail to load with "Cannot find
     * module '@babel/runtime/helpers/interopRequireDefault'". It passes on a
     * developer machine, where the root install exists for the other three
     * workspaces — so nothing local can catch it, and it failed only after
     * being pushed.
     *
     * Pointing at this project's own copy makes the mobile suite genuinely
     * independent of the root install, which is what its CI job already claims
     * to be.
     */
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
  },
  transformIgnorePatterns: [
    // Expo's packages ship untranspiled ESM on purpose — babel-preset-expo is
    // what turns them into something Jest can load, so they must not be
    // ignored the way the rest of node_modules is.
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-.*|expo|expo-.*|@expo/.*)/)',
  ],
};
