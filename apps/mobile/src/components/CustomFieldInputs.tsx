import React from 'react';
import { View } from 'react-native';
import type { CustomFieldDefinition } from '@fas/shared';
import { Chip, Field, Text } from '../ui';
import { spacing } from '../theme';

/**
 * Renders the admin's field definitions as inputs.
 *
 * Nothing here knows what a lead contains. The shop adds a field in the admin
 * screen and the control appears here — that is what makes the capture actually
 * configurable rather than a fixed form with spare boxes.
 */
export function CustomFieldInputs({
  definitions,
  values,
  onChange,
}: {
  definitions: CustomFieldDefinition[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}) {
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  return (
    <View>
      {definitions.map((field) => {
        const value = values[field.key];

        if (field.type === 'BOOLEAN') {
          return (
            <View key={field.id} style={{ marginBottom: spacing.lg }}>
              <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
                {field.label}{field.required ? ' *' : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Chip label="Yes" selected={value === true} onPress={() => set(field.key, true)} />
                <Chip label="No" selected={value === false} onPress={() => set(field.key, false)} />
              </View>
            </View>
          );
        }

        if (field.type === 'SELECT' || field.type === 'MULTI_SELECT') {
          const selected = Array.isArray(value) ? (value as string[]) : value ? [value as string] : [];
          const multi = field.type === 'MULTI_SELECT';
          return (
            <View key={field.id} style={{ marginBottom: spacing.lg }}>
              <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
                {field.label}{field.required ? ' *' : ''}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {field.options.map((option) => {
                  const on = selected.includes(option);
                  return (
                    <Chip
                      key={option}
                      label={option}
                      selected={on}
                      onPress={() => {
                        if (multi) {
                          set(
                            field.key,
                            on ? selected.filter((v) => v !== option) : [...selected, option],
                          );
                        } else {
                          set(field.key, on ? undefined : option);
                        }
                      }}
                    />
                  );
                })}
              </View>
            </View>
          );
        }

        return (
          <Field
            key={field.id}
            label={`${field.label}${field.required ? ' *' : ''}`}
            hint={field.helpText ?? undefined}
            placeholder={field.type === 'DATE' ? 'YYYY-MM-DD' : 'Optional'}
            value={value === undefined || value === null ? '' : String(value)}
            keyboardType={field.type === 'NUMBER' ? 'numeric' : field.type === 'PHONE' ? 'phone-pad' : 'default'}
            onChangeText={(text) => set(field.key, text || undefined)}
          />
        );
      })}
    </View>
  );
}
