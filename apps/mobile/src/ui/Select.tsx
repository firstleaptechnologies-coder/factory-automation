import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { palette, radius, spacing } from '../theme';
import { Neumorph } from './Neumorph';
import { Text } from './Text';
import { Icon } from './Icon';
import { Sheet, SheetOption } from './Sheet';
import { haptic } from './Button';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  color?: string | null;
}

/**
 * A select we own, matching the web's exactly.
 *
 * The platform picker cannot be themed — iOS draws its own wheel in its own
 * colours, and Android draws something else again — so a form would look like
 * three different products depending on the device. This is the same well as
 * every other field, opening the same sheet the rest of the app uses.
 */
export function Select({
  label,
  hint,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled,
  title,
}: {
  label?: string;
  hint?: string;
  value: string | null | undefined;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Heading on the sheet. Falls back to the field's label. */
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text variant="label" tone="muted" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <View
        testID="select-trigger"
        onTouchEnd={() => {
          if (disabled) return;
          haptic('impactLight');
          setOpen(true);
        }}>
        <Neumorph variant="inset" radius={radius.lg}>
          <View style={styles.trigger}>
            {selected?.color ? (
              <View style={[styles.dot, { backgroundColor: selected.color }]} />
            ) : null}
            <Text
              variant="body"
              tone={selected ? 'default' : 'faint'}
              numberOfLines={1}
              style={styles.value}>
              {selected?.label ?? placeholder}
            </Text>
            <Icon name="chevronDown" size={16} color={palette.textMuted} />
          </View>
        </Neumorph>
      </View>

      {hint ? (
        <Text variant="tiny" tone="faint" style={styles.hint}>
          {hint}
        </Text>
      ) : null}

      <Sheet
        visible={open}
        title={title ?? label ?? 'Select'}
        onClose={() => setOpen(false)}
        fullHeight={options.length > 7}>
        {options.map((option) => (
          <SheetOption
            key={option.value}
            label={option.label}
            description={option.description}
            accent={option.color}
            selected={option.value === value}
            onPress={() => {
              onChange(option.value);
              setOpen(false);
            }}
          />
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.sm },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
  },
  value: { flex: 1, minWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  hint: { marginTop: 6 },
});
