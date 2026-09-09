import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Lead, Material } from '@fas/shared';
import { LENGTH_UNITS, UNIT_LABEL, parseLengthToMm } from '@fas/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useDisplayUnit } from '../hooks/useUnit';
import {
  Button,
  Card,
  Chip,
  Field,
  HoldButton,
  Icon,
  Loader,
  Screen,
  ScreenHeader,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';

interface Draft {
  key: string;
  length: string;
  width: string;
  materialId: string;
  thicknessId: string;
  quantity: string;
}

const blank = (): Draft => ({
  key: Math.random().toString(36).slice(2),
  length: '',
  width: '',
  materialId: '',
  thicknessId: '',
  quantity: '1',
});

/**
 * Converting an enquiry into work.
 *
 * A lead has no dimensions — that is the difference between an enquiry and an
 * order — so this is where they are collected. The client comes across
 * automatically; if the lead was only a name and a phone, that becomes a real
 * client at this moment.
 */
export function LeadConvertScreen({ route, navigation }: { route: any; navigation: any }) {
  const { leadId } = route.params as { leadId: string };
  const [unit, setUnit] = useDisplayUnit();
  const [items, setItems] = useState<Draft[]>([blank()]);
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const materials = useApi<Material[]>(() => api.materials(), []);
  const lead = useApi<Lead>(() => api.lead(leadId), [leadId]);

  if (lead.data && !seeded) {
    if (lead.data.location) setLocation(lead.data.location);
    setSeeded(true);
  }

  const patch = (key: string, changes: Partial<Draft>) =>
    setItems((rows) => rows.map((row) => (row.key === key ? { ...row, ...changes } : row)));

  const ready =
    location.trim().length > 0 &&
    items.every(
      (item) =>
        item.materialId &&
        parseLengthToMm(item.length, unit) !== null &&
        parseLengthToMm(item.width, unit) !== null,
    );

  const submit = async () => {
    setBusy(true);
    try {
      const result = await api.convertLead(leadId, {
        location: location.trim(),
        items: items.map((item) => ({
          length: { value: parseLengthToMm(item.length, unit)!, unit: 'MM' },
          width: { value: parseLengthToMm(item.width, unit)!, unit: 'MM' },
          materialId: item.materialId,
          materialThicknessId: item.thicknessId || undefined,
          quantity: Number(item.quantity || 1),
        })),
      });
      haptic('notificationSuccess');
      navigation.replace('OrderDetail', { orderId: result.order.id, justPunched: true });
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not convert', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!lead.data || !materials.data) return <Loader />;

  return (
    <Screen>
      <ScreenHeader
        title="Convert"
        subtitle={lead.data.code}
        onBack={() => navigation.goBack()}
      />

      <Card tone="accent">
        <Text variant="h2" tone="onAccent">{lead.data.title}</Text>
        <Text variant="small" tone="onAccent" style={{ opacity: 0.75, marginTop: 2 }}>
          {lead.data.client
            ? `${lead.data.client.name} — existing client`
            : `${lead.data.contactName ?? lead.data.company ?? 'Contact'} — a client will be created`}
        </Text>
      </Card>

      <Field
        label="Location"
        placeholder="Site or address"
        value={location}
        onChangeText={setLocation}
        icon="pin"
        containerStyle={{ marginTop: spacing.lg }}
      />

      <View style={styles.unitRow}>
        <Text variant="label" tone="faint">Sizes in</Text>
        {LENGTH_UNITS.map((u) => (
          <Chip key={u} label={UNIT_LABEL[u]} selected={unit === u} onPress={() => setUnit(u)} />
        ))}
      </View>

      {items.map((item, index) => {
        const material = materials.data?.find((m) => m.id === item.materialId);
        return (
          <Animated.View key={item.key} entering={FadeInDown.duration(300)}>
            <Card tone="dark" style={styles.itemCard}>
              <View style={styles.itemHead}>
                <Text variant="label" tone="faint">LINE {index + 1}</Text>
                {items.length > 1 ? (
                  <Button
                    title="Remove"
                    variant="ghost"
                    size="sm"
                    onPress={() => setItems((rows) => rows.filter((r) => r.key !== item.key))}
                  />
                ) : null}
              </View>

              <View style={styles.sizeRow}>
                <Field
                  label={`Length (${UNIT_LABEL[unit]})`}
                  placeholder="8"
                  value={item.length}
                  onChangeText={(v) => patch(item.key, { length: v })}
                  keyboardType="decimal-pad"
                  containerStyle={{ flex: 1, marginRight: spacing.md, marginBottom: 0 }}
                />
                <Field
                  label={`Width (${UNIT_LABEL[unit]})`}
                  placeholder="4"
                  value={item.width}
                  onChangeText={(v) => patch(item.key, { width: v })}
                  keyboardType="decimal-pad"
                  containerStyle={{ flex: 1, marginBottom: 0 }}
                />
              </View>

              <Text variant="label" tone="muted" style={styles.label}>Material</Text>
              <View style={styles.chipWrap}>
                {materials.data?.map((m) => (
                  <Chip
                    key={m.id}
                    label={m.name}
                    accent={m.color}
                    selected={item.materialId === m.id}
                    onPress={() => patch(item.key, { materialId: m.id, thicknessId: '' })}
                  />
                ))}
              </View>

              {material ? (
                <>
                  <Text variant="label" tone="muted" style={styles.label}>Thickness</Text>
                  <View style={styles.chipWrap}>
                    {material.thicknesses.map((t) => (
                      <Chip
                        key={t.id}
                        label={t.label ?? `${Number(t.valueMm)} mm`}
                        selected={item.thicknessId === t.id}
                        onPress={() =>
                          patch(item.key, {
                            thicknessId: item.thicknessId === t.id ? '' : t.id,
                          })
                        }
                      />
                    ))}
                  </View>
                </>
              ) : null}

              <Field
                label="Quantity"
                value={item.quantity}
                onChangeText={(v) => patch(item.key, { quantity: v })}
                keyboardType="number-pad"
                containerStyle={{ marginTop: spacing.lg, marginBottom: 0 }}
              />
            </Card>
          </Animated.View>
        );
      })}

      <Button
        title="Add item"
        variant="ghost"
        icon={<Icon name="plus" size={16} color={palette.text} />}
        onPress={() => setItems((rows) => [...rows, blank()])}
        style={{ marginTop: spacing.md }}
      />

      <View style={{ marginTop: spacing.xl }}>
        <HoldButton title="Hold to convert" onComplete={submit} disabled={!ready || busy} />
      </View>
      <Text variant="tiny" tone="faint" style={styles.hint}>
        Creates the order and links this lead to it.
      </Text>
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
  itemCard: { marginBottom: spacing.md },
  itemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sizeRow: { flexDirection: 'row' },
  label: { marginTop: spacing.lg, marginBottom: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { textAlign: 'center', marginTop: spacing.md },
});
