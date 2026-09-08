/**
 * Runs after the test framework is installed, so it can register hooks.
 */

// One test's unfinished animation must not complete inside the next one.
afterEach(() => {
  require('react-native-reanimated').__resetAnimations();
});
