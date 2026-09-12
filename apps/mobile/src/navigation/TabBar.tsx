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
import { useAuth } from '../auth/AuthContext';
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
 * What sits in the bar, left to right.
 *
 * Written out rather than taken from the navigator's own order: the middle slot
 * is a raised button rather than a tab, and the last is not a tab at all but
 * the way into everything an admin configures.
 */
const ROW = ['Home', 'Orders', 'centre', 'Leads', 'settings'] as const;

/**
 * The floating tab bar.
 *
 * Four tabs with a raised action in the middle. Search sits there because it is
 * the thing reached most often with a thumb and from anywhere — punching is
 * still a tap away on the home card, and still its own route, so a half-filled
 * punch survives going elsewhere and coming back.
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const routeFor = (name: string) => state.routes.find((route) => route.name === name);
  const search = routeFor('Search');

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <Neumorph radius={radius.xxl} size="lg" contentStyle={styles.bar}>
        {ROW.map((slot) => {
          if (slot === 'centre') return <View key="centre" style={styles.centerSlot} />;

          if (slot === 'settings') {
            return (
              <Tab
                key="settings"
                testID="tab-settings"
                icon={isAdmin ? 'tune' : 'settings'}
                label={isAdmin ? 'More' : 'Settings'}
                focused={false}
                onPress={() => {
                  haptic('impactLight');
                  // Not a tab: it opens the stack, over whichever tab is showing.
                  navigation.navigate(isAdmin ? 'Admin' : 'Settings');
                }}
              />
            );
          }

          const route = routeFor(slot);
          if (!route) return null;
          const focused = state.routes[state.index]?.key === route.key;
          const { options } = descriptors[route.key];

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

      <CentreButton
        focused={search ? state.routes[state.index]?.key === search.key : false}
        onPress={() => {
          haptic('impactMedium');
          navigation.navigate('Search');
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
  testID,
}: {
  icon: IconName;
  label: string;
  focused: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const lift = useSharedValue(focused ? 1 : 0);

  /*
   * Animated in an effect, never during render.
   *
   * This was a bare `lift.value = withSpring(...)` in the component body.
   * Writing a shared value during render is a Reanimated anti-pattern — it
   * schedules work from a phase that is meant to be pure, and the value is
   * re-applied on every render rather than when `focused` actually changes.
   *
   * It was found while chasing a dead tab bar and is not that bug's cause:
   * the bar stayed dead with this corrected. Kept because it is right.
   */
  React.useEffect(() => {
    lift.value = withSpring(focused ? 1 : 0, motion.spring);
  }, [focused, lift]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * 3 }],
    opacity: 0.55 + lift.value * 0.45,
  }));

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.tab, animatedStyle]}
      hitSlop={6}>
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

/** The raised centre button: search, from anywhere. */
function CentreButton({ focused, onPress }: { focused: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  React.useEffect(() => {
    // Settles to a steady glow rather than pulsing for attention — search is
    // where a thumb goes by habit, not something to be sold.
    glow.value = withSequence(
      withTiming(0.8, { duration: 400 }),
      withTiming(0.55, { duration: 700 }),
    );
  }, [glow]);

  const buttonStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + glow.value * 0.35,
    transform: [{ scale: 1 + glow.value * 0.18 }],
  }));

  return (
    <View style={styles.centerWrap} pointerEvents="box-none">
      <Animated.View
        style={[styles.glow, { backgroundColor: palette.accent }, glowStyle]}
        pointerEvents="none"
      />
      <AnimatedPressable
        testID="tab-search"
        accessibilityRole="button"
        accessibilityLabel="Search"
        accessibilityState={{ selected: focused }}
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.9, motion.spring);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, motion.spring);
        }}
        style={buttonStyle}>
        <AccentSurface radius={32} contentStyle={styles.center}>
          <Icon name="search" size={26} color={palette.white} strokeWidth={2.1} />
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
  /*
   * Stretched to the bar's full height, not sized to the icon and label.
   *
   * A row with `alignItems: 'center'` sizes each child to its content, so the
   * touch target was about 39pt tall — under Apple's 44pt minimum, and short
   * of the thing a person is aiming at. Taps on the label or just under the
   * icon landed on the bar behind and did nothing, which read as a dead tab
   * bar. `alignSelf: 'stretch'` makes the target the whole slot.
   */
  tab: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
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
    // Colour applied inline: the accent is configurable at runtime and a
    // StyleSheet freezes whatever it was at import.
  },
});
