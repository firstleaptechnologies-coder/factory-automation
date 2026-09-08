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
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-.*)/)',
  ],
};
