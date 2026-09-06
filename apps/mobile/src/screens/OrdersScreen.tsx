import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import type { Material, Order, Paginated, Workflow } from '@decor/shared';
import { LENGTH_UNITS, UNIT_LABEL } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useDisplayUnit } from '../hooks/useUnit';
import {
  Card,
  Chip,
  EmptyState,
  Field,
  Icon,
  Loader,
  Pill,
  RoundButton,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
} from '../ui';
import { palette, spacing } from '../theme';
import { relativeTime } from '../lib/format';

export function OrdersScreen({ navigation }: { navigation: any }) {
  const [unit, setUnit] = useDisplayUnit();
  const [search, setSearch] = useState('');
  const [statusId, setStatusId] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [filterSheet, setFilterSheet] = useState(false);

  const workflow = useApi<Workflow>(() => api.defaultWorkflow(), []);
  const materials = useApi<Material[]>(() => api.materials(), []);
  const orders = useApi<Paginated<Order> & { unit: string }>(
    () =>
      api.orders({
        unit,
        search: search || undefined,
        statusId: statusId ?? undefined,
        materialId: materialId ?? undefined,
        limit: 60,
      }),
    [unit, search, statusId, materialId],
  );

  const activeFilters = [statusId, materialId].filter(Boolean).length;

  return (
    <Screen refreshing={orders.refreshing} onRefresh={orders.refresh}>
      <ScreenHeader
        title="Orders"
        subtitle={`${orders.data?.meta.total ?? 0} total`}
        right={<RoundButton icon="filter" onPress={() => setFilterSheet(true)} />}
      />

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

      {orders.loading && !orders.data ? (
        <Loader />
      ) : orders.data?.data.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title="No orders match"
          message="Try clearing the search or filters."
        />
      ) : (
        orders.data?.data.map((order, index) => (
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

      <Sheet visible={filterSheet} title="Filter orders" onClose={() => setFilterSheet(false)}>
        <Text variant="label" tone="muted" style={styles.sheetLabel}>Status</Text>
        <View style={styles.chipWrap}>
          {workflow.data?.statuses.map((status) => (
            <Chip
              key={status.id}
              label={status.name}
              accent={status.color}
              selected={statusId === status.id}
              onPress={() => setStatusId(statusId === status.id ? null : status.id)}
            />
          ))}
        </View>

        <Text variant="label" tone="muted" style={styles.sheetLabel}>Material</Text>
        <View style={styles.chipWrap}>
          {materials.data?.map((m) => (
            <Chip
              key={m.id}
              label={m.name}
              accent={m.color}
              selected={materialId === m.id}
              onPress={() => setMaterialId(materialId === m.id ? null : m.id)}
            />
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
