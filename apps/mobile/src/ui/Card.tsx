import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { motion, radius as R, spacing } from '../theme';
import { AccentSurface, Neumorph } from './Neumorph';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Cards come in two tones only: `accent` for the one thing that matters on a
 * screen, `dark` for everything else. On press a card sinks slightly — the
 * neumorphic equivalent of a button going down.
 */
export function Card({
  children,
  tone = 'dark',
  onPress,
  style,
  padded = true,
  radius = R.xl,
}: {
  children: React.ReactNode;
  tone?: 'accent' | 'dark' | 'raised' | 'inset';
  onPress?: () => void;
  style?: ViewStyle;
  padded?: boolean;
  radius?: number;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // A neumorphic surface is three nested views: shadow, highlight, content.
  // Callers pass one `style` and expect it to behave like a plain View's, so
  // split it — outer positioning stays outside, everything that lays out the
  // children goes on the content. Without this, `flexDirection: 'row'` would
  // land on the shadow wrapper and the card's contents would stack.
  const { outer, inner } = splitStyle(style);
  const contentStyle: ViewStyle = { ...(padded ? { padding: spacing.lg } : {}), ...inner };

  const surface =
    tone === 'accent' ? (
      <AccentSurface radius={radius} style={outer} contentStyle={contentStyle}>
        {children}
      </AccentSurface>
    ) : (
      <Neumorph
        variant={tone === 'inset' ? 'inset' : 'raised'}
        radius={radius}
        size="md"
        style={outer}
        contentStyle={contentStyle}>
        {children}
      </Neumorph>
    );

  if (!onPress) return surface;

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.975, motion.spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring);
      }}
      style={animatedStyle}>
      {surface}
    </AnimatedPressable>
  );
}

/** Keys that position the card itself rather than lay out its children. */
const OUTER_KEYS = new Set([
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'alignSelf', 'flex', 'width',
  'maxWidth', 'minWidth', 'position', 'top', 'bottom', 'left', 'right', 'zIndex',
]);

function splitStyle(style?: ViewStyle): { outer: ViewStyle; inner: ViewStyle } {
  if (!style) return { outer: {}, inner: {} };
  const flat = StyleSheet.flatten(style) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    (OUTER_KEYS.has(key) ? outer : inner)[key] = value;
  }
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}
