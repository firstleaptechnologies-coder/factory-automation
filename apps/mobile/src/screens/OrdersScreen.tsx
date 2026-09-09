import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import type { Material, Order, Workflow } from '@fas/shared';
import { LENGTH_UNITS, PERMISSIONS, UNIT_LABEL } from '@fas/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../hooks/useApi';
import { usePaginated } from '../hooks/usePaginated';
import { FilterSheet } from '../components/FilterSheet';
import { useDisplayUnit } from '../hooks/useUnit';
import {
  Card,
  Chip,
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
import { relativeTime } from '../lib/format';

export function OrdersScreen({ route, navigation }: { route?: any; navigation: any }) {
  const { can } = useAuth();
  const [unit, setUnit] = useDisplayUnit();
  const [search, setSearch] = useState('');
  // The board hands a stage over when a column overflows, so the list opens
  // already filtered to it.
  const [statusId, setStatusId] = useState<string | null>(
    (route?.params as { statusId?: string } | undefined)?.statusId ?? null,
  );
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [filterSheet, setFilterSheet] = useState(false);

  const workflow = useApi<Workflow>(() => api.defaultWorkflow(), []);
  const materials = useApi<Material[]>(() => api.materials(), []);
  const orders = usePaginated<Order>(
    (page) =>
      api.orders({
        unit,
        search: search || undefined,
        statusId: statusId ?? undefined,
        materialId: materialId ?? undefined,
        page,
        limit: 25,
      }),
    [unit, search, statusId, materialId],
  );

  const activeFilters = [statusId, materialId].filter(Boolean).length;

  /*
   * Built once per data change. Rebuilding the option arrays on every render
   * handed the wheel a fresh list each time the order list re-fetched, and a
   * wheel whose options changed under it lost track of what was selected.
   */
  const filterDimensions = useMemo(
    () => [
      {
        key: 'statusId',
        label: 'Stage',
        options: [
          { id: null, label: 'Any stage' },
          ...(workflow.data?.statuses ?? []).map((status) => ({
            id: status.id,
            label: status.name,
            color: status.color,
          })),
        ],
      },
      {
        key: 'materialId',
        label: 'Material',
        options: [
          { id: null, label: 'Any material' },
          ...(materials.data ?? []).map((material) => ({
            id: material.id,
            label: material.name,
            color: material.color,
          })),
        ],
      },
    ],
    [workflow.data, materials.data],
  );

  return (
    <Screen
      refreshing={orders.refreshing}
      onRefresh={orders.refresh}
      onEndReached={orders.loadMore}
      /*
        Everything you work the list with stays put: the search, the way to the
        board, the units and which filters are on. Having to scroll back to the
        top to change any of them is what makes a long list tiring.
      */
      sticky={
        <>
          <ScreenHeader
            title="Orders"
            subtitle={`${orders.total} total`}
            right={<RoundButton icon="filter" testID="filter-button" onPress={() => setFilterSheet(true)} />}
          />

          {/*
            The board is a way of looking at this list rather than a place of
            its own, so it is reached from here — and punching starts from the
            list you are already looking at.
          */}
          <View style={styles.actions}>
            <Chip icon="layers" label="Board" onPress={() => navigation.navigate('Board')} />
            {can(PERMISSIONS.ORDER_PUNCH) ? (
              <Chip icon="plus" label="Punch order" onPress={() => navigation.navigate('PunchTab')} />
            ) : null}
          </View>

          <Field
            placeholder="Order no, client or location"
            value={search}
            onChangeText={setSearch}
            icon="search"
          />

          <View style={styles.unitRow}>
            <Text variant="label" tone="faint">Sizes in</Text>
            {LENGTH_UNITS.map((u) => (
              <Chip key={u} label={UNIT_LABEL[u]} selected={unit === u} onPress={() => setUnit(u)} />
            ))}
            {activeFilters > 0 ? (
              <Chip
                label={`${activeFilters} filter${activeFilters > 1 ? 's' : ''} ×`}
                selected
                onPress={() => {
                  setStatusId(null);
                  setMaterialId(null);
                }}
              />
            ) : null}
          </View>
        </>
      }>
      {orders.loading ? (
        <Loader />
      ) : orders.items.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title="No orders match"
          message="Try clearing the search or filters."
        />
      ) : (
        orders.items.map((order, index) => (
          <Animated.View
            key={order.id}
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(320)}
            layout={Layout.springify()}>
            <Card
              tone="dark"
              style={styles.card}
              onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text variant="h3" numberOfLines={1}>{order.client.name}</Text>
                  <Text variant="tiny" tone="muted">
                    {order.code} · {relativeTime(order.createdAt)}
                  </Text>
                </View>
                <Pill label={order.status.name} color={order.status.color} small />
              </View>

              <View style={styles.locationRow}>
                <Icon name="pin" size={13} color={palette.textFaint} />
                <Text variant="tiny" tone="faint" numberOfLines={1} style={{ marginLeft: 4 }}>
                  {order.location}
                </Text>
              </View>

              {order.items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <View
                    style={[
                      styles.materialDot,
                      { backgroundColor: item.material.color ?? palette.textFaint },
                    ]}
                  />
                  <Text variant="small" bold>
                    {item.display
                      ? `${item.display.length} × ${item.display.width} ${UNIT_LABEL[item.display.unit]}`
                      : '—'}
                  </Text>
                  <Text variant="small" tone="muted" style={{ flex: 1 }} numberOfLines={1}>
                    {'  '}{item.material.name}
                    {item.display?.thickness
                      ? ` · ${item.display.thickness} ${UNIT_LABEL[item.display.thicknessUnit]}`
                      : ''}
                  </Text>
                  <Text variant="small" tone="accent" bold>×{item.quantity}</Text>
                </View>
              ))}
            </Card>
          </Animated.View>
        ))
      )}

      <ListFooter
        loading={orders.loadingMore}
        hasMore={orders.hasMore}
        shown={orders.items.length}
        total={orders.total}
        noun="orders"
      />

      <FilterSheet
        visible={filterSheet}
        onClose={() => setFilterSheet(false)}
        title="Filter orders"
        dimensions={filterDimensions}
        value={{ statusId, materialId }}
        onApply={(next) => {
          setStatusId(next.statusId ?? null);
          setMaterialId(next.materialId ?? null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: { marginBottom: spacing.md, padding: spacing.lg },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.28)',
  },
  materialDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm },
  sheetLabel: { marginTop: spacing.md, marginBottom: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
