import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Disbursement, DisbursementStatus } from '@decor/shared';
import { PERMISSIONS } from '@decor/shared';
import { api } from '../api/client';
import { usePaginated } from '../hooks/usePaginated';
import { useAuth } from '../auth/AuthContext';
import { FilterSheet } from '../components/FilterSheet';
import {
  Button,
  Card,
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
import { formatDateShort, formatInr } from '../lib/format';

/**
 * Every payout across every order — the view an accountant reconciles against
 * the bank. Orders keep their own totals; this is purely what went out.
 */
export function DisbursementLedgerScreen({ navigation }: { navigation: any }) {
  const { can } = useAuth();
  const [status, setStatus] = useState<DisbursementStatus | undefined>();
  const [search, setSearch] = useState('');
  const [filterSheet, setFilterSheet] = useState(false);

  // Totals ride along with every page, so the hero card always describes the
  // whole filtered ledger even while only a page of rows is on screen.
  const [summary, setSummary] = useState({
    label: 'ISC',
    totals: { total: 0, paid: 0, pending: 0, count: 0 },
  });

  const ledger = usePaginated<Disbursement>(
    async (page) => {
      const result = await api.disbursementLedger({
        status,
        search: search || undefined,
        page,
        limit: 25,
      });
      setSummary({ label: result.label, totals: result.totals });
      return result;
    },
    [status, search],
  );

  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const canManage = can(PERMISSIONS.DISBURSEMENT_MANAGE);

  const rename = async () => {
    setBusy(true);
    try {
      await api.setDisbursementLabel(label.trim());
      haptic('notificationSuccess');
      setRenaming(false);
      ledger.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not rename', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (ledger.loading) return <Loader label="Loading ledger" />;
  const { label: ledgerLabel, totals } = summary;

  return (
    <Screen
      refreshing={ledger.refreshing}
      onRefresh={ledger.refresh}
      onEndReached={ledger.loadMore}>
      <ScreenHeader
        title={`${ledgerLabel} ledger`}
        subtitle="Paid out after the client pays"
        onBack={() => navigation.goBack()}
        right={<RoundButton icon="filter" testID="filter-button" onPress={() => setFilterSheet(true)} />}
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
            Committed across {totals.count} payout{totals.count === 1 ? '' : 's'}
          </Text>
          <Text variant="display" tone="onAccent">{formatInr(totals.total)}</Text>
          <View style={styles.heroFoot}>
            <View>
              <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75 }}>Paid out</Text>
              <Text variant="h3" tone="onAccent">{formatInr(totals.paid)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75 }}>Still owed</Text>
              <Text variant="h3" tone="onAccent">{formatInr(totals.pending)}</Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      {canManage ? (
        <Pressable
          onPress={() => {
            setLabel(ledgerLabel);
            setRenaming(true);
          }}>
          <Text variant="tiny" tone="muted" style={styles.rename}>
            Called "{ledgerLabel}" here — tap to rename
          </Text>
        </Pressable>
      ) : null}

      <Field
        label="Search"
        placeholder="Payee or order number"
        value={search}
        onChangeText={setSearch}
        containerStyle={{ marginTop: spacing.lg }}
      />

      <FilterSheet
        visible={filterSheet}
        onClose={() => setFilterSheet(false)}
        title="Filter payouts"
        dimensions={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { id: null, label: 'Owed and paid' },
              { id: 'PLANNED', label: 'Owed', color: palette.warning },
              { id: 'PAID', label: 'Paid', color: palette.success },
              { id: 'CANCELLED', label: 'Cancelled', color: palette.textFaint },
            ],
          },
        ]}
        value={{ status: status ?? null }}
        onApply={(next) => setStatus((next.status as DisbursementStatus) ?? undefined)}
      />

      {ledger.items.length === 0 ? (
        <EmptyState icon="box" title="Nothing here yet" />
      ) : (
        ledger.items.map((row) => (
          <Card
            key={row.id}
            tone="dark"
            style={styles.row}
            onPress={
              row.order
                ? () =>
                    navigation.navigate('Disbursements', {
                      orderId: row.orderId,
                      orderCode: row.order?.code,
                    })
                : undefined
            }>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3" numberOfLines={1}>{row.payeeName}</Text>
                <Text variant="tiny" tone="muted" numberOfLines={1}>
                  {row.order?.code ?? '—'}
                  {row.order?.client?.name ? ` · ${row.order.client.name}` : ''}
                </Text>
                <Text variant="tiny" tone="faint">
                  {row.category?.name ?? 'Uncategorised'}
                  {row.paidAt ? ` · ${formatDateShort(row.paidAt)}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="h3">{formatInr(Number(row.amount))}</Text>
                <Pill
                  label={row.status === 'PAID' ? 'Paid' : row.status === 'PLANNED' ? 'Owed' : 'Cancelled'}
                  color={
                    row.status === 'PAID'
                      ? palette.success
                      : row.status === 'PLANNED'
                        ? palette.warning
                        : palette.textFaint
                  }
                  small
                />
              </View>
            </View>
          </Card>
        ))
      )}

      <ListFooter
        loading={ledger.loadingMore}
        hasMore={ledger.hasMore}
        shown={ledger.items.length}
        total={ledger.meta?.total ?? ledger.items.length}
        noun="payouts"
      />

      <Sheet
        visible={renaming}
        title="Rename this ledger"
        subtitle="Every heading and button follows this word"
        onClose={() => setRenaming(false)}>
        <Field label="Called" value={label} onChangeText={setLabel} autoFocus />
        <Button title="Save" loading={busy} disabled={!label.trim()} onPress={rename} />
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
  rename: { marginTop: spacing.md, textAlign: 'center' },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
});
