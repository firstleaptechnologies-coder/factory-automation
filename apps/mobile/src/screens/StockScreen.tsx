import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { StockLevels } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  Card,
  Chip,
  EmptyState,
  Field,
  Loader,
  Pill,
  RoundButton,
  Screen,
  ScreenHeader,
  Text,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatInr } from '../lib/format';

/**
 * What is on the rack.
 *
 * Summed from every move rather than read off a stored level: a quantity
 * somebody can type over is a quantity with no explanation behind it, and
 * "where did four sheets go" is the question this screen exists to answer.
 */
export function StockScreen({ navigation }: { navigation: any }) {
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  const stock = useApi<StockLevels>(
    () => api.stockLevels({ search: search || undefined, lowOnly }),
    [search, lowOnly],
  );

  if (stock.loading && !stock.data) return <Loader label="Counting the rack" />;
  const data = stock.data;
  if (!data) return null;

  return (
    <Screen refreshing={stock.refreshing} onRefresh={stock.refresh}>
      <ScreenHeader
        title="Stock"
        subtitle="What is on the rack"
        onBack={() => navigation.goBack()}
        right={<RoundButton icon="trend" onPress={() => navigation.navigate('Waste')} />}
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
            The rack is worth
          </Text>
          <Text variant="display" tone="onAccent">{formatInr(data.totals.value)}</Text>
          {data.totals.low > 0 ? (
            <Text variant="small" tone="onAccent" style={{ opacity: 0.8, marginTop: 4 }}>
              {data.totals.low} {data.totals.low === 1 ? 'material needs' : 'materials need'}{' '}
              ordering
            </Text>
          ) : null}
        </Card>
      </Animated.View>

      <Field
        label="Search"
        placeholder="Material name or code"
        value={search}
        onChangeText={setSearch}
        containerStyle={{ marginTop: spacing.lg }}
      />

      <View style={styles.filters}>
        <Chip
          label="Everything"
          selected={!lowOnly}
          onPress={() => setLowOnly(false)}
        />
        <Chip
          label="Needs ordering"
          testID="low-only"
          selected={lowOnly}
          onPress={() => setLowOnly(true)}
        />
      </View>

      {data.rows.length === 0 ? (
        <EmptyState
          icon="layers"
          title={lowOnly ? 'Nothing needs ordering' : 'Nothing on the rack yet'}
          message={lowOnly ? undefined : 'Stock arrives against a purchase'}
        />
      ) : (
        data.rows.map((row) => (
          <Card
            key={row.material.id}
            tone="dark"
            style={styles.row}
            onPress={() =>
              navigation.navigate('StockMoves', { materialId: row.material.id })
            }>
            <View style={styles.rowTop}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: row.material.color ?? palette.textFaint },
                ]}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3" numberOfLines={1}>{row.material.name}</Text>
                <Text variant="tiny" tone="muted">
                  {formatInr(row.value)}
                  {row.averageRate > 0 ? ` · ${formatInr(row.averageRate)} each` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="h3">
                  {row.quantity} {row.material.stockUnit}
                </Text>
                {row.low ? <Pill label="Order more" color={palette.warning} small /> : null}
              </View>
            </View>

            {row.byThickness.filter((one) => one.quantity !== 0).length > 0 ? (
              <Text variant="tiny" tone="faint" style={{ marginTop: 4 }}>
                {row.byThickness
                  .filter((one) => one.quantity !== 0)
                  .map(
                    (one) =>
                      `${one.thickness.label ?? `${one.thickness.valueMm}mm`}: ${one.quantity}`,
                  )
                  .join(' · ')}
              </Text>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
