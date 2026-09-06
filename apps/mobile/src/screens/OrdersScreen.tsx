import React, {useCallback, useState} from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import type {LengthUnit, Order} from '@decor/shared';
import {LENGTH_UNITS, UNIT_LABEL} from '@decor/shared';
import {api} from '../api/client';
import {Card, EmptyState, Loader, StatusPill} from '../components/ui';
import {colors, font, spacing} from '../theme';

export function OrdersScreen({navigation}: {navigation: any}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [unit, setUnit] = useState<LengthUnit>('FT');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.orders({unit, limit: 50});
      setOrders(result.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [unit]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading) return <Loader />;

  return (
    <View style={styles.container}>
      <View style={styles.unitBar}>
        <Text style={styles.unitLabel}>Sizes in</Text>
        {LENGTH_UNITS.map(u => (
          <TouchableOpacity
            key={u}
            onPress={() => {
              setUnit(u);
              setLoading(true);
            }}
            style={[styles.unitChip, unit === u && styles.unitChipActive]}>
            <Text style={[styles.unitChipText, unit === u && styles.unitChipTextActive]}>
              {UNIT_LABEL[u]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={orders}
        keyExtractor={order => order.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={<EmptyState message="No orders yet." />}
        renderItem={({item: order}) => (
          <Card onPress={() => navigation.navigate('OrderDetail', {orderId: order.id})}>
            <View style={styles.head}>
              <Text style={styles.code}>{order.code}</Text>
              <StatusPill label={order.status.name} color={order.status.color} />
            </View>
            <Text style={styles.meta}>{order.client.name}</Text>
            <Text style={styles.meta}>{order.location}</Text>
            {order.items[0]?.display ? (
              <Text style={styles.size}>
                {order.items[0].display.length} × {order.items[0].display.width}{' '}
                {UNIT_LABEL[order.items[0].display.unit]}
                {order.items.length > 1 ? `  +${order.items.length - 1} more` : ''}
              </Text>
            ) : null}
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: colors.bg},
  content: {padding: spacing.md, paddingBottom: spacing.xl},
  unitBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  unitLabel: {color: colors.textMuted, fontSize: font.tiny, marginRight: spacing.xs},
  unitChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unitChipActive: {backgroundColor: colors.primary, borderColor: colors.primary},
  unitChipText: {color: colors.textMuted, fontSize: font.tiny, fontWeight: '700'},
  unitChipTextActive: {color: '#fff'},
  head: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  code: {color: colors.text, fontSize: font.body, fontWeight: '700'},
  meta: {color: colors.textMuted, fontSize: font.small, marginTop: 2},
  size: {color: colors.text, fontSize: font.small, marginTop: spacing.xs, fontWeight: '600'},
});
