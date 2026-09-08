import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import type { PaymentMode, PaymentSummary } from '@decor/shared';
import { PERMISSIONS } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Icon,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatDateTime, formatInr } from '../lib/format';

const STATUS_COLOR: Record<string, string> = {
  PENDING: palette.danger,
  PARTIAL: palette.warning,
  RECEIVED: palette.success,
};

/**
 * The money on one order.
 *
 * Collections are a ledger rather than a single figure, because orders are paid
 * in instalments. Every receipt records how it arrived, and cash carries the
 * extra question the shop actually has to answer later: how much of it reached
 * the bank.
 */
export function PaymentsScreen({ route, navigation }: { route: any; navigation: any }) {
  const { orderId, orderCode } = route.params as { orderId: string; orderCode?: string };
  const { can } = useAuth();

  const summary = useApi<PaymentSummary>(() => api.paymentSummary(orderId), [orderId]);

  const [sheet, setSheet] = useState(false);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [reference, setReference] = useState('');
  const [bankedNow, setBankedNow] = useState('');
  const [busy, setBusy] = useState(false);

  const [depositFor, setDepositFor] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositRef, setDepositRef] = useState('');

  const canRecord = can(PERMISSIONS.PAYMENT_RECORD);
  const canDeposit = can(PERMISSIONS.CASH_DEPOSIT);

  const record = async () => {
    setBusy(true);
    try {
      await api.recordPayment(orderId, {
        amount: Number(amount),
        mode,
        reference: reference || undefined,
        depositedAmount:
          mode === 'CASH' && bankedNow ? Number(bankedNow) : undefined,
      });
      haptic('notificationSuccess');
      setSheet(false);
      setAmount('');
      setReference('');
      setBankedNow('');
      summary.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not record', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const deposit = async () => {
    setBusy(true);
    try {
      await api.recordDeposit({
        paymentId: depositFor ?? undefined,
        amount: Number(depositAmount),
        bankReference: depositRef || undefined,
      });
      haptic('notificationSuccess');
      setDepositFor(null);
      setDepositAmount('');
      setDepositRef('');
      summary.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not record', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!summary.data) return <Loader label="Loading payments" />;
  const data = summary.data;

  return (
    <Screen refreshing={summary.refreshing} onRefresh={summary.refresh}>
      <ScreenHeader
        title="Payments"
        subtitle={orderCode}
        onBack={() => navigation.goBack()}
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
            Client owes
          </Text>
          <Text variant="display" tone="onAccent">{formatInr(data.total)}</Text>

          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(data.receivedPct, 100)}%` },
              ]}
            />
          </View>

          <View style={styles.heroFoot}>
            <View>
              <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75 }}>Received</Text>
              <Text variant="h3" tone="onAccent">{formatInr(data.received)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75 }}>Pending</Text>
              <Text variant="h3" tone="onAccent">{formatInr(data.pending)}</Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      <View style={styles.statusRow}>
        <Pill label={data.status} color={STATUS_COLOR[data.status]} />
        <Text variant="tiny" tone="muted">{data.receivedPct}% collected</Text>
      </View>

      <View style={styles.splitRow}>
        <Card tone="dark" style={styles.splitCard}>
          <Text variant="label" tone="muted">Cash</Text>
          <Text variant="h3">{formatInr(data.cash.received)}</Text>
          <Text variant="tiny" tone="muted" style={{ marginTop: 2 }}>
            banked {formatInr(data.cash.deposited)}
          </Text>
          {data.cash.inHand > 0 ? (
            <Text variant="tiny" tone="warning" bold style={{ marginTop: 2 }}>
              {formatInr(data.cash.inHand)} in hand
            </Text>
          ) : null}
        </Card>
        <Card tone="dark" style={styles.splitCard}>
          <Text variant="label" tone="muted">Online</Text>
          <Text variant="h3">{formatInr(data.online.received)}</Text>
          <Text variant="tiny" tone="muted" style={{ marginTop: 2 }}>already in bank</Text>
        </Card>
      </View>

      {canRecord && data.pending > 0 ? (
        <Button
          title="Record a payment"
          size="lg"
          icon={<Icon name="plus" size={18} color={palette.white} />}
          onPress={() => setSheet(true)}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}

      <Text variant="label" tone="muted" style={styles.blockLabel}>Receipts</Text>
      {data.payments.length === 0 ? (
        <EmptyState icon="box" title="Nothing collected yet" />
      ) : (
        data.payments.map((payment) => {
          const banked = payment.deposits.reduce((sum, d) => sum + Number(d.amount), 0);
          const inHand = Number(payment.amount) - banked;
          return (
            <Card key={payment.id} tone="dark" style={styles.receipt}>
              <View style={styles.receiptTop}>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">{formatInr(Number(payment.amount))}</Text>
                  <Text variant="tiny" tone="muted">
                    {formatDateTime(payment.receivedAt)}
                    {payment.receivedBy ? ` · ${payment.receivedBy.name}` : ''}
                  </Text>
                </View>
                <Pill
                  label={payment.mode}
                  color={payment.mode === 'CASH' ? palette.warning : palette.info}
                  small
                />
              </View>

              {payment.reference ? (
                <Text variant="tiny" tone="faint" style={{ marginTop: 4 }}>
                  ref {payment.reference}
                </Text>
              ) : null}

              {payment.mode === 'CASH' ? (
                <View style={styles.cashRow}>
                  <Text variant="tiny" tone="muted">
                    banked {formatInr(banked)} · in hand {formatInr(inHand)}
                  </Text>
                  {canDeposit && inHand > 0.009 ? (
                    <Chip
                      label="Bank it"
                      onPress={() => {
                        setDepositFor(payment.id);
                        setDepositAmount(String(inHand));
                      }}
                    />
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        })
      )}

      <Sheet
        visible={sheet}
        title="Record a payment"
        subtitle={`${formatInr(data.pending)} still owed`}
        onClose={() => setSheet(false)}>
        <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
          How did it arrive?
        </Text>
        <View style={styles.chipWrap}>
          <Chip label="Cash" selected={mode === 'CASH'} onPress={() => setMode('CASH')} />
          <Chip label="Online" selected={mode === 'ONLINE'} onPress={() => setMode('ONLINE')} />
        </View>

        <Field
          label="Amount (₹)"
          placeholder={String(data.pending)}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          containerStyle={{ marginTop: spacing.lg }}
          autoFocus
        />

        {mode === 'ONLINE' ? (
          <Field
            label="Reference"
            placeholder="UTR or cheque number"
            value={reference}
            onChangeText={setReference}
          />
        ) : (
          <Animated.View entering={FadeIn.duration(200)}>
            <Field
              label="Banked straight away (₹)"
              placeholder="Leave empty if it stayed in hand"
              value={bankedNow}
              onChangeText={setBankedNow}
              keyboardType="decimal-pad"
              hint="Cash not banked shows as in hand until it is."
            />
          </Animated.View>
        )}

        <Button
          title="Record"
          loading={busy}
          disabled={!amount || Number(amount) <= 0}
          onPress={record}
        />
      </Sheet>

      <Sheet
        visible={Boolean(depositFor)}
        title="Bank this cash"
        onClose={() => setDepositFor(null)}>
        <Field
          label="Amount (₹)"
          value={depositAmount}
          onChangeText={setDepositAmount}
          keyboardType="decimal-pad"
          autoFocus
        />
        <Field
          label="Bank reference"
          placeholder="Deposit slip number"
          value={depositRef}
          onChangeText={setDepositRef}
        />
        <Button
          title="Record deposit"
          loading={busy}
          disabled={!depositAmount || Number(depositAmount) <= 0}
          onPress={deposit}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.22)',
    marginTop: spacing.md,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: palette.white, borderRadius: 3 },
  heroFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  splitRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  splitCard: { flex: 1 },
  blockLabel: { marginTop: spacing.xl, marginBottom: spacing.md },
  receipt: { marginBottom: spacing.sm },
  receiptTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.25)',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
