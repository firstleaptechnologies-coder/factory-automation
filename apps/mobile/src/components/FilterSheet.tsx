import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Sheet, Text, WheelOption, WheelPicker } from '../ui';
import { spacing } from '../theme';

export interface FilterDimension {
  /** Matches the key in the value map handed back on apply. */
  key: string;
  label: string;
  options: WheelOption[];
}

/**
 * The one filter UI, everywhere.
 *
 * Every filterable list in the product opens this: a wheel per dimension, set
 * one after another, then applied in a single go. Nothing is filtered until
 * Apply is pressed, so a list does not thrash and re-fetch while somebody is
 * still deciding — and there is an obvious way to back out having changed
 * nothing.
 *
 * The wheel is ours rather than the platform's, so a filter looks and behaves
 * the same on an iPhone, on an Android and on the web.
 */
export function FilterSheet({
  visible,
  onClose,
  dimensions,
  value,
  onApply,
  title = 'Filter',
}: {
  visible: boolean;
  onClose: () => void;
  dimensions: FilterDimension[];
  /** Current applied filters, keyed by dimension. */
  value: Record<string, string | null>;
  onApply: (next: Record<string, string | null>) => void;
  title?: string;
}) {
  const [draft, setDraft] = useState(value);

  /*
   * Reopening shows what is actually applied, not whatever was abandoned last
   * time the sheet was dismissed — but only on the way in.
   *
   * Every caller passes `value` as an object literal, so its identity changes
   * on each render of the list behind the sheet. Reacting to that identity put
   * the applied filters back over whatever had just been spun; the wheel then
   * scrolled itself to match, which re-rendered, which reset the draft again.
   * The two fought each other frame after frame — the flicker where the wheel
   * and the button flipped between a chosen stage and "Show everything".
   */
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) setDraft(value);
    wasVisible.current = visible;
  }, [visible, value]);

  const active = dimensions.filter((d) => draft[d.key]).length;
  const cleared = Object.fromEntries(dimensions.map((d) => [d.key, null]));

  return (
    <Sheet
      visible={visible}
      title={title}
      subtitle={
        active === 0
          ? 'Nothing filtered yet'
          : `${active} filter${active === 1 ? '' : 's'} ready to apply`
      }
      onClose={onClose}
      fullHeight={dimensions.length > 2}>
      <View style={styles.stack}>
        {dimensions.map((dimension) => (
          <WheelPicker
            key={dimension.key}
            label={dimension.label}
            options={dimension.options}
            value={draft[dimension.key] ?? null}
            onChange={(id) => setDraft((current) => ({ ...current, [dimension.key]: id }))}
          />
        ))}
      </View>

      <Text variant="tiny" tone="faint" style={styles.hint}>
        Spin each wheel to the value you want, then apply them together.
      </Text>

      <Button
        title={active === 0 ? 'Show everything' : `Apply ${active} filter${active === 1 ? '' : 's'}`}
        size="lg"
        onPress={() => {
          onApply(draft);
          onClose();
        }}
      />
      {active > 0 ? (
        <Button
          title="Clear all"
          variant="ghost"
          onPress={() => {
            setDraft(cleared);
            onApply(cleared);
            onClose();
          }}
          style={{ marginTop: spacing.sm }}
        />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  hint: { marginTop: spacing.lg, marginBottom: spacing.md, textAlign: 'center' },
});
