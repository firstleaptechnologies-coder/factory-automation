import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { motion, palette, radius, spacing } from '../theme';
import { AccentSurface, Neumorph } from '../ui/Neumorph';
import { Icon, IconName } from '../ui/Icon';
import { Text } from '../ui/Text';
import { haptic } from '../ui/Button';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TAB_ICONS: Record<string, IconName> = {
  Home: 'home',
  Orders: 'clipboard',
  Leads: 'trend',
  Search: 'search',
};

/**
 * The floating tab bar.
 *
 * Four tabs with a raised lime action in the middle. That centre button is not
 * a tab — it is the punch action, which is the thing this app exists to do and
 * deserves to be reachable from anywhere with a thumb.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <Neumorph radius={radius.xxl} size="lg" contentStyle={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];

          // The punch action sits in the middle of the row.
          if (route.name === 'PunchTab') {
            return <View key={route.key} style={styles.centerSlot} />;
          }

          return (
            <Tab
              key={route.key}
              icon={TAB_ICONS[route.name] ?? 'home'}
              label={options.title ?? route.name}
              focused={focused}
              onPress={() => {
                haptic('impactLight');
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            />
          );
        })}
      </Neumorph>

      <PunchButton
        onPress={() => {
          haptic('impactMedium');
          navigation.navigate('PunchTab');
        }}
      />
    </View>
  );
}

function Tab({
  icon,
  label,
  focused,
  onPress,
}: {
  icon: IconName;
  label: string;
  focused: boolean;
  onPress: () => void;
}) {
  const lift = useSharedValue(focused ? 1 : 0);
  lift.value = withSpring(focused ? 1 : 0, motion.spring);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * 3 }],
    opacity: 0.55 + lift.value * 0.45,
  }));

  return (
    <AnimatedPressable onPress={onPress} style={[styles.tab, animatedStyle]} hitSlop={6}>
      <Icon name={icon} size={22} color={focused ? palette.accent : palette.textMuted} />
      <Text
        variant="micro"
        bold
        style={{ color: focused ? palette.accent : palette.textMuted, marginTop: 4 }}>
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/** The raised centre button. It pulses once on mount so it is noticed. */
function PunchButton({ onPress }: { onPress: () => void }) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  React.useEffect(() => {
    glow.value = withSequence(
      withTiming(1, { duration: 600 }),
      withTiming(0.55, { duration: 900 }),
    );
  }, [glow]);

  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + glow.value * 0.35,
    transform: [{ scale: 1 + glow.value * 0.18 }],
  }));

  return (
    <View style={styles.centerWrap} pointerEvents="box-none">
      <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none" />
      <AnimatedPressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.9, motion.spring);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.spring);
        }}
        style={buttonStyle}>
        <AccentSurface radius={32} contentStyle={styles.center}>
          <Icon name="scan" size={26} color={palette.white} strokeWidth={2.1} />
        </AccentSurface>
      </AnimatedPressable>
    </View>
  );
}

const BAR_HEIGHT = 66;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BAR_HEIGHT,
    paddingHorizontal: spacing.sm,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerSlot: { width: 78 },
  centerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -18,
    alignItems: 'center',
  },
  center: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  glow: {
    position: 'absolute',
    top: 0,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.accent,
  },
});
