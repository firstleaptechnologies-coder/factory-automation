import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { CashInHandRow, CashPosition, Transaction, TransactionKind } from '@decor/shared';
import { TRANSACTION_LABELS } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { usePaginated } from '../hooks/usePaginated';
import { FilterSheet } from '../components/FilterSheet';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  ListFooter,
  Loader,
  Pill,
  RoundButton,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatDateTime, formatInr } from '../lib/format';

/** The colour a movement reads as: money in, money moved, money out. */
const TONE: Record<TransactionKind, string> = {
  PAYMENT_CASH: palette.success,
  PAYMENT_ONLINE: palette.info,
  BANK_DEPOSIT: palette.textMuted,
  EXPENSE: palette.warning,
  PURCHASE: palette.info,
  SALARY: palette.accent,
  ADVANCE: palette.textMuted,
};

const KINDS = [
  { id: null, label: 'Everything' },
  { id: 'PAYMENT_CASH', label: TRANSACTION_LABELS.PAYMENT_CASH, color: TONE.PAYMENT_CASH },
  { id: 'PAYMENT_ONLINE', label: TRANSACTION_LABELS.PAYMENT_ONLINE, color: TONE.PAYMENT_ONLINE },
  { id: 'BANK_DEPOSIT', label: TRANSACTION_LABELS.BANK_DEPOSIT, color: TONE.BANK_DEPOSIT },
  { id: 'EXPENSE', label: TRANSACTION_LABELS.EXPENSE, color: TONE.EXPENSE },
  { id: 'PURCHASE', label: TRANSACTION_LABELS.PURCHASE, color: TONE.PURCHASE },
  { id: 'SALARY', label: TRANSACTION_LABELS.SALARY, color: TONE.SALARY },
  { id: 'ADVANCE', label: TRANSACTION_LABELS.ADVANCE, color: TONE.ADVANCE },
];

/**
 * Every movement of money except a payout.
 *
 * One list rather than one per source, because "what happened to the money" is
 * a single question: cash taken, an online transfer, a trip to the bank. What
 * is still in hand sits above it — that is the one figure nobody can read off a
 * bank statement and somebody has to answer for.
 *
 * Payouts are deliberately elsewhere, in their own ledger: they sit beside
 * orders rather than inside them, and folding them in here would be the
 * netting-off the books must not do.
 */
