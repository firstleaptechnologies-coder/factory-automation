import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import {colors, font, radius, spacing, statusColor} from '../theme';

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({pressed}) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

export function StatusPill({status}: {status: string}) {
  const background = statusColor[status] ?? colors.idle;
  return (
    <View style={[styles.pill, {backgroundColor: background}]}>
      <Text style={styles.pillText}>{status.replace(/_/g, ' ')}</Text>
    </View>
  );
}

/** Deliberately tall: these get tapped with gloves on. */
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const background = {
    primary: colors.primary,
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    ghost: 'transparent',
  }[variant];

  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({pressed}) => [
        styles.button,
        {backgroundColor: background},
        variant === 'ghost' && styles.buttonGhost,
        isDisabled && styles.buttonDisabled,
        pressed && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Text style={styles.buttonText}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const color = {
    default: colors.text,
    warning: colors.warning,
    danger: colors.danger,
    success: colors.success,
  }[tone ?? 'default'];

  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, {color}]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={styles.rowValue}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

export function EmptyState({message}: {message: string}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

export function Loader() {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  pressed: {opacity: 0.75},
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: font.tiny,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  button: {
    minHeight: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonGhost: {borderWidth: 1, borderColor: colors.border},
  buttonDisabled: {opacity: 0.45},
  buttonText: {color: '#FFFFFF', fontSize: font.body, fontWeight: '700'},
  stat: {flex: 1, minWidth: 90},
  statValue: {fontSize: font.h2, fontWeight: '800'},
  statLabel: {color: colors.textMuted, fontSize: font.tiny, marginTop: 2},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  rowLabel: {color: colors.textMuted, fontSize: font.small},
  rowValue: {color: colors.text, fontSize: font.small, fontWeight: '600'},
  empty: {padding: spacing.xl, alignItems: 'center'},
  emptyText: {color: colors.textMuted, fontSize: font.body, textAlign: 'center'},
});
