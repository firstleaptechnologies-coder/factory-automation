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
  fluid,
  labelSize,
}: {
  icon: IconName;
  label?: string;
  onPress: () => void;
  tone?: 'dark' | 'accent';
  size?: number;
  onAccentGround?: boolean;
  /** Share the row evenly instead of taking a fixed width. */
  fluid?: boolean;
  /**
   * One size for the whole row, worked out by the caller from its longest
   * label. Left off, each tile shrinks its own label to fit — which is right
   * for a tile standing alone and wrong for a row, where five labels at five
   * sizes read as a mistake.
   */
  labelSize?: number;
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
    <View style={[styles.tileWrap, fluid ? styles.tileFluid : null]}>
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
        /*
         * The label shrinks rather than clipping.
         *
         * A tile is a fifth of the card, and a single long word cannot wrap —
         * "Transactions" came out as "Transactio…", which reads as a bug. A
         * couple of points smaller on the one long label is invisible; a
         * truncated word is not.
         */
        <Text
          variant="tiny"
          tone={onAccentGround ? 'onAccent' : 'muted'}
          style={[styles.tileLabel, labelSize ? { fontSize: labelSize } : null]}
          numberOfLines={1}
          adjustsFontSizeToFit={!labelSize}
          minimumFontScale={0.75}>
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
        <RoundButton icon="back" onPress={onBack} accessibilityLabel="Back" />
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
  testID,
  accessibilityLabel,
}: {
  icon: IconName;
  onPress: () => void;
  tone?: 'dark' | 'accent';
  size?: number;
  /** These pads carry an icon and no label, so tests need a handle. */
  testID?: string;
  /**
   * What the pad does, spoken. An icon alone announces as an unlabelled
   * button, which tells somebody using a screen reader nothing at all.
   */
  accessibilityLabel?: string;
}) {
  const [pressed, setPressed] = React.useState(false);
  const body = (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.42} color={tone === 'accent' ? palette.white : palette.text} />
    </View>
  );

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
  /* Five across a phone: the fixed width overflows, so share what there is. */
  tileFluid: { width: undefined, flex: 1 },
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

/**
 * The end of a paged list: a spinner while the next page is in flight, or a
 * quiet line confirming there is nothing further. Without the second half a
 * list that has genuinely ended looks like one that failed to load more.
 */
export function ListFooter({
  loading,
  hasMore,
  shown,
  total,
  noun = 'items',
}: {
  loading: boolean;
  hasMore: boolean;
  shown: number;
  total: number;
  noun?: string;
}) {
  if (shown === 0) return null;
  return (
    <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
      {loading ? (
        <ActivityIndicator color={palette.accent} />
      ) : (
        <Text variant="tiny" tone="faint">
          {hasMore ? `${shown} of ${total} ${noun}` : `All ${total} ${noun}`}
        </Text>
      )}
    </View>
  );
}
