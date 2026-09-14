import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { SizePreset } from '@fas/shared';
import { LENGTH_UNITS, LengthUnit, UNIT_LABEL, fromMm, parseLengthToMm } from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import {
  Button,
  Card,
  Chip,
  Field,
  Icon,
  Loader,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  haptic,
} from '../../ui';
import { palette, spacing } from '../../theme';

export function AdminSizesScreen({ navigation }: { navigation: any }) {
  const presets = useApi<SizePreset[]>(() => api.sizePresets(true), []);
  const [unit, setUnit] = useState<LengthUnit>('FT');
  const [sheet, setSheet] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', length: '', width: '', thickness: '' });
  const [busy, setBusy] = useState(false);

  const lengthMm = parseLengthToMm(form.length, unit);
  const widthMm = parseLengthToMm(form.width, unit);

  const create = async () => {
    if (lengthMm === null || widthMm === null) return;
    setBusy(true);
    try {
      const thicknessMm = form.thickness ? parseLengthToMm(form.thickness, 'MM') : null;
      await api.createSizePreset({
        code: form.code.trim(),
        name: form.name.trim(),
        length: { value: lengthMm, unit: 'MM' },
        width: { value: widthMm, unit: 'MM' },
        thickness: thicknessMm !== null ? { value: thicknessMm, unit: 'MM' } : undefined,
      });
      haptic('notificationSuccess');
      setForm({ code: '', name: '', length: '', width: '', thickness: '' });
      setSheet(false);
      presets.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!presets.data) return <Loader />;

  return (
    <Screen refreshing={presets.refreshing} onRefresh={presets.refresh}>
      <ScreenHeader
        title="Size presets"
        subtitle={`${presets.data.length} configured`}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.unitRow}>
        <Text variant="label" tone="faint">Show in</Text>
        {LENGTH_UNITS.map((u) => (
          <Chip key={u} label={UNIT_LABEL[u]} selected={unit === u} onPress={() => setUnit(u)} />
        ))}
      </View>

      <Button
        title="Add size"
        icon={<Icon name="plus" size={17} color={palette.textOnAccent} />}
        onPress={() => setSheet(true)}
        style={{ marginBottom: spacing.lg }}
      />

      {presets.data.map((preset, index) => (
        <Animated.View key={preset.id} entering={FadeInDown.delay(index * 40).duration(300)}>
          <Card tone="dark" style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text variant="h3">{preset.name}</Text>
              <Text variant="tiny" tone="muted">{preset.code}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="body" bold tone="accent">
                {fromMm(Number(preset.lengthMm), unit)} × {fromMm(Number(preset.widthMm), unit)}{' '}
                {UNIT_LABEL[unit]}
              </Text>
              <Text variant="micro" tone="faint">
                {Number(preset.lengthMm)} × {Number(preset.widthMm)} mm
              </Text>
            </View>
          </Card>
        </Animated.View>
      ))}

      <Sheet
        visible={sheet}
        title="Add a size"
        subtitle="Type in any unit — stored in millimetres"
        onClose={() => setSheet(false)}>
        <View style={styles.chipWrap}>
          {LENGTH_UNITS.map((u) => (
            <Chip key={u} label={UNIT_LABEL[u]} selected={unit === u} onPress={() => setUnit(u)} />
          ))}
        </View>
        <Field
          label="Code"
          placeholder="SHEET-8X4"
          value={form.code}
          onChangeText={(v) => setForm((current) => ({ ...current, code: v.toUpperCase() }))}
          containerStyle={{ marginTop: spacing.lg }}
        />
        <Field
          label="Name"
          placeholder="8 × 4 ft sheet"
          value={form.name}
          onChangeText={(v) => setForm((current) => ({ ...current, name: v }))}
        />
        <View style={styles.row}>
          <Field
            label={`Length (${UNIT_LABEL[unit]})`}
            value={form.length}
            onChangeText={(v) => setForm((current) => ({ ...current, length: v }))}
            keyboardType="decimal-pad"
            containerStyle={{ flex: 1, marginRight: spacing.md }}
            hint={lengthMm !== null ? `${lengthMm} mm` : undefined}
          />
          <Field
            label={`Width (${UNIT_LABEL[unit]})`}
            value={form.width}
            onChangeText={(v) => setForm((current) => ({ ...current, width: v }))}
            keyboardType="decimal-pad"
            containerStyle={{ flex: 1 }}
            hint={widthMm !== null ? `${widthMm} mm` : undefined}
          />
        </View>
        <Field
          label="Thickness (mm, optional)"
          value={form.thickness}
          onChangeText={(v) => setForm((current) => ({ ...current, thickness: v }))}
          keyboardType="decimal-pad"
        />
        <Button
          title="Add size"
          loading={busy}
          disabled={!form.code.trim() || !form.name.trim() || lengthMm === null || widthMm === null}
          onPress={create}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row' },
});
