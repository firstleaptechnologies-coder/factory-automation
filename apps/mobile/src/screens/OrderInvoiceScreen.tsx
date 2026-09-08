import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Challan, Invoice, Receivable } from '@decor/shared';
import { PERMISSIONS } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import { shareDocument } from '../lib/documents';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatDateShort, formatInr } from '../lib/format';

/**
 * The paper on one order: its invoice, and the challans that went with it.
 *
 * One invoice per order, and never a second. A correction is a credit note,
 * raised from the invoice itself — which is also where the GST rules put it.
 * Challans are the other way round: as many as there were loads.
 */
export function OrderInvoiceScreen({ route, navigation }: { route: any; navigation: any }) {
  const { orderId, orderCode } = route.params as { orderId: string; orderCode?: string };
  const { can } = useAuth();

  const invoice = useApi<Invoice | null>(() => api.orderInvoice(orderId), [orderId]);
  const receivable = useApi<Receivable | null>(() => api.orderReceivable(orderId), [orderId]);
  const challans = useApi<Challan[]>(() => api.challans({ orderId }), [orderId]);

  const [raising, setRaising] = useState(false);
  const [challanSheet, setChallanSheet] = useState(false);
  const [shipTo, setShipTo] = useState('');
  const [transport, setTransport] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);

  const canIssue = can(PERMISSIONS.INVOICE_ISSUE);

  const raise = async () => {
    setRaising(true);
    try {
      const created = await api.raiseInvoice(orderId);
      haptic('notificationSuccess');
      invoice.reload();
      receivable.reload();
      navigation.navigate('InvoiceDetail', { invoiceId: created.id });
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not raise it', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRaising(false);
    }
  };

  const issueChallan = async () => {
    setBusy(true);
    try {
      await api.issueChallan(orderId, {
        shipTo: shipTo.trim() || undefined,
        transport: transport.trim() || undefined,
        vehicle: vehicle.trim() || undefined,
      });
      haptic('notificationSuccess');
      setChallanSheet(false);
      setShipTo('');
      setTransport('');
      setVehicle('');
      challans.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not issue it', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const shareChallan = async (row: Challan) => {
    setSharing(row.id);
    try {
      await shareDocument({
        path: `/challans/${row.id}/document`,
        fileName: row.code,
        message: `Delivery challan ${row.code}`,
      });
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not share', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSharing(null);
    }
  };

  if (invoice.loading && !invoice.data) return <Loader label="Loading" />;

  const bill = invoice.data;
  const owed = receivable.data;

  return (
    <Screen refreshing={invoice.refreshing} onRefresh={invoice.refresh}>
      <ScreenHeader
        title="Invoice and challans"
        subtitle={orderCode ? `${orderCode} · the paper on this order` : 'The paper on this order'}
        onBack={() => navigation.goBack()}
      />

      {bill ? (
        <Animated.View entering={FadeInDown.duration(400).springify()}>
          <Card
            tone="accent"
            onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: bill.id })}>
            <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
              {bill.code}
            </Text>
            <Text variant="display" tone="onAccent">{formatInr(Number(bill.total))}</Text>
            <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75, marginTop: spacing.sm }}>
              {bill.status === 'CANCELLED' ? 'Cancelled' : 'Issued'} ·{' '}
              {formatDateShort(bill.issuedOn)}
            </Text>
          </Card>
        </Animated.View>
      ) : (
        <Card tone="dark">
          <Text variant="h3">Not invoiced yet</Text>
          <Text variant="tiny" tone="muted" style={{ marginTop: 4 }}>
            One invoice per order. Once it is raised, a correction is a credit note
            rather than a second bill.
          </Text>
          {canIssue ? (
            <Button
              title="Raise the invoice"
              loading={raising}
              onPress={raise}
              style={{ marginTop: spacing.lg }}
            />
          ) : null}
        </Card>
      )}

      {owed ? (
        <Card tone="dark" style={{ marginTop: spacing.md }}>
          <Text variant="label" tone="muted">Charged, credited, received</Text>
          {/*
            Three figures on purpose. Folding what was credited into what was
            received would let an order read as paid by money nobody collected.
          */}
          <View style={styles.threeUp}>
            <View>
              <Text variant="tiny" tone="faint">Charged</Text>
              <Text variant="h3">{formatInr(owed.charged)}</Text>
            </View>
            <View>
              <Text variant="tiny" tone="faint">Credited</Text>
              <Text variant="h3">{formatInr(owed.credited)}</Text>
            </View>
            <View>
              <Text variant="tiny" tone="faint">Received</Text>
              <Text variant="h3">{formatInr(owed.received)}</Text>
            </View>
          </View>
          <Pill
            label={owed.settled ? 'Settled' : `${formatInr(owed.due)} due`}
            color={owed.settled ? palette.success : palette.warning}
            small
          />
        </Card>
      ) : null}

      <View style={styles.blockHead}>
        <Text variant="label" tone="muted">
          {(challans.data ?? []).length === 0
            ? 'Delivery challans'
            : `${(challans.data ?? []).length} challan${
                (challans.data ?? []).length === 1 ? '' : 's'
              }`}
        </Text>
        {canIssue ? <Chip label="Issue one" onPress={() => setChallanSheet(true)} /> : null}
      </View>

      <Text variant="tiny" tone="faint" style={{ marginBottom: spacing.md }}>
        A challan travels with the goods and carries no prices. One per load — a job
        often leaves in two vans on two days.
      </Text>

      {(challans.data ?? []).length === 0 ? (
        <EmptyState icon="box" title="Nothing has gone out yet" />
      ) : (
        (challans.data ?? []).map((row) => (
          <Card key={row.id} tone="dark" style={styles.row}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3">{row.code}</Text>
                <Text variant="tiny" tone="muted">
                  {formatDateShort(row.issuedOn)}
                  {row.vehicle ? ` · ${row.vehicle}` : ''}
                </Text>
                {row.shipTo ? (
                  <Text variant="tiny" tone="faint" numberOfLines={2}>{row.shipTo}</Text>
                ) : null}
              </View>
              <Chip
                label={sharing === row.id ? 'Sharing…' : 'Share'}
                onPress={() => shareChallan(row)}
              />
            </View>
          </Card>
        ))
      )}

      <Sheet
        visible={challanSheet}
        title="Issue a delivery challan"
        subtitle="It travels with the goods. No prices on it."
        onClose={() => setChallanSheet(false)}>
        <Field
          label="Ship to"
          placeholder="Leave blank for the client's site address"
          value={shipTo}
          onChangeText={setShipTo}
        />
        <Field
          label="Transport"
          placeholder="Who is carrying it"
          value={transport}
          onChangeText={setTransport}
        />
        <Field
          label="Vehicle"
          placeholder="RJ19 GA 4412"
          value={vehicle}
          onChangeText={setVehicle}
        />
        <Button title="Issue it" loading={busy} onPress={issueChallan} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  threeUp: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
});