export function TransactionsScreen({ navigation }: { navigation: any }) {
  const position = useApi<CashPosition>(() => api.cashPosition(), []);
  const inHand = useApi<CashInHandRow[]>(() => api.cashInHand(), []);

  const [kind, setKind] = useState<TransactionKind | null>(null);
  const [filterSheet, setFilterSheet] = useState(false);
  const [search, setSearch] = useState('');

  const feed = usePaginated<Transaction>(
    useCallback(
      (page) =>
        api.transactions({
          kind: kind ?? undefined,
          search: search || undefined,
          page,
          limit: 25,
        }),
      [kind, search],
    ),
    [kind, search],
  );

  const [row, setRow] = useState<CashInHandRow | null>(null);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);

  const deposit = async () => {
    setBusy(true);
    try {
      await api.recordDeposit({
        paymentId: row?.paymentId,
        amount: Number(amount),
        bankReference: reference || undefined,
      });
      haptic('notificationSuccess');
      setRow(null);
      setAmount('');
      setReference('');
      position.reload();
      inHand.reload();
      feed.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not record', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!position.data) return <Loader label="Counting the cash" />;
  const data = position.data;

  return (
    <Screen
      refreshing={position.refreshing}
      onRefresh={() => {
        position.refresh();
        inHand.refresh();
        feed.refresh();
      }}>
      <ScreenHeader
        title="Transactions"
        subtitle="Every movement of money except payouts"
        onBack={() => navigation.goBack()}
        right={
          <RoundButton
            icon="filter"
            accessibilityLabel="Filter"
            onPress={() => setFilterSheet(true)}
          />
        }
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>In hand</Text>
          <Text variant="display" tone="onAccent">{formatInr(data.cash.inHand)}</Text>
          <Text variant="small" tone="onAccent" style={{ opacity: 0.8, marginTop: 4 }}>
            of {formatInr(data.cash.received)} taken in cash
          </Text>
          {/* Named rather than absorbed: cash handed to a fitter has left the
              drawer, and a shop counting its notes should be told why. */}
          {data.cash.paidOut > 0 ? (
            <Text variant="small" tone="onAccent" style={{ opacity: 0.8 }}>
              less {formatInr(data.cash.paidOut)} paid out in cash
            </Text>
          ) : null}
        </Card>
      </Animated.View>

      {/* The bifurcation: where the money came in and where it went. */}
      <View style={styles.splitRow}>
        <Card tone="dark" style={styles.splitCard}>
          <Text variant="label" tone="muted">Banked</Text>
          <Text variant="h3">{formatInr(data.cash.deposited)}</Text>
          <Text variant="tiny" tone="muted">{data.deposits} deposits</Text>
        </Card>
        <Card tone="dark" style={styles.splitCard}>
          <Text variant="label" tone="muted">Online</Text>
          <Text variant="h3">{formatInr(data.online.received)}</Text>
          <Text variant="tiny" tone="muted">{data.online.receipts} receipts</Text>
        </Card>
      </View>

      <Field
        placeholder="Order, client or reference"
        value={search}
        onChangeText={setSearch}
        icon="search"
        style={{ marginTop: spacing.lg }}
      />

      {kind ? (
        <View style={styles.appliedRow}>
          <Chip
            label={TRANSACTION_LABELS[kind]}
            selected
            onPress={() => setKind(null)}
          />
          <Text variant="tiny" tone="faint">tap to clear</Text>
        </View>
      ) : null}

      <Text variant="label" tone="muted" style={styles.blockLabel}>
        {feed.total} {feed.total === 1 ? 'movement' : 'movements'}
      </Text>

      {feed.loading && feed.items.length === 0 ? (
        <Loader label="Reading the ledger" />
      ) : feed.items.length === 0 ? (
        <EmptyState
          icon="card"
          title="Nothing here"
          message={
            kind || search
              ? 'Nothing matches that. Clear the filter to see everything.'
              : 'Money recorded against an order shows up here.'
          }
        />
      ) : (
        feed.items.map((entry) => (
          <Card key={entry.id} tone="dark" style={styles.row}>
            <View style={[styles.dot, { backgroundColor: TONE[entry.kind] }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="body" bold numberOfLines={1}>
                {entry.order ? entry.order.client.name : 'Cash to the bank'}
              </Text>
              <Text variant="tiny" tone="muted" numberOfLines={1}>
                {entry.order ? `${entry.order.code} · ` : ''}
                {formatDateTime(entry.at)}
              </Text>
              {entry.reference || entry.note ? (
                <Text variant="tiny" tone="faint" numberOfLines={1} style={{ marginTop: 2 }}>
                  {[entry.reference, entry.note].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {/* A trip to the bank is the same money moving, so it is never
                  shown as a gain. */}
              <Text
                variant="body"
                bold
                tone={entry.direction === 'IN' ? 'accent' : 'muted'}>
                {entry.direction === 'IN' ? '+' : ''}
                {formatInr(entry.amount)}
              </Text>
              <Pill label={TRANSACTION_LABELS[entry.kind]} color={TONE[entry.kind]} small />
            </View>
          </Card>
        ))
      )}

      <ListFooter
        loading={feed.loadingMore}
        hasMore={feed.hasMore}
        shown={feed.items.length}
        total={feed.total}
        noun="movements"
      />

      <Text variant="label" tone="muted" style={styles.blockLabel}>
        Still in hand, order by order
      </Text>

      {inHand.data?.length === 0 ? (
        <EmptyState icon="check" title="Nothing outstanding" message="Every rupee is banked." />
      ) : (
        inHand.data?.map((entry) => (
          <Card key={entry.paymentId} tone="dark" style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text variant="body" bold>{entry.client}</Text>
              <Text variant="tiny" tone="muted">
                {entry.orderCode} · {formatDateTime(entry.receivedAt)}
              </Text>
              <Text variant="tiny" tone="faint" style={{ marginTop: 2 }}>
                took {formatInr(entry.received)} · banked {formatInr(entry.deposited)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="h3" tone="warning">{formatInr(entry.inHand)}</Text>
              <Button
                title="Bank it"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setRow(entry);
                  setAmount(String(entry.inHand));
                }}
                style={{ marginTop: 6 }}
              />
            </View>
          </Card>
        ))
      )}

      <FilterSheet
        visible={filterSheet}
        onClose={() => setFilterSheet(false)}
        title="Filter movements"
        dimensions={[
          { key: 'kind', label: 'Kind', options: KINDS },
        ]}
        value={{ kind }}
        onApply={(next) => {
          setKind((next.kind as TransactionKind) || null);
          setFilterSheet(false);
        }}
      />

      <Sheet
        visible={Boolean(row)}
        title="Bank this cash"
        subtitle={row ? `${row.orderCode} · ${row.client}` : undefined}
        onClose={() => setRow(null)}>
        <Field
          label="Amount (₹)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          autoFocus
        />
        <Field
          label="Bank reference"
          placeholder="Deposit slip number"
          value={reference}
          onChangeText={setReference}
        />
        <Button
          title="Record deposit"
          loading={busy}
          disabled={!amount || Number(amount) <= 0}
          onPress={deposit}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  splitRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  splitCard: { flex: 1 },
  blockLabel: { marginTop: spacing.xl, marginBottom: spacing.md },
  appliedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, marginRight: spacing.md },
});
