import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Purchase, PurchaseStatus } from '@fas/shared';
import { PERMISSIONS, PURCHASE_STATUS_LABELS } from '@fas/shared';
import { api } from '../api/client';
import { usePaginated } from '../hooks/usePaginated';
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

/** The colour a purchase's standing reads as. */
const TONE: Record<PurchaseStatus, string> = {
  DRAFT: palette.textMuted,
  ORDERED: palette.info,
  PART_RECEIVED: palette.warning,
  RECEIVED: palette.success,
  CANCELLED: palette.textFaint,
};

/** What the shop bought, from ordering it to paying for it. */
export function PurchasesScreen({ navigation }: { navigation: any }) {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PurchaseStatus | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const feed = usePaginated<Purchase>(
    (page) =>
      api.purchases({
        search: search || undefined,
        status: status ?? undefined,
        page,
        limit: 25,
      }),
    [search, status],
  );

  const canManage = can(PERMISSIONS.PURCHASE_MANAGE);

  if (feed.loading && feed.items.length === 0) return <Loader label="Loading" />;

  return (
    <Screen
      refreshing={feed.refreshing}
      onRefresh={feed.refresh}
      onEndReached={feed.loadMore}>
      <ScreenHeader
        title="Purchases"
        subtitle="Ordered, arrived, billed, paid"
        onBack={() => navigation.goBack()}
        right={
          <View style={styles.actions}>
            <RoundButton
              icon="filter"
              testID="filter-button"
              onPress={() => setFilterOpen(true)}
            />
            {canManage ? (
              <RoundButton
                icon="plus"
                testID="new-purchase"
                onPress={() => navigation.navigate('PurchaseEdit', {})}
              />
            ) : null}
          </View>
        }
      />

      <Field
        label="Search"
        placeholder="Order number, vendor or their bill"
        value={search}
        onChangeText={setSearch}
      />

      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter purchases"
        dimensions={[
          {
            key: 'status',
            label: 'Where it is',
            options: [
              { id: null, label: 'Everything' },
              ...(['DRAFT', 'ORDERED', 'PART_RECEIVED', 'RECEIVED', 'CANCELLED'] as const).map(
                (key) => ({
                  id: key,
                  label: PURCHASE_STATUS_LABELS[key],
                  color: TONE[key],
                }),
              ),
            ],
          },
        ]}
        value={{ status }}
        onApply={(next) => setStatus((next.status as PurchaseStatus) ?? null)}
      />

      {feed.items.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title="Nothing ordered yet"
          message={canManage ? 'Tap + to write an order' : undefined}
        />
      ) : (
        feed.items.map((purchase, index) => (
          <Animated.View
            key={purchase.id}
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}>
            <Card
              tone="dark"
              style={styles.row}
              onPress={() => navigation.navigate('PurchaseDetail', { id: purchase.id })}>
              <View style={styles.rowTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="h3" numberOfLines={1}>{purchase.vendor.name}</Text>
                  <Text variant="tiny" tone="muted">
                    {purchase.code}
                    {purchase.billNumber ? ` · bill ${purchase.billNumber}` : ''}
                  </Text>
                  <Text variant="tiny" tone="faint">
                    {purchase.expectedOn
                      ? `due ${formatDateShort(purchase.expectedOn)}`
                      : formatDateShort(purchase.createdAt)}
                    {purchase.paidOn ? ' · paid' : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="h3">{formatInr(purchase.total)}</Text>
                  <Pill
                    label={PURCHASE_STATUS_LABELS[purchase.status]}
                    color={TONE[purchase.status]}
                    small
                  />
                </View>
              </View>
            </Card>
          </Animated.View>
        ))
      )}

      <ListFooter
        loading={feed.loadingMore}
        hasMore={feed.hasMore}
        shown={feed.items.length}
        total={feed.meta?.total ?? feed.items.length}
        noun="purchases"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
});
