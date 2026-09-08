module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.after-env.js'],
  testMatch: ['<rootDir>/src/**/*.spec.{ts,tsx}'],
  moduleNameMapper: {
    '^@decor/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    // See the file: Reanimated's own entry point installs worklets into a JSI
    // runtime Jest has no way to provide, and its shipped mock imports it too.
    '^react-native-reanimated$': '<rootDir>/test/reanimated-mock.js',
    // Reaches into the native runtime through expo-modules-core, which Jest
    // cannot provide. See the file.
    '^expo-updates$': '<rootDir>/test/expo-updates-mock.js',
  },
  transformIgnorePatterns: [
    // Expo's packages ship untranspiled ESM on purpose — babel-preset-expo is
    // what turns them into something Jest can load, so they must not be
    // ignored the way the rest of node_modules is.
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-.*|expo|expo-.*|@expo/.*)/)',
  ],
};
