import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { motion, palette, radius, spacing } from '../theme';
import { AccentSurface, Neumorph } from './Neumorph';
import { Text } from './Text';
import { Icon, IconName } from './Icon';

/**
 * Text field. The border lights up lime on focus — on a dark screen a focus
 * ring is the only reliable way to show where typing will land.
 */
export function Field({
  label,
  hint,
  error,
  icon,
  style,
  containerStyle,
  ...props
}: TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
  containerStyle?: ViewStyle;
}) {
  const focus = useSharedValue(0);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focus.value,
      [0, 1],
      [error ? palette.danger : 'transparent', palette.accent],
    ),
  }));

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <Text variant="label" tone="muted" style={styles.label}>{label}</Text>
      ) : null}
      <Neumorph variant="inset" radius={radius.lg}>
      <Animated.View style={[styles.field, borderStyle]}>
        {icon ? (
          <Icon name={icon} size={18} color={palette.textMuted} />
        ) : null}
        <TextInput
          {...props}
          placeholderTextColor={palette.textFaint}
          onFocus={(event) => {
            focus.value = withTiming(1, { duration: motion.fast });
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            focus.value = withTiming(0, { duration: motion.fast });
            props.onBlur?.(event);
          }}
          style={[styles.input, icon ? { marginLeft: spacing.sm } : null, style]}
        />
      </Animated.View>
      </Neumorph>
      {error ? (
        <Text variant="tiny" tone="danger" style={styles.hint}>{error}</Text>
      ) : hint ? (
        <Text variant="tiny" tone="faint" style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Horizontal chip picker — used everywhere a short list must be chosen from. */
export function ChipGroup<T extends { id: string; label: string; color?: string | null }>({
  label,
  options,
  value,
  onChange,
  allowClear,
}: {
  label?: string;
  options: T[];
  value?: string | null;
  onChange: (id: string | null) => void;
  allowClear?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="label" tone="muted" style={styles.label}>{label}</Text>
      ) : null}
      <View style={styles.chipRow}>
        {allowClear ? (
          <Chip label="Any" selected={!value} onPress={() => onChange(null)} />
        ) : null}
        {options.map((option) => (
          <Chip
            key={option.id}
            label={option.label}
            selected={value === option.id}
            accent={option.color}
            onPress={() => onChange(value === option.id ? null : option.id)}
          />
        ))}
      </View>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  accent,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  accent?: string | null;
}) {
  const body = (
    <View style={styles.chipLabel}>
      <Text
        variant="small"
        bold
        style={{ color: selected ? palette.white : palette.textMuted }}>
        {label}
      </Text>
    </View>
  );

  return (
    <Pressable onPress={onPress}>
      {selected ? (
        accent ? (
          <View style={[styles.chipLabel, { backgroundColor: accent, borderRadius: radius.pill }]}>
            <Text variant="small" bold style={{ color: palette.white }}>{label}</Text>
          </View>
        ) : (
          <AccentSurface radius={radius.pill} soft>{body}</AccentSurface>
        )
      ) : (
        <Neumorph radius={radius.pill} size="sm">{body}</Neumorph>
      )}
    </Pressable>
  );
}

/** A picker that opens a list — used for material, source, owner and so on. */
export function SelectField({
  label,
  placeholder = 'Select…',
  value,
  onPress,
  icon,
}: {
  label?: string;
  placeholder?: string;
  value?: string | null;
  onPress: () => void;
  icon?: IconName;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="label" tone="muted" style={styles.label}>{label}</Text>
      ) : null}
      <Pressable
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}>
        <Neumorph variant="inset" radius={radius.lg} contentStyle={styles.field}>
        {icon ? <Icon name={icon} size={18} color={palette.textMuted} /> : null}
        <Text
          variant="body"
          tone={value ? 'default' : 'faint'}
          style={[styles.input, icon ? { marginLeft: spacing.sm } : null]}
          numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        <Icon name="chevronDown" size={16} color={palette.textMuted} />
        </Neumorph>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    // Transparent until focused: the well behind supplies the shape, and a
    // ring only appears to show where typing lands.
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  input: { flex: 1, color: palette.text, fontSize: 15, fontWeight: '500', paddingVertical: 14 },
  hint: { marginTop: spacing.xs, marginLeft: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chipLabel: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2 },
});
