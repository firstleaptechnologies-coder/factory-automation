import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Expense, ExpenseFormOptions } from '@fas/shared';
import { PERMISSIONS } from '@fas/shared';
import { api } from '../api/client';
import { usePaginated } from '../hooks/usePaginated';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import { FilterSheet } from '../components/FilterSheet';
import {
  Card,
  EmptyState,
  Field,
  ListFooter,
  Loader,
  Pill,
  RoundButton,
  Screen,
  ScreenHeader,
  Text,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatDateShort, formatInr } from '../lib/format';

/**
 * What the shop spent, newest first.
 *
 * Every filter on this screen is a list the shop keeps itself, so the options
 * come from the server rather than from a constant here — a shop that adds a
 * category can filter by it the same afternoon.
 */
export function ExpensesScreen({ navigation }: { navigation: any }) {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [spentType, setSpentType] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<string | null>(null);
  const [doneBy, setDoneBy] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const options = useApi<ExpenseFormOptions>(() => api.expenseOptions(), []);

  // The total rides along with every page, so the hero describes the whole
  // filtered set even while only a page of rows is on screen.
  const [total, setTotal] = useState(0);

  const feed = usePaginated<Expense>(
    async (page) => {
      const result = await api.expenses({
        search: search || undefined,
        spentType: spentType ?? undefined,
        paymentType: paymentType ?? undefined,
        doneBy: doneBy ?? undefined,
        page,
        limit: 25,
      });
      setTotal(result.total);
      return result;
    },
    [search, spentType, paymentType, doneBy],
  );

  const canManage = can(PERMISSIONS.EXPENSE_MANAGE);
  const canConfigure = can(PERMISSIONS.EXPENSE_CONFIG);
  const labels = (values: string[] | undefined) =>
    [{ id: null, label: 'Any' }, ...(values ?? []).map((value) => ({ id: value, label: value }))];

  if (feed.loading && feed.items.length === 0) return <Loader label="Adding it up" />;

  return (
    <Screen
      refreshing={feed.refreshing}
      onRefresh={feed.refresh}
      onEndReached={feed.loadMore}>
      <ScreenHeader
        title="Expenses"
        subtitle="What the shop spends on itself"
        onBack={() => navigation.goBack()}
        right={
          <View style={styles.actions}>
            <RoundButton icon="trend" onPress={() => navigation.navigate('ExpenseAnalytics')} />
            {canConfigure ? (
              <RoundButton
                icon="tune"
                testID="expense-options"
                onPress={() => navigation.navigate('AdminExpenseOptions')}
              />
            ) : null}
            <RoundButton icon="filter" testID="filter-button" onPress={() => setFilterOpen(true)} />
            {canManage ? (
              <RoundButton
                icon="plus"
                testID="add-expense"
                onPress={() => navigation.navigate('ExpenseForm', {})}
              />
            ) : null}
          </View>
        }
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
            Spent across {feed.meta?.total ?? feed.items.length} entr
            {(feed.meta?.total ?? feed.items.length) === 1 ? 'y' : 'ies'}
          </Text>
          <Text variant="display" tone="onAccent">{formatInr(total)}</Text>
        </Card>
      </Animated.View>

      <Field
        label="Search"
        placeholder="What it was, or who it went to"
        value={search}
        onChangeText={setSearch}
        containerStyle={{ marginTop: spacing.lg }}
      />

      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter expenses"
        dimensions={[
          { key: 'spentType', label: 'Category', options: labels(options.data?.SPENT_TYPE) },
          { key: 'paymentType', label: 'Paid by', options: labels(options.data?.PAYMENT_TYPE) },
          { key: 'doneBy', label: 'Spent by', options: labels(options.data?.DONE_BY) },
        ]}
        value={{ spentType, paymentType, doneBy }}
        onApply={(next) => {
          setSpentType((next.spentType as string) ?? null);
          setPaymentType((next.paymentType as string) ?? null);
          setDoneBy((next.doneBy as string) ?? null);
        }}
      />

      {feed.items.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="Nothing recorded yet"
          message={canManage ? 'Tap + to record the first one' : undefined}
        />
      ) : (
        feed.items.map((row) => (
          <Card
            key={row.id}
            tone="dark"
            style={styles.row}
            onPress={() => navigation.navigate('ExpenseDetail', { id: row.id })}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3" numberOfLines={1}>{row.description}</Text>
                <Text variant="tiny" tone="muted" numberOfLines={1}>
                  {row.toName} · {formatDateShort(row.date)}
                </Text>
                <Text variant="tiny" tone="faint" numberOfLines={1}>
                  {row.spentType} · {row.paymentType} · {row.doneBy}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="h3">{formatInr(Number(row.amount))}</Text>
                {row.order ? <Pill label={row.order.code} color={palette.accent} small /> : null}
              </View>
            </View>
          </Card>
        ))
      )}

      <ListFooter
        loading={feed.loadingMore}
        hasMore={feed.hasMore}
        shown={feed.items.length}
        total={feed.meta?.total ?? feed.items.length}
        noun="expenses"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
});
