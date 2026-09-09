import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import type {
  Disbursement,
  DisbursementCategory,
  DisbursementSummary,
  PaymentMode,
} from '@fas/shared';
import { PERMISSIONS } from '@fas/shared';
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
import { formatDateShort, formatInr } from '../lib/format';

/**
 * What one order still owes other people.
 *
 * This ledger sits beside the order, never inside it. The order is worth what
 * it was quoted at and is settled when that much has been collected from the
 * client; what the shop then pays a fitter or a transporter out of it is a
 * separate obligation, recorded here so the accountant can see it whole.
 *
 * Every shop names these charges itself — "ISC" out of the box — so the
 * heading comes from the server rather than being written into the app.
 */
export function DisbursementsScreen({ route, navigation }: { route: any; navigation: any }) {
  const { orderId, orderCode } = route.params as { orderId: string; orderCode?: string };
  const { can } = useAuth();

  const ledger = useApi<DisbursementSummary>(() => api.orderDisbursements(orderId), [orderId]);
  const categories = useApi<DisbursementCategory[]>(() => api.disbursementCategories(), []);

  const [sheet, setSheet] = useState(false);
  const [payeeName, setPayeeName] = useState('');
  const [payeeContact, setPayeeContact] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [note, setNote] = useState('');
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [busy, setBusy] = useState(false);

  const [settling, setSettling] = useState<Disbursement | null>(null);
  const [settleMode, setSettleMode] = useState<PaymentMode>('CASH');
  const [settleRef, setSettleRef] = useState('');
  const [taking, setTaking] = useState<Disbursement | null>(null);
  const [reason, setReason] = useState('');

  const canManage = can(PERMISSIONS.DISBURSEMENT_MANAGE);

  const reset = () => {
    setPayeeName('');
    setPayeeContact('');
    setAmount('');
    setCategoryId(undefined);
    setNote('');
    setAlreadyPaid(false);
  };

  const create = async () => {
    setBusy(true);
    try {
      await api.createDisbursement(orderId, {
        payeeName: payeeName.trim(),
        amount: Number(amount),
        categoryId,
        payeeContact: payeeContact.trim() || undefined,
        note: note.trim() || undefined,
        status: alreadyPaid ? 'PAID' : 'PLANNED',
        paidMode: alreadyPaid ? mode : undefined,
      });
      haptic('notificationSuccess');
      setSheet(false);
      reset();
      ledger.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not add', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const settle = async () => {
    if (!settling) return;
    setBusy(true);
    try {
      await api.settleDisbursement(settling.id, {
        paidMode: settleMode,
        reference: settleRef.trim() || undefined,
      });
      haptic('notificationSuccess');
      setSettling(null);
      setSettleRef('');
      ledger.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not settle', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Takes a settled payout back.
   *
   * The mirror of taking a receipt back: the money has gone, so the correction
   * is the opposite row rather than the removal of the first one.
   */
  const takeBack = async () => {
    if (!taking) return;
    setBusy(true);
    try {
      await api.reverseDisbursement(taking.id, reason.trim());
      haptic('notificationSuccess');
      setTaking(null);
      setReason('');
      ledger.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not take it back', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const cancel = (row: Disbursement) => {
    Alert.alert('Cancel this payout?', `${row.payeeName} · ${formatInr(Number(row.amount))}`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel it',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.cancelDisbursement(row.id);
            haptic('notificationSuccess');
            ledger.reload();
          } catch (e) {
            Alert.alert('Could not cancel', e instanceof Error ? e.message : 'Unknown error');
          }
        },
      },
    ]);
  };

  if (!ledger.data) return <Loader label="Loading" />;
  const data = ledger.data;

  return (
    <Screen refreshing={ledger.refreshing} onRefresh={ledger.refresh}>
      <ScreenHeader
        title={data.label}
        subtitle={orderCode ? `${orderCode} · paid out of this order` : 'Paid out of this order'}
        onBack={() => navigation.goBack()}
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
            Committed
          </Text>
          <Text variant="display" tone="onAccent">{formatInr(data.total)}</Text>
          <View style={styles.heroFoot}>
            <View>
              <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75 }}>Paid out</Text>
              <Text variant="h3" tone="onAccent">{formatInr(data.paid)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75 }}>Still owed</Text>
              <Text variant="h3" tone="onAccent">{formatInr(data.pending)}</Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      <Text variant="tiny" tone="faint" style={styles.footnote}>
        Separate from the order. The order's own total and payment status are unchanged by
        anything on this screen.
      </Text>

      {canManage ? (
        <Button
          title={`Add ${data.label}`}
          size="lg"
          icon={<Icon name="plus" size={18} color={palette.white} />}
          onPress={() => setSheet(true)}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}

      <Text variant="label" tone="muted" style={styles.blockLabel}>
        {data.count === 0 ? 'Payouts' : `${data.count} payout${data.count === 1 ? '' : 's'}`}
      </Text>

      {data.disbursements.length === 0 ? (
        <EmptyState icon="box" title="Nothing to pay out yet" />
      ) : (
        data.disbursements.map((row) => (
          <Card key={row.id} tone="dark" style={styles.row}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3" numberOfLines={1}>{row.payeeName}</Text>
                <Text variant="tiny" tone="muted">
                  {row.category?.name ?? 'Uncategorised'}
                  {row.paidAt ? ` · ${formatDateShort(row.paidAt)}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="h3">{formatInr(Number(row.amount))}</Text>
                <Pill
                  label={row.status === 'PAID' ? `Paid ${row.paidMode ?? ''}`.trim() : 'Owed'}
                  color={row.status === 'PAID' ? palette.success : palette.warning}
                  small
                />
              </View>
            </View>

            {row.note ? (
              <Text variant="tiny" tone="faint" style={{ marginTop: 4 }}>{row.note}</Text>
            ) : null}

            {canManage ? (
              <View style={styles.actions}>
                {row.status === 'PLANNED' ? (
                  <Chip
                    label="Mark paid"
                    onPress={() => {
                      setSettling(row);
                      setSettleMode('CASH');
                    }}
                  />
                ) : row.reference ? (
                  <Text variant="tiny" tone="faint">ref {row.reference}</Text>
                ) : (
                  <View />
                )}
                {row.status === 'PAID' ? (
                  row.reversalOfId || row.reversedBy ? null : (
                    <Chip label="Take it back" onPress={() => setTaking(row)} />
                  )
                ) : (
                  <Chip label="Cancel" onPress={() => cancel(row)} />
                )}
              </View>
            ) : null}
          </Card>
        ))
      )}

      <Sheet
        visible={Boolean(taking)}
        title="Take this payout back?"
        subtitle="It stays on the record with a correction beside it. Say why."
        onClose={() => setTaking(null)}>
        <Field
          label="Why"
          placeholder="Paid the wrong fitter"
          value={reason}
          onChangeText={setReason}
          autoFocus
        />
        <Button
          title="Take it back"
          variant="danger"
          loading={busy}
          disabled={reason.trim().length < 4}
          onPress={takeBack}
        />
      </Sheet>

      <Sheet
        visible={sheet}
        title={`Add ${data.label}`}
        subtitle="Money leaving this order"
        onClose={() => setSheet(false)}>
        <Field
          label="Paid to"
          placeholder="Fitter, transporter, polisher…"
          value={payeeName}
          onChangeText={setPayeeName}
          autoFocus
        />
        <Field
          label="Amount (₹)"
          placeholder="0"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />

        <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
          What for?
        </Text>
        <View style={styles.chipWrap}>
          {(categories.data ?? []).map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              selected={categoryId === category.id}
              onPress={() => setCategoryId(categoryId === category.id ? undefined : category.id)}
            />
          ))}
        </View>

        <Field
          label="Contact"
          placeholder="Phone number (optional)"
          value={payeeContact}
          onChangeText={setPayeeContact}
          keyboardType="phone-pad"
          containerStyle={{ marginTop: spacing.lg }}
        />
        <Field label="Note" placeholder="Optional" value={note} onChangeText={setNote} />

        <View style={styles.chipWrap}>
          <Chip
            label={alreadyPaid ? 'Already paid' : 'Still owed'}
            selected={alreadyPaid}
            onPress={() => setAlreadyPaid(!alreadyPaid)}
          />
        </View>

        {alreadyPaid ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.chipWrap}>
            <Chip label="Cash" selected={mode === 'CASH'} onPress={() => setMode('CASH')} />
            <Chip label="Online" selected={mode === 'ONLINE'} onPress={() => setMode('ONLINE')} />
          </Animated.View>
        ) : null}

        <Button
          title="Add"
          loading={busy}
          disabled={!payeeName.trim() || !amount || Number(amount) <= 0}
          onPress={create}
        />
      </Sheet>

      <Sheet
        visible={Boolean(settling)}
        title="Mark as paid"
        subtitle={
          settling ? `${settling.payeeName} · ${formatInr(Number(settling.amount))}` : undefined
        }
        onClose={() => setSettling(null)}>
        <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
          How did it go out?
        </Text>
        <View style={styles.chipWrap}>
          <Chip label="Cash" selected={settleMode === 'CASH'} onPress={() => setSettleMode('CASH')} />
          <Chip
            label="Online"
            selected={settleMode === 'ONLINE'}
            onPress={() => setSettleMode('ONLINE')}
          />
        </View>
        <Field
          label="Reference"
          placeholder="UTR, cheque or slip number"
          value={settleRef}
          onChangeText={setSettleRef}
          containerStyle={{ marginTop: spacing.lg }}
        />
        <Button title="Mark paid" loading={busy} onPress={settle} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  footnote: { marginTop: spacing.md, lineHeight: 17 },
  blockLabel: { marginTop: spacing.xl, marginBottom: spacing.md },
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.25)',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
});
