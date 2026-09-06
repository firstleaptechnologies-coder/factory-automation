import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { motion, palette, radius as R, readableOn, spacing } from '../theme';
import { Text } from './Text';
import { Icon, IconName } from './Icon';
import { haptic } from './Button';
import { AccentSurface, Neumorph } from './Neumorph';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Square action pad. Raised at rest, pressed in on touch. */
export function IconTile({
  icon,
  label,
  onPress,
  tone = 'dark',
  size = 58,
  /** Set when the tile sits on the accent card, where grey text disappears. */
  onAccentGround,
}: {
  icon: IconName;
  label?: string;
  onPress: () => void;
  tone?: 'dark' | 'accent';
  size?: number;
  onAccentGround?: boolean;
}) {
  const scale = useSharedValue(1);
  const [pressed, setPressed] = React.useState(false);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const glyph = (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Icon
        name={icon}
        color={tone === 'accent' ? palette.white : palette.text}
        size={size * 0.38}
      />
    </View>
  );

  return (
    <View style={styles.tileWrap}>
      <AnimatedPressable
        onPress={() => {
          haptic('impactLight');
          onPress();
        }}
        onPressIn={() => {
          setPressed(true);
          scale.value = withSpring(0.94, motion.spring);
        }}
        onPressOut={() => {
          setPressed(false);
          scale.value = withSpring(1, motion.spring);
        }}
        style={animatedStyle}>
        {tone === 'accent' ? (
          <AccentSurface radius={R.lg} soft={pressed}>{glyph}</AccentSurface>
        ) : (
          <Neumorph variant={pressed ? 'inset' : 'raised'} radius={R.lg} size="sm">
            {glyph}
          </Neumorph>
        )}
      </AnimatedPressable>
      {label ? (
        <Text
          variant="tiny"
          tone={onAccentGround ? 'onAccent' : 'muted'}
          style={styles.tileLabel}
          numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export function Avatar({
  name,
  size = 44,
  tone = 'accent',
}: {
  name?: string | null;
  size?: number;
  tone?: 'accent' | 'dark';
}) {
  const initials = (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const body = (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Text
        bold
        style={{
          fontSize: size * 0.36,
          color: tone === 'accent' ? palette.white : palette.accent,
        }}>
        {initials}
      </Text>
    </View>
  );

  return tone === 'accent' ? (
    <AccentSurface radius={size / 2}>{body}</AccentSurface>
  ) : (
    <Neumorph radius={size / 2} size="sm">{body}</Neumorph>
  );
}

/** Status chip. Colour comes from the workflow the admin configured. */
export function Pill({
  label,
  color,
  small,
}: {
  label: string;
  color?: string | null;
  small?: boolean;
}) {
  const background = color ?? palette.surfaceLit;
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: background },
        small && { paddingHorizontal: spacing.sm, paddingVertical: 3 },
      ]}>
      <Text bold style={{ color: readableOn(background), fontSize: small ? 10 : 11 }}>
        {label}
      </Text>
    </View>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  style,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <Text variant="h3">{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.sectionAction} hitSlop={8}>
          <Text variant="small" tone="muted">{actionLabel}</Text>
          <Icon name="chevronRight" size={14} color={palette.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Loader({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={palette.accent} size="large" />
      {label ? (
        <Text variant="small" tone="muted" style={{ marginTop: spacing.md }}>{label}</Text>
      ) : null}
    </View>
  );
}

export function EmptyState({
  icon = 'box',
  title,
  message,
}: {
  icon?: IconName;
  title: string;
  message?: string;
}) {
  return (
    <Animated.View entering={FadeInDown.duration(motion.base)} style={styles.center}>
      <Neumorph variant="inset" radius={R.lg} contentStyle={styles.emptyIcon}>
        <Icon name={icon} size={26} color={palette.textFaint} />
      </Neumorph>
      <Text variant="h3" tone="muted" style={{ marginTop: spacing.md }}>{title}</Text>
      {message ? (
        <Text variant="small" tone="faint" style={styles.emptyMessage}>{message}</Text>
      ) : null}
    </Animated.View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <RoundButton icon="back" onPress={onBack} />
      ) : (
        <View style={{ width: 46 }} />
      )}
      <View style={styles.headerCenter}>
        <Text variant="h3" numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text variant="tiny" tone="muted" numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      {right ?? <View style={{ width: 46 }} />}
    </View>
  );
}

/** The round pads used in headers — the reference's signature control. */
export function RoundButton({
  icon,
  onPress,
  tone = 'dark',
  size = 46,
}: {
  icon: IconName;
  onPress: () => void;
  tone?: 'dark' | 'accent';
  size?: number;
}) {
  const [pressed, setPressed] = React.useState(false);
  const body = (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.42} color={tone === 'accent' ? palette.white : palette.text} />
    </View>
  );

  return (
    <Pressable
      onPress={() => {
        haptic('impactLight');
        onPress();
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      hitSlop={6}>
      {tone === 'accent' ? (
        <AccentSurface radius={size / 2} soft={pressed}>{body}</AccentSurface>
      ) : (
        <Neumorph variant={pressed ? 'inset' : 'raised'} radius={size / 2} size="sm">
          {body}
        </Neumorph>
      )}
    </Pressable>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[styles.divider, style]} />;
}

const styles = StyleSheet.create({
  tileWrap: { alignItems: 'center', width: 74 },
  tileLabel: { marginTop: spacing.sm, textAlign: 'center' },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: R.pill,
    alignSelf: 'flex-start',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  emptyIcon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  emptyMessage: { marginTop: spacing.xs, textAlign: 'center', paddingHorizontal: spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.3)', marginVertical: spacing.md },
});
