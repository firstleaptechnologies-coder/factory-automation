import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import type { Material, Purchase, Vendor } from '@fas/shared';
import { today } from '@fas/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  Button,
  Card,
  Field,
  Icon,
  Loader,
  Screen,
  ScreenHeader,
  Select,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatInr } from '../lib/format';

/** One line as the form holds it, before it is a number anywhere. */
interface DraftLine {
  materialId: string | null;
  thicknessId: string | null;
  quantity: string;
  rate: string;
  taxAmount: string;
}

const EMPTY: DraftLine = {
  materialId: null,
  thicknessId: null,
  quantity: '',
  rate: '',
  taxAmount: '',
};

/** What a line comes to, for the running total on screen. */
export function lineAmount(line: DraftLine): number {
  return Number(line.quantity || 0) * Number(line.rate || 0) + Number(line.taxAmount || 0);
}

/**
 * Writing an order.
 *
 * The tax is typed rather than worked out from a rate: a vendor's bill is a
 * document with figures on it, and those figures are what the shop owes
 * whatever this would have calculated.
 */
export function PurchaseEditScreen({ navigation, route }: { navigation: any; route: any }) {
  const id: string | undefined = route?.params?.id;

  const vendors = useApi<{ data: Vendor[] }>(() => api.vendors({ limit: 200 }), []);
  const materials = useApi<Material[]>(() => api.materials(), []);
  const existing = useApi<Purchase | null>(
    () => (id ? api.purchase(id) : Promise.resolve(null)),
    [id],
  );

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [expectedOn, setExpectedOn] = useState(today());
  const [otherCharges, setOtherCharges] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([EMPTY]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const row = existing.data;
    if (!row) return;
    setVendorId(row.vendorId);
    setExpectedOn(row.expectedOn?.slice(0, 10) ?? today());
    setOtherCharges(Number(row.otherCharges) ? String(row.otherCharges) : '');
    setNote(row.note ?? '');
    setLines(
      (row.items ?? []).map((item) => ({
        materialId: item.materialId,
        thicknessId: item.thicknessId ?? null,
        quantity: String(item.quantity),
        rate: String(item.rate),
        taxAmount: Number(item.taxAmount) ? String(item.taxAmount) : '',
      })),
    );
  }, [existing.data]);

  const setLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line, at) => (at === index ? { ...line, ...patch } : line)),
    );

  const total =
    lines.reduce((sum, line) => sum + lineAmount(line), 0) + Number(otherCharges || 0);

  const filled = lines.filter((line) => line.materialId && Number(line.quantity) > 0);

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        vendorId: vendorId!,
        expectedOn,
        otherCharges: otherCharges ? Number(otherCharges) : undefined,
        note: note.trim() || undefined,
        items: filled.map((line) => ({
          materialId: line.materialId!,
          thicknessId: line.thicknessId ?? undefined,
          quantity: Number(line.quantity),
          rate: Number(line.rate || 0),
          taxAmount: line.taxAmount ? Number(line.taxAmount) : undefined,
        })),
      };
      const saved = id ? await api.updatePurchase(id, body) : await api.createPurchase(body);
      haptic('notificationSuccess');
      navigation.replace('PurchaseDetail', { id: saved.id });
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (vendors.loading || existing.loading) return <Loader label="Loading" />;

  const thicknessesFor = (materialId: string | null) =>
    (materials.data ?? []).find((material) => material.id === materialId)?.thicknesses ?? [];

  return (
    <Screen>
      <ScreenHeader
        title={id ? 'Edit order' : 'New order'}
        subtitle="A draft until it is sent"
        onBack={() => navigation.goBack()}
      />

      <Select
        label="Vendor"
        value={vendorId}
        options={(vendors.data?.data ?? []).map((vendor) => ({
          value: vendor.id,
          label: `${vendor.name} · ${vendor.code}`,
        }))}
        onChange={setVendorId}
      />
      <Field label="Expected" placeholder="YYYY-MM-DD" value={expectedOn} onChangeText={setExpectedOn} />

      {lines.map((line, index) => (
        <Card key={index} tone="dark" style={styles.line}>
          <View style={styles.lineHead}>
            <Text variant="label" tone="muted" style={{ flex: 1 }}>
              Line {index + 1}
            </Text>
            {lines.length > 1 ? (
              <Text
                variant="tiny"
                tone="faint"
                onPress={() => setLines((current) => current.filter((_, at) => at !== index))}>
                Remove
              </Text>
            ) : null}
          </View>
          <Select
            label="Material"
            value={line.materialId}
            options={(materials.data ?? []).map((material) => ({
              value: material.id,
              label: material.name,
            }))}
            onChange={(value) => setLine(index, { materialId: value, thicknessId: null })}
          />
          {thicknessesFor(line.materialId).length > 0 ? (
            <Select
              label="Thickness"
              value={line.thicknessId}
              options={thicknessesFor(line.materialId).map((thickness) => ({
                value: thickness.id,
                label: thickness.label ?? `${thickness.valueMm} mm`,
              }))}
              onChange={(value) => setLine(index, { thicknessId: value })}
            />
          ) : null}
          <Field
            label="How many"
            placeholder="0"
            keyboardType="numeric"
            value={line.quantity}
            onChangeText={(value) => setLine(index, { quantity: value })}
          />
          <Field
            label="Rate each"
            placeholder="0"
            keyboardType="numeric"
            value={line.rate}
            onChangeText={(value) => setLine(index, { rate: value })}
          />
          <Field
            label="Tax on this line"
            hint="As the vendor wrote it"
            keyboardType="numeric"
            value={line.taxAmount}
            onChangeText={(value) => setLine(index, { taxAmount: value })}
          />
          <Text variant="small" tone="muted">
            {formatInr(lineAmount(line))}
          </Text>
        </Card>
      ))}

      <Button
        title="Another line"
        variant="dark"
        icon={<Icon name="plus" size={17} color={palette.text} />}
        onPress={() => setLines((current) => [...current, EMPTY])}
        style={{ marginTop: spacing.md }}
      />

      <Field
        label="Freight, loading, round-off"
        keyboardType="numeric"
        value={otherCharges}
        onChangeText={setOtherCharges}
        containerStyle={{ marginTop: spacing.lg }}
      />
      <Field label="Note" value={note} onChangeText={setNote} multiline />

      <Card tone="accent" style={{ marginTop: spacing.lg }}>
        <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
          {filled.length} {filled.length === 1 ? 'line' : 'lines'}
        </Text>
        <Text variant="display" tone="onAccent">{formatInr(total)}</Text>
      </Card>

      <Button
        title={id ? 'Save the draft' : 'Write it'}
        loading={busy}
        disabled={!vendorId || filled.length === 0}
        onPress={save}
        style={{ marginTop: spacing.lg }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { marginTop: spacing.md },
  lineHead: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
});
