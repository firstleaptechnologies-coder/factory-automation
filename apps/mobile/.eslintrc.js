module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      /*
       * Specs run under Jest, whose globals the React Native config does not
       * declare — without this every `describe` and `jest.fn()` in the suite
       * reads as an undefined variable, which buried the four real problems
       * under thirty-three imaginary ones.
       */
      files: ['**/*.spec.ts', '**/*.spec.tsx', 'test/**/*.ts', 'test/**/*.tsx', 'jest.setup.js', 'jest.after-env.js'],
      env: { jest: true },
    },
  ],
};
