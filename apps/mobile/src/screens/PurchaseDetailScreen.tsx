import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Purchase } from '@fas/shared';
import { PERMISSIONS, PURCHASE_STATUS_LABELS, today } from '@fas/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import {
  Button,
  Card,
  Field,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Select,
  Sheet,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatDateShort, formatInr } from '../lib/format';

/**
 * One purchase, from ordering it to paying for it.
 *
 * The four acts are separate buttons because they are separate decisions:
 * sending an order, recording what turned up, entering the vendor's bill, and
 * handing over the money. A shop does them days apart.
 */
export function PurchaseDetailScreen({ navigation, route }: { navigation: any; route: any }) {
  const id: string = route.params.id;
  const { can } = useAuth();
  const purchase = useApi<Purchase>(() => api.purchase(id), [id]);

  const [receiving, setReceiving] = useState(false);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [billing, setBilling] = useState(false);
  const [billNumber, setBillNumber] = useState('');
  const [billedOn, setBilledOn] = useState(today());
  const [paying, setPaying] = useState(false);
  const [mode, setMode] = useState<'CASH' | 'ONLINE'>('ONLINE');
  const [busy, setBusy] = useState(false);

  const canManage = can(PERMISSIONS.PURCHASE_MANAGE);
  const canPay = can(PERMISSIONS.PURCHASE_PAY);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      haptic('notificationSuccess');
      purchase.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not do that', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (purchase.loading && !purchase.data) return <Loader label="Loading" />;
  const data = purchase.data;
  if (!data) return null;

  const draft = data.status === 'DRAFT';
  const open = data.status === 'ORDERED' || data.status === 'PART_RECEIVED';

  /** Everything still outstanding, so the sheet opens on what is missing. */
  const outstanding = (data.items ?? []).filter(
    (item) => Number(item.receivedQuantity) < Number(item.quantity),
  );

  return (
    <Screen refreshing={purchase.refreshing} onRefresh={purchase.refresh}>
      <ScreenHeader
        title={data.vendor.name}
        subtitle={data.code}
        onBack={() => navigation.goBack()}
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <View style={styles.heroTop}>
            <Text variant="label" tone="onAccent" style={{ opacity: 0.75, flex: 1 }}>
              {(data.items ?? []).length} {(data.items ?? []).length === 1 ? 'line' : 'lines'}
            </Text>
            <Pill label={PURCHASE_STATUS_LABELS[data.status]} color={palette.white} small />
          </View>
          <Text variant="display" tone="onAccent">{formatInr(data.total)}</Text>
          <Text variant="small" tone="onAccent" style={{ opacity: 0.8, marginTop: 4 }}>
            {formatInr(data.subtotal)} plus {formatInr(data.taxTotal)} tax
            {Number(data.otherCharges) ? ` and ${formatInr(data.otherCharges)} charges` : ''}
          </Text>
        </Card>
      </Animated.View>

      {data.billNumber ? (
        <Card tone="dark" style={styles.block}>
          <Text variant="label">Their bill</Text>
          <Text variant="small" tone="muted">
            {data.billNumber} · {formatDateShort(data.billedOn)}
            {data.paidOn ? ` · paid ${formatDateShort(data.paidOn)}` : ' · unpaid'}
          </Text>
        </Card>
      ) : null}

      {(data.items ?? []).map((item) => (
        <Card key={item.id} tone="dark" style={styles.row}>
          <View style={styles.rowTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="h3" numberOfLines={1}>{item.material.name}</Text>
              <Text variant="tiny" tone="muted">
                {item.thickness
                  ? `${item.thickness.label ?? `${item.thickness.valueMm}mm`} · `
                  : ''}
                {item.quantity} {item.unit} at {formatInr(item.rate)}
              </Text>
              <Text variant="tiny" tone="faint">
                {Number(item.receivedQuantity)} arrived of {Number(item.quantity)}
              </Text>
            </View>
            <Text variant="h3">{formatInr(item.lineTotal)}</Text>
          </View>
        </Card>
      ))}

      {canManage ? (
        <View style={styles.actions}>
          {draft ? (
            <>
              <Button
                title="Edit"
                variant="dark"
                onPress={() => navigation.navigate('PurchaseEdit', { id })}
                style={{ flex: 1 }}
              />
              <Button
                title="Send it"
                loading={busy}
                onPress={() => act(() => api.placePurchase(id))}
                style={{ flex: 1 }}
              />
            </>
          ) : null}
          {open ? (
            <Button
              title="Something arrived"
              onPress={() => {
                setReceived(
                  Object.fromEntries(
                    outstanding.map((item) => [
                      item.id,
                      String(Number(item.quantity) - Number(item.receivedQuantity)),
                    ]),
                  ),
                );
                setReceiving(true);
              }}
              style={{ flex: 1 }}
            />
          ) : null}
          {!draft && !data.billNumber ? (
            <Button
              title="Their bill"
              variant="dark"
              onPress={() => setBilling(true)}
              style={{ flex: 1 }}
            />
          ) : null}
        </View>
      ) : null}

      {canPay && data.billNumber && !data.paidOn ? (
        <Button
          title="Pay it"
          loading={busy}
          onPress={() => setPaying(true)}
          style={{ marginTop: spacing.md }}
        />
      ) : null}

      <Sheet
        visible={receiving}
        title="What turned up?"
        subtitle="Stock goes on the rack against this order, so it has a bill behind it"
        onClose={() => setReceiving(false)}>
        {outstanding.map((item) => (
          <Field
            key={item.id}
            label={`${item.material.name} (${Number(item.quantity) - Number(item.receivedQuantity)} outstanding)`}
            keyboardType="numeric"
            value={received[item.id] ?? ''}
            onChangeText={(value) => setReceived((current) => ({ ...current, [item.id]: value }))}
          />
        ))}
        <Button
          title="Put it on the rack"
          loading={busy}
          onPress={() =>
            act(async () => {
              await api.receivePurchase(id, {
                lines: Object.entries(received)
                  .filter(([, quantity]) => Number(quantity) > 0)
                  .map(([purchaseItemId, quantity]) => ({
                    purchaseItemId,
                    quantity: Number(quantity),
                  })),
              });
              setReceiving(false);
            })
          }
        />
      </Sheet>

      <Sheet
        visible={billing}
        title="Their bill"
        subtitle="The vendor’s own number and date"
        onClose={() => setBilling(false)}>
        <Field label="Bill number" value={billNumber} onChangeText={setBillNumber} autoFocus />
        <Field label="Dated" placeholder="YYYY-MM-DD" value={billedOn} onChangeText={setBilledOn} />
        <Button
          title="Save it"
          loading={busy}
          disabled={!billNumber.trim()}
          onPress={() =>
            act(async () => {
              await api.billPurchase(id, { billNumber: billNumber.trim(), billedOn });
              setBilling(false);
            })
          }
        />
      </Sheet>

      <Sheet
        visible={paying}
        title="Pay this bill?"
        subtitle="It posts to the ledger against the vendor and their bill number"
        onClose={() => setPaying(false)}>
        <Select
          label="Paid by"
          value={mode}
          options={[
            { value: 'ONLINE', label: 'Bank transfer' },
            { value: 'CASH', label: 'Cash' },
          ]}
          onChange={(value) => setMode(value as 'CASH' | 'ONLINE')}
        />
        <Button
          title="Pay it"
          loading={busy}
          onPress={() =>
            act(async () => {
              await api.payPurchase(id, { mode });
              setPaying(false);
            })
          }
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  block: { marginTop: spacing.lg },
  row: { marginTop: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, flexWrap: 'wrap' },
});
