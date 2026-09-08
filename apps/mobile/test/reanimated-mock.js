/**
 * Reanimated, as far as these tests are concerned.
 *
 * The real package installs worklets into a JSI runtime Jest does not have,
 * and its own mock still imports that entry point. So the surface the app
 * actually uses is stood up here: animated components render as ordinary
 * views, shared values are plain boxes, and an animated style is evaluated
 * once so a test can read the layout it produces.
 *
 * Nothing here animates. These tests are about what a component decides, not
 * about how it moves.
 */
const React = require('react');
const { View, ScrollView, Text, Image } = require('react-native');

const identity = (value) => value;

/** Completion callbacks waiting for `__flushAnimations()`. */
const pending = [];

function createAnimatedComponent(Component) {
  return React.forwardRef((props, ref) => React.createElement(Component, { ...props, ref }));
}

const Animated = {
  View: createAnimatedComponent(View),
  ScrollView: createAnimatedComponent(ScrollView),
  Text: createAnimatedComponent(Text),
  Image: createAnimatedComponent(Image),
  createAnimatedComponent,
};

/**
 * Entering/exiting animations are inert descriptors here.
 *
 * They are written as chains — `FadeIn.duration(180).easing(...)` — so every
 * builder name has to answer with the chain again rather than undefined.
 */
const transition = () =>
  new Proxy(
    { build: () => ({}) },
    {
      get(target, key) {
        if (key === 'build') return target.build;
        return () => chainSingleton;
      },
    },
  );

const chainSingleton = transition();
const entering = new Proxy({}, { get: () => chainSingleton });

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,

  /**
   * A shared value that a test can observe.
   *
   * The real thing lives on the UI thread and moves a view without React ever
   * re-rendering, so a style driven by one is invisible to the test renderer.
   * Here the value re-renders its component when it changes, which makes
   * `useAnimatedStyle` recompute and puts the result in the tree where an
   * assertion can reach it.
   *
   * The write is ignored when the value has not actually changed — several
   * components assign a shared value during render, and re-rendering on an
   * unchanged assignment would spin forever.
   */
  useSharedValue: (initial) => {
    const [, force] = React.useReducer((n) => n + 1, 0);
    const box = React.useRef(null);
    if (box.current === null) {
      const state = { current: initial };
      box.current = {};
      Object.defineProperty(box.current, 'value', {
        get: () => state.current,
        set: (next) => {
          if (Object.is(next, state.current)) return;
          state.current = next;
          force();
        },
      });
    }
    return box.current;
  },
  // Gesture Handler builds its detector on these; they only have to exist.
  useEvent: (handler) => handler,
  useHandler: (handlers) => ({ context: {}, doDependenciesDiffer: false, useWeb: false, handlers }),
  useComposedEventHandler: (handlers) => handlers,
  useDerivedValue: (fn) => ({ value: fn() }),
  useAnimatedStyle: (fn) => fn(),
  useAnimatedProps: (fn) => fn(),
  // The component passes this straight to a ScrollView's onScroll.
  useAnimatedScrollHandler: (handlers) =>
    typeof handlers === 'function'
      ? (event) => handlers(event.nativeEvent ?? event)
      : (event) => handlers.onScroll?.(event.nativeEvent ?? event),

  /**
   * Animations finish when a test says so.
   *
   * `withTiming(to, config, done)` is how hold-to-commit knows the hold
   * completed, so the callbacks are queued rather than dropped or fired at
   * once — a test flushes them to stand for the animation running to the end,
   * and `cancelAnimation` drops them the way letting go early does.
   */
  withTiming: (value, _config, callback) => {
    if (callback) pending.push(callback);
    return value;
  },
  withSpring: identity,
  withRepeat: identity,
  withSequence: (...values) => values[values.length - 1],
  withDelay: (_delay, value) => value,
  cancelAnimation: () => {
    pending.length = 0;
  },

  /** Test-only: run every queued completion callback as if it had finished. */
  __flushAnimations: (finished = true) => {
    const queued = pending.splice(0, pending.length);
    for (const callback of queued) callback(finished);
  },

  /** Test-only: drop anything left queued, so one test cannot finish another's. */
  __resetAnimations: () => {
    pending.length = 0;
  },
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,

  interpolate: (value, input, output) => {
    // Piecewise-linear, clamped — enough for a test to assert the ends.
    if (value <= input[0]) return output[0];
    const last = input.length - 1;
    if (value >= input[last]) return output[last];
    for (let i = 1; i <= last; i += 1) {
      if (value <= input[i]) {
        const span = input[i] - input[i - 1] || 1;
        const share = (value - input[i - 1]) / span;
        return output[i - 1] + (output[i] - output[i - 1]) * share;
      }
    }
    return output[last];
  },
  interpolateColor: (_value, _input, output) => output[0],

  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  Easing: new Proxy({}, { get: () => identity }),
  Layout: transition(),
  LinearTransition: transition(),
  FadeIn: entering.FadeIn,
  FadeOut: entering.FadeOut,
  FadeInDown: entering.FadeInDown,
  FadeInRight: entering.FadeInRight,
  SlideInDown: entering.SlideInDown,
  SlideOutDown: entering.SlideOutDown,
  ZoomIn: entering.ZoomIn,
};
