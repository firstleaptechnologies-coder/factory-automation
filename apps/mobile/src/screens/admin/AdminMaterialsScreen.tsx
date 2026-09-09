import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import type { Material } from '@fas/shared';
import { LENGTH_UNITS, LengthUnit, UNIT_LABEL, parseLengthToMm } from '@fas/shared';
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

/** Materials and their thickness options, editable on the phone. */
export function AdminMaterialsScreen({ navigation }: { navigation: any }) {
  const materials = useApi<Material[]>(() => api.materials(true), []);
  const [sheet, setSheet] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const [thicknessFor, setThicknessFor] = useState<Material | null>(null);
  const [thicknessValue, setThicknessValue] = useState('');
  const [thicknessUnit, setThicknessUnit] = useState<LengthUnit>('MM');

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      haptic('notificationSuccess');
      materials.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!materials.data) return <Loader />;

  return (
    <Screen refreshing={materials.refreshing} onRefresh={materials.refresh}>
      <ScreenHeader
        title="Materials"
        subtitle={`${materials.data.length} configured`}
        onBack={() => navigation.goBack()}
      />

      <Button
        title="Add material"
        icon={<Icon name="plus" size={17} color={palette.textOnAccent} />}
        onPress={() => setSheet(true)}
        style={{ marginBottom: spacing.lg }}
      />

      {materials.data.map((material, index) => (
        <Animated.View
          key={material.id}
          entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}
          layout={Layout.springify()}>
          <Card tone="dark" style={styles.card}>
            <View style={styles.head}>
              <View
                style={[styles.dot, { backgroundColor: material.color ?? palette.textFaint }]}
              />
              <View style={{ flex: 1 }}>
                <Text variant="h3">{material.name}</Text>
                <Text variant="tiny" tone="muted">{material.code}</Text>
              </View>
              <Chip
                label={material.isActive ? 'Active' : 'Hidden'}
                selected={material.isActive}
                onPress={() =>
                  run(() => api.updateMaterial(material.id, { isActive: !material.isActive }))
                }
              />
            </View>

            <Text variant="label" tone="faint" style={styles.thicknessLabel}>
              Thicknesses — tap to remove
            </Text>
            <View style={styles.chipWrap}>
              {material.thicknesses.length === 0 ? (
                <Text variant="tiny" tone="faint">None yet</Text>
              ) : (
                material.thicknesses.map((t) => (
                  <Chip
                    key={t.id}
                    label={t.label ?? `${Number(t.valueMm)} mm`}
                    onPress={() =>
                      Alert.alert('Remove thickness?', 'Existing orders keep theirs.', [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () => run(() => api.removeThickness(t.id)),
                        },
                      ])
                    }
                  />
                ))
              )}
              <Chip
                label="+ Add"
                onPress={() => {
                  setThicknessFor(material);
                  setThicknessValue('');
                }}
              />
            </View>
          </Card>
        </Animated.View>
      ))}

      <Sheet visible={sheet} title="Add material" onClose={() => setSheet(false)}>
        <Field label="Code" placeholder="MDF" value={code} onChangeText={(v) => setCode(v.toUpperCase())} />
        {/* Not "MDF" again — two fields sharing one example reads as a repeat. */}
        <Field label="Name" placeholder="MDF board" value={name} onChangeText={setName} />
        <Button
          title="Add"
          loading={busy}
          disabled={!code.trim() || !name.trim()}
          onPress={() =>
            run(async () => {
              await api.createMaterial({ code: code.trim(), name: name.trim() });
              setCode('');
              setName('');
              setSheet(false);
            })
          }
        />
      </Sheet>

      <Sheet
        visible={Boolean(thicknessFor)}
        title={`Thickness for ${thicknessFor?.name ?? ''}`}
        subtitle="Type in any unit — stored in millimetres"
        onClose={() => setThicknessFor(null)}>
        <View style={styles.chipWrap}>
          {LENGTH_UNITS.filter((u) => u === 'MM' || u === 'IN').map((u) => (
            <Chip
              key={u}
              label={UNIT_LABEL[u]}
              selected={thicknessUnit === u}
              onPress={() => setThicknessUnit(u)}
            />
          ))}
        </View>
        <Field
          label="Value"
          placeholder={thicknessUnit === 'MM' ? '18' : '3/4'}
          value={thicknessValue}
          onChangeText={setThicknessValue}
          containerStyle={{ marginTop: spacing.lg }}
          hint={
            parseLengthToMm(thicknessValue, thicknessUnit) !== null
              ? `= ${parseLengthToMm(thicknessValue, thicknessUnit)} mm`
              : undefined
          }
        />
        <Button
          title="Add thickness"
          loading={busy}
          disabled={parseLengthToMm(thicknessValue, thicknessUnit) === null}
          onPress={() =>
            run(async () => {
              const mm = parseLengthToMm(thicknessValue, thicknessUnit)!;
              await api.addThickness(thicknessFor!.id, {
                value: { value: mm, unit: 'MM' },
                label: thicknessUnit === 'IN' ? `${thicknessValue} in` : undefined,
              });
              setThicknessFor(null);
            })
          }
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dot: { width: 12, height: 12, borderRadius: 6 },
  thicknessLabel: { marginTop: spacing.lg, marginBottom: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
