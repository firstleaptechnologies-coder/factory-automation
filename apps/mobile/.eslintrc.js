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
      files: [
        '**/*.spec.ts',
        '**/*.spec.tsx',
        // The stand-ins the suite runs against live here too, and they are
        // written with jest's own globals.
        'test/**/*.ts',
        'test/**/*.tsx',
        'test/**/*.js',
        'jest.setup.js',
        'jest.after-env.js',
      ],
      env: { jest: true },
    },
  ],
};
