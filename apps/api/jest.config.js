/**
 * Plain ts-jest. The API's logic is ordinary TypeScript, so no Nest test
 * harness is needed for the parts worth testing hardest — the money.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.spec.ts'],
  // DTOs carry class-validator decorators, which need the metadata polyfill.
  setupFiles: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@fas/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          // Prisma's generated types only resolve under full strict mode —
          // with it off, `create({ data })` collapses to `never`. So the specs
          // compile exactly the way the build does.
          strict: true,
          strictPropertyInitialization: false,
          skipLibCheck: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          target: 'ES2021',
        },
      },
    ],
  },
};
