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
import { useClipboardSuggestion } from '../hooks/useClipboardSuggestion';
import { AccentSurface, Neumorph } from './Neumorph';
import { Text } from './Text';
import { Icon, IconName } from './Icon';

type FieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
  containerStyle?: ViewStyle;
  /**
   * Narrows what the clipboard button will offer for this field — a phone
   * field should not offer to paste an address.
   */
  pasteAccepts?: (text: string) => boolean;
  /** Off for fields where a paste makes no sense, like a password. */
  pasteable?: boolean;
};

/**
 * Text field. The border lights up lime on focus — on a dark screen a focus
 * ring is the only reliable way to show where typing will land.
 *
 * Forwards its ref to the TextInput underneath, which is what lets a form wire
 * the return key to the next field. Without that, Return on the first field of
 * a two-field form does nothing a person expects — and on the sign-in screen
 * it submitted a half-filled form instead.
 */
export const Field = React.forwardRef<TextInput, FieldProps>(function Field({
  label,
  hint,
  error,
  icon,
  style,
  containerStyle,
  pasteAccepts,
  pasteable = true,
  ...props
}, ref) {
  const focus = useSharedValue(0);
  const clipboard = useClipboardSuggestion(pasteAccepts);

  // Only offered on an empty field: over something already typed the button
  // would be an invitation to destroy it.
  const empty = !props.value;
  const showPaste =
    pasteable && empty && Boolean(clipboard.suggestion) && !props.secureTextEntry;

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
          ref={ref}
          // The label is drawn above the well; without this the input itself
          // still reaches a screen reader as an unlabelled text box.
          accessibilityLabel={label}
          {...props}
          placeholderTextColor={palette.textFaint}
          onFocus={(event) => {
            focus.value = withTiming(1, { duration: motion.fast });
            if (pasteable && !props.secureTextEntry) clipboard.check();
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            focus.value = withTiming(0, { duration: motion.fast });
            props.onBlur?.(event);
          }}
          style={[styles.input, icon ? { marginLeft: spacing.sm } : null, style]}
        />
        {showPaste ? (
          <Pressable
            onPress={() => {
              const value = clipboard.consume();
              if (value) props.onChangeText?.(value);
            }}
            hitSlop={8}
            style={styles.paste}>
            <Icon name="clipboard" size={13} color={palette.accent} />
            <Text variant="tiny" tone="accent" bold style={{ marginLeft: 4 }}>
              Paste
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
      </Neumorph>
      {showPaste ? (
        <Text variant="tiny" tone="faint" style={styles.hint} numberOfLines={1}>
          On your clipboard: {clipboard.suggestion}
        </Text>
      ) : null}
      {error ? (
        <Text variant="tiny" tone="danger" style={styles.hint}>{error}</Text>
      ) : hint ? (
        <Text variant="tiny" tone="faint" style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
});

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
  icon,
  testID,
}: {
  label: string;
  selected?: boolean;
  /**
   * Absent for a chip that shows state without setting it — a module a tier
   * already covers, say. Matches the web Chip, where it has always been
   * optional.
   */
  onPress?: () => void;
  accent?: string | null;
  /** Marks a chip that goes somewhere, rather than one that sets a value. */
  icon?: IconName;
  /** For when the same word appears on several chips on one screen. */
  testID?: string;
}) {
  const tint = selected ? palette.white : palette.textMuted;
  const body = (
    <View style={[styles.chipLabel, icon ? styles.chipWithIcon : null]}>
      {icon ? <Icon name={icon} size={13} color={tint} /> : null}
      <Text variant="small" bold style={{ color: tint }}>
        {label}
      </Text>
    </View>
  );

  return (
    <Pressable onPress={onPress} disabled={!onPress} testID={testID}>
      {selected ? (
        accent ? (
          <View
            style={[
              styles.chipLabel,
              icon ? styles.chipWithIcon : null,
              { backgroundColor: accent, borderRadius: radius.pill },
            ]}>
            {icon ? <Icon name={icon} size={13} color={palette.white} /> : null}
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
  const [, setPressed] = useState(false);
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
  paste: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,107,26,0.14)',
    marginLeft: spacing.sm,
  },
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
  chipWithIcon: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
