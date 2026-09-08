import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Estimate, EstimateStatus } from '@decor/shared';
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
  Icon,
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

const STATUS_COLOR: Record<EstimateStatus, string> = {
  DRAFT: palette.textFaint,
  SENT: palette.info,
  ACCEPTED: palette.success,
  DECLINED: palette.danger,
  EXPIRED: palette.warning,
  CONVERTED: palette.accent,
};

const STATUS_FILTERS: EstimateStatus[] = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CONVERTED',
];

/** Quotations given out, newest first. */
export function EstimatesScreen({ navigation }: { navigation: any }) {
  const { can } = useAuth();
  const [status, setStatus] = useState<EstimateStatus | undefined>();
  const [search, setSearch] = useState('');
  const [filterSheet, setFilterSheet] = useState(false);

  const estimates = usePaginated<Estimate>(
    (page) => api.estimates({ status, search: search || undefined, page, limit: 25 }),
    [status, search],
  );

  return (
    <Screen
      refreshing={estimates.refreshing}
      onRefresh={estimates.refresh}
      onEndReached={estimates.loadMore}>
      <ScreenHeader
        title="Quotes"
        subtitle={`${estimates.total} quoted`}
        onBack={() => navigation.goBack()}
        right={<RoundButton icon="filter" testID="filter-button" onPress={() => setFilterSheet(true)} />}
      />

      {can(PERMISSIONS.ESTIMATE_MANAGE) ? (
        <Button
          title="New quote"
          size="lg"
          icon={<Icon name="plus" size={18} color={palette.white} />}
          onPress={() => navigation.navigate('EstimateEdit', {})}
        />
      ) : null}

      <Field
        placeholder="Estimate number or client"
        value={search}
        onChangeText={setSearch}
        icon="search"
        containerStyle={{ marginTop: spacing.lg }}
      />

      <FilterSheet
        visible={filterSheet}
        onClose={() => setFilterSheet(false)}
        title="Filter quotes"
        dimensions={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { id: null, label: 'Any status' },
              ...STATUS_FILTERS.map((option) => ({
                id: option,
                label: option,
                color: STATUS_COLOR[option],
              })),
            ],
          },
        ]}
        value={{ status: status ?? null }}
        onApply={(next) => setStatus((next.status as EstimateStatus) ?? undefined)}
      />

      {estimates.loading ? (
        <Loader />
      ) : estimates.items.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title="No quotes yet"
          message="Quote a job before it becomes an order."
        />
      ) : (
        estimates.items.map((estimate, index) => (
          <Animated.View
            key={estimate.id}
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}>
            <Card
              tone="dark"
              style={styles.card}
              onPress={() => navigation.navigate('EstimateDetail', { estimateId: estimate.id })}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="h3" numberOfLines={1}>
                    {estimate.client?.name ?? estimate.clientName ?? 'Unnamed'}
                  </Text>
                  <Text variant="tiny" tone="muted">
                    {estimate.code} · {formatDateShort(estimate.issuedOn)}
                  </Text>
                </View>
                <Pill
                  label={estimate.status}
                  color={STATUS_COLOR[estimate.status]}
                  small
                />
              </View>
              <View style={styles.cardFoot}>
                <Text variant="tiny" tone="faint">
                  {estimate.items.length} line{estimate.items.length === 1 ? '' : 's'}
                </Text>
                <Text variant="h3" tone="accent">{formatInr(estimate.grandTotal)}</Text>
              </View>
            </Card>
          </Animated.View>
        ))
      )}

      <ListFooter
        loading={estimates.loadingMore}
        hasMore={estimates.hasMore}
        shown={estimates.items.length}
        total={estimates.total}
        noun="estimates"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: { marginBottom: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
});
