import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { CreditReason, Invoice, Receivable } from '@decor/shared';
import { CREDIT_REASON_LABELS, PERMISSIONS } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import { shareDocument } from '../lib/documents';
import {
  Button,
  Card,
  Chip,
  Field,
  Icon,
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

const REASONS = Object.keys(CREDIT_REASON_LABELS) as CreditReason[];

/**
 * One invoice, and the two things that can be done to it.
 *
 * Cancelling keeps the number and needs a reason; crediting reduces what is
 * owed without a rupee moving. Neither deletes anything, and neither posts to
 * the ledger — the payment against the invoice is the only movement of money
 * in this story, and that posts on its own.
 */
export function InvoiceDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const { invoiceId } = route.params as { invoiceId: string };
  const { can } = useAuth();

  const invoice = useApi<Invoice>(() => api.invoice(invoiceId), [invoiceId]);
  const data = invoice.data;
  const receivable = useApi<Receivable | null>(
    () => (data?.orderId ? api.orderReceivable(data.orderId) : Promise.resolve(null)),
    [data?.orderId],
  );

  const [sharing, setSharing] = useState(false);
  const [cancelSheet, setCancelSheet] = useState(false);
  const [creditSheet, setCreditSheet] = useState(false);
  const [reason, setReason] = useState('');
  const [creditReason, setCreditReason] = useState<CreditReason>('RETURN');
  const [taxable, setTaxable] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const canCancel = can(PERMISSIONS.INVOICE_CANCEL);
  const canCredit = can(PERMISSIONS.CREDIT_NOTE_ISSUE);

  const share = async () => {
    if (!data) return;
    setSharing(true);
    try {
      await shareDocument({
        path: `/invoices/${invoiceId}/document`,
        fileName: data.code,
        message: `Invoice ${data.code} — ${formatInr(Number(data.total))}`,
      });
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not share', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSharing(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api.cancelInvoice(invoiceId, reason.trim());
      haptic('notificationSuccess');
      setCancelSheet(false);
      setReason('');
      invoice.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not cancel', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const credit = async () => {
    setBusy(true);
    try {
      await api.creditInvoice(invoiceId, {
        taxable: Number(taxable),
        reason: creditReason,
        note: note.trim(),
      });
      haptic('notificationSuccess');
      setCreditSheet(false);
      setTaxable('');
      setNote('');
      invoice.reload();
      receivable.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not credit', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <Loader label="Loading invoice" />;

  const cancelled = data.status === 'CANCELLED';
  const notes = (data.creditNotes ?? []).filter((one) => one.status !== 'CANCELLED');
  const owed = receivable.data;

  return (
    <Screen refreshing={invoice.refreshing} onRefresh={invoice.refresh}>
      <ScreenHeader
        title={data.code}
        subtitle={data.clientName}
        onBack={() => navigation.goBack()}
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
            Billed
          </Text>
          <Text variant="display" tone="onAccent">{formatInr(Number(data.total))}</Text>
          <View style={styles.heroFoot}>
            <View>
              <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75 }}>Taxable</Text>
              <Text variant="h3" tone="onAccent">{formatInr(Number(data.taxable))}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75 }}>
                {data.interState ? 'IGST' : 'CGST + SGST'}
              </Text>
              <Text variant="h3" tone="onAccent">
                {formatInr(
                  Number(data.cgst) + Number(data.sgst) + Number(data.igst),
                )}
              </Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      <View style={styles.statusRow}>
        <Pill
          label={cancelled ? 'Cancelled' : 'Issued'}
          color={cancelled ? palette.danger : palette.success}
        />
        <Text variant="tiny" tone="muted">{formatDateShort(data.issuedOn)}</Text>
      </View>

      {cancelled ? (
        <Card tone="dark" style={{ marginTop: spacing.md }}>
          <Text variant="label" tone="muted">Why it was cancelled</Text>
          <Text variant="body">{data.cancelReason}</Text>
          <Text variant="tiny" tone="faint" style={{ marginTop: 4 }}>
            The number stays used. Nothing is deleted and nothing is reissued.
          </Text>
        </Card>
      ) : null}

      {owed ? (
        <Card tone="dark" style={{ marginTop: spacing.md }}>
          <Text variant="label" tone="muted">Against this order</Text>
          {/*
            Three figures, never two. Credited money is not received money, so
            an order can never look paid by rupees nobody collected.
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
          <Text variant="tiny" tone="muted" style={{ marginTop: spacing.sm }}>
            {owed.settled ? 'Settled' : `${formatInr(owed.due)} still due`}
          </Text>
          <Text variant="tiny" tone="faint" style={{ marginTop: 4 }}>
            What was credited is shown beside what was collected, never inside it.
          </Text>
        </Card>
      ) : null}

      <Button
        title="Share the invoice"
        size="lg"
        loading={sharing}
        icon={<Icon name="arrowUpRight" size={18} color={palette.white} />}
        onPress={share}
        style={{ marginTop: spacing.lg }}
      />

      <Text variant="label" tone="muted" style={styles.blockLabel}>
        What was billed
      </Text>
      {(data.items ?? []).map((item) => (
        <Card key={item.id} tone="dark" style={styles.row}>
          <View style={styles.rowTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="body">{item.description}</Text>
              <Text variant="tiny" tone="faint">
                {Number(item.quantity)} {item.unit} × {formatInr(Number(item.rate))}
                {item.hsn ? ` · HSN ${item.hsn}` : ''}
              </Text>
            </View>
            <Text variant="h3">{formatInr(Number(item.amount))}</Text>
          </View>
        </Card>
      ))}

      <Text variant="label" tone="muted" style={styles.blockLabel}>
        {notes.length === 0 ? 'Credit notes' : `${notes.length} credit note${notes.length === 1 ? '' : 's'}`}
      </Text>
      {notes.length === 0 ? (
        <Text variant="tiny" tone="faint">
          Nothing has been credited against this invoice.
        </Text>
      ) : (
        notes.map((one) => (
          <Card key={one.id} tone="dark" style={styles.row}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3">{one.code}</Text>
                <Text variant="tiny" tone="muted">
                  {CREDIT_REASON_LABELS[one.reason]} · {formatDateShort(one.issuedOn)}
                </Text>
                <Text variant="tiny" tone="faint">{one.note}</Text>
              </View>
              <Text variant="h3">{formatInr(Number(one.total))}</Text>
            </View>
          </Card>
        ))
      )}

      {!cancelled ? (
        <View style={styles.actions}>
          {canCredit ? (
            <Chip label="Raise a credit note" onPress={() => setCreditSheet(true)} />
          ) : null}
          {canCancel && notes.length === 0 ? (
            <Chip label="Cancel this invoice" onPress={() => setCancelSheet(true)} />
          ) : null}
        </View>
      ) : null}

      <Sheet
        visible={cancelSheet}
        title="Cancel this invoice?"
        subtitle="The number stays used. Say why — it is the only record of what it means now."
        onClose={() => setCancelSheet(false)}>
        <Field
          label="Why"
          placeholder="Raised against the wrong client"
          value={reason}
          onChangeText={setReason}
          autoFocus
        />
        <Button
          title="Cancel it"
          variant="danger"
          loading={busy}
          disabled={reason.trim().length < 4}
          onPress={cancel}
        />
      </Sheet>

      <Sheet
        visible={creditSheet}
        title="Raise a credit note"
        subtitle="Reduces what the client owes. It is not a payment and is never counted as one."
        onClose={() => setCreditSheet(false)}>
        <Field
          label="Taxable value to credit (₹)"
          placeholder="0"
          hint="The GST comes off in the proportion this invoice charged it."
          value={taxable}
          onChangeText={setTaxable}
          keyboardType="decimal-pad"
          autoFocus
        />
        <Select
          label="Why"
          value={creditReason}
          options={REASONS.map((key) => ({ value: key, label: CREDIT_REASON_LABELS[key] }))}
          onChange={(value) => setCreditReason(value as CreditReason)}
        />
        <Field
          label="In your own words"
          placeholder="Two panels came back chipped"
          value={note}
          onChangeText={setNote}
        />
        <Button
          title="Raise it"
          loading={busy}
          disabled={!taxable || Number(taxable) <= 0 || note.trim().length < 4}
          onPress={credit}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  threeUp: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  blockLabel: { marginTop: spacing.xl, marginBottom: spacing.md },
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
});
