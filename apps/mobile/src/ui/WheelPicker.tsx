import React, { useCallback, useEffect, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  type SharedValue,
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { palette, radius, spacing } from '../theme';
import { Text } from './Text';
import { haptic } from './Button';

export interface WheelOption {
  id: string | null;
  label: string;
  /** A status or material colour, shown as a dot beside the label. */
  color?: string | null;
}

const ITEM_HEIGHT = 46;
/** Always odd, so exactly one row sits in the middle. */
const VISIBLE = 5;
const HEIGHT = ITEM_HEIGHT * VISIBLE;

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

/**
 * A scrolling wheel, the way a phone picker should feel.
 *
 * Written rather than borrowed from the platform for two reasons: iOS's own
 * picker cannot be themed and looks like a different app pasted into this one,
 * and Android has no equivalent at all — so the same list would behave
 * differently depending on the phone in someone's hand.
 *
 * The centre row is the selection. Rows fade and shrink with distance from it,
 * which is what makes a flat list read as a wheel; padding half the wheel's
 * height above and below is what lets the first and last options reach the
 * middle.
 */
export function WheelPicker({
  options,
  value,
  onChange,
  label,
}: {
  options: WheelOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
}) {
  // Typed loosely: the animated wrapper's ref type does not expose scrollTo,
  // though the underlying ScrollView has it.
  const scrollRef = useRef<{ scrollTo(options: { y: number; animated?: boolean }): void } | null>(
    null,
  );
  const offset = useSharedValue(0);
  /**
   * True from the moment a finger lands until the wheel has come fully to rest.
   *
   * A flick fires onScrollEndDrag and *then* runs momentum for another half
   * second. Treating the drag ending as the end of the gesture let the effect
   * below yank the wheel back to the old selection while it was still moving —
   * which is the jump you see when the list is scrolled fast.
   */
  const interacting = useRef(false);
  /**
   * Set while the wheel is being put somewhere by us rather than by a finger.
   *
   * `scrollTo({ animated: true })` ends in a momentum-scroll event of its own,
   * which arrives here as another gesture ending and settles the wheel again —
   * a wheel that keeps re-deciding where it is, forever.
   */
  const settling = useRef(false);

  /** -1 when the selected value is not among the options. */
  const index = options.findIndex((option) => option.id === value);

  useEffect(() => {
    if (interacting.current) return;

    // A value that is not in the list must not be quietly rewritten to the
    // first option. That is what made the wheel snap back to "Any material"
    // on its own while the sheet still counted the filter as set — the display
    // and the state had silently disagreed. Leave the wheel alone instead.
    if (index < 0) return;

    const target = index * ITEM_HEIGHT;
    // Already there. Scrolling anyway fights a wheel that is still settling.
    if (Math.abs(offset.value - target) < 1) return;

    scrollRef.current?.scrollTo({ y: target, animated: false });
    offset.value = target;
  }, [index, offset]);

  const onScroll = useAnimatedScrollHandler((event) => {
    offset.value = event.contentOffset.y;
  });

  const settle = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (settling.current) {
        settling.current = false;
        return;
      }
      interacting.current = false;

      const raw = event.nativeEvent.contentOffset.y / ITEM_HEIGHT;
      const clamped = Math.min(Math.max(Math.round(raw), 0), options.length - 1);

      // A fast flick can stop a few pixels off a row even with snapping, and it
      // can overshoot past the ends. Put the wheel exactly on the row it landed
      // nearest, so what is under the window is always what is selected.
      if (Math.abs(raw - clamped) > 0.02) {
        settling.current = true;
        scrollRef.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated: true });
      }

      const option = options[clamped];
      if (option && option.id !== value) {
        haptic('impactLight');
        onChange(option.id);
      }
    },
    [options, value, onChange],
  );

  return (
    <View>
      {label ? (
        <Text variant="label" tone="muted" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View style={styles.wrap}>
        {/* The window over the middle row. Drawn under the list and not
            touchable, so a tap still lands on the option beneath it. */}
        <View style={styles.window} pointerEvents="none" />

        <AnimatedScrollView
          ref={scrollRef as never}
          testID="wheel-scroll"
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={16}
          onScrollBeginDrag={() => {
            interacting.current = true;
          }}
          onMomentumScrollBegin={() => {
            interacting.current = true;
          }}
          onMomentumScrollEnd={settle}
          onScrollEndDrag={(event) => {
            // Only settle here when the finger stopped the wheel dead. If it was
            // flicked, momentum is about to start and will settle it instead.
            if (Math.abs(event.nativeEvent.velocity?.y ?? 0) < 0.05) settle(event);
          }}
          contentContainerStyle={{ paddingVertical: (HEIGHT - ITEM_HEIGHT) / 2 }}
          style={{ height: HEIGHT }}>
          {options.map((option, position) => (
            <WheelRow
              key={option.id ?? `any-${position}`}
              option={option}
              position={position}
              offset={offset}
              onPress={() => {
                interacting.current = false;
                settling.current = true;
                scrollRef.current?.scrollTo({ y: position * ITEM_HEIGHT, animated: true });
                if (option.id !== value) {
                  haptic('impactLight');
                  onChange(option.id);
                }
              }}
            />
          ))}
        </AnimatedScrollView>
      </View>
    </View>
  );
}

function WheelRow({
  option,
  position,
  offset,
  onPress,
}: {
  option: WheelOption;
  position: number;
  offset: SharedValue<number>;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => {
    const distance = Math.abs(offset.value / ITEM_HEIGHT - position);
    return {
      opacity: interpolate(distance, [0, 1, 2.4], [1, 0.42, 0.14], Extrapolation.CLAMP),
      transform: [
        { scale: interpolate(distance, [0, 1, 2.4], [1, 0.88, 0.78], Extrapolation.CLAMP) },
      ],
    };
  });

  return (
    <Animated.View style={[styles.row, style]} onTouchEnd={onPress}>
      {option.color ? (
        <View style={[styles.dot, { backgroundColor: option.color }]} />
      ) : null}
      <Text variant="body" bold numberOfLines={1} style={styles.rowLabel}>
        {option.label}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  wrap: {
    height: HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: palette.surfaceInset,
  },
  window: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    top: (HEIGHT - ITEM_HEIGHT) / 2,
    height: ITEM_HEIGHT,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceLit,
  },
  row: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  rowLabel: { textAlign: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

export const WHEEL_ITEM_HEIGHT = ITEM_HEIGHT;
