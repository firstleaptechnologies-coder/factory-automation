const nextJest = require('next/jest');

const createConfig = nextJest({ dir: './' });

/** Next's transform, so the tests compile exactly as the app does. */
module.exports = createConfig({
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/src/**/*.spec.{ts,tsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
});
