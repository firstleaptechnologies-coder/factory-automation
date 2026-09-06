import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { gradients, motion, palette, radius, spacing } from '../theme';
import { Neumorph } from './Neumorph';
import { Text } from './Text';
import { Icon } from './Icon';
import { haptic } from './Button';

/**
 * Press and hold to commit.
 *
 * Punching an order writes a real record that the floor will act on, so it gets
 * a deliberate gesture rather than a tap that can happen in a pocket. The fill
 * runs on the UI thread, so it stays smooth even while the form above is
 * re-rendering, and letting go early cancels cleanly.
 */
export function HoldButton({
  title = 'Hold to punch',
  onComplete,
  disabled,
  duration = 900,
}: {
  title?: string;
  onComplete: () => void;
  disabled?: boolean;
  duration?: number;
}) {
  const progress = useSharedValue(0);
  const scale = useSharedValue(1);

  const fire = useCallback(() => {
    haptic('notificationSuccess');
    onComplete();
  }, [onComplete]);

  const start = () => {
    if (disabled) return;
    haptic('impactMedium');
    scale.value = withSpring(0.97, motion.spring);
    progress.value = withTiming(
      1,
      { duration, easing: Easing.inOut(Easing.quad) },
      (finished) => {
        if (finished) {
          runOnJS(fire)();
          progress.value = withTiming(0, { duration: 260 });
        }
      },
    );
  };

  const stop = () => {
    cancelAnimation(progress);
    scale.value = withSpring(1, motion.spring);
    progress.value = withTiming(0, { duration: 200 });
  };

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));
  const wrapStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[wrapStyle, disabled && { opacity: 0.4 }]}>
      <Pressable onPressIn={start} onPressOut={stop} disabled={disabled}>
        <Neumorph variant="inset" radius={radius.pill} contentStyle={styles.track}>
          {/* The unfilled state is a dark outline; the fill is the lime. */}
          <Animated.View style={[styles.fill, fillStyle]}>
            <LinearGradient
              colors={gradients.accent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <View style={styles.labelRow} pointerEvents="none">
            <Icon name="check" size={18} color={palette.accent} />
            <Text variant="body" bold style={styles.label}>{title}</Text>
          </View>
        </Neumorph>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.pill, overflow: 'hidden' },
  track: { height: 62, overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  // Mix-blend is not available, so the label stays lime-on-dark and reads over
  // the fill because the fill is a lighter lime behind it.
  label: { color: palette.text },
});
