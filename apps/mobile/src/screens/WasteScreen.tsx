import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { WasteReport } from '@decor/shared';
import { monthBounds, shiftMonth, thisMonth } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  Card,
  EmptyState,
  Field,
  Loader,
  RoundButton,
  Screen,
  ScreenHeader,
  Text,
} from '../ui';
import { palette, radius, spacing } from '../theme';

/**
 * What became of the material that left the rack.
 *
 * The number the owner cannot see today. Waste is measured against what was
 * *issued*, not against what was bought — a shop that buys a hundred sheets
 * and cuts ten has wasted a share of ten, and dividing by a hundred would make
 * every month look better the more it ordered.
 */
export function WasteScreen({ navigation }: { navigation: any }) {
  const [month, setMonth] = useState(thisMonth());
  const report = useApi<WasteReport>(() => api.wasteReport(monthBounds(month)), [month]);

  if (report.loading && !report.data) return <Loader label="Adding it up" />;
  const data = report.data;
  if (!data) return null;

  return (
    <Screen refreshing={report.refreshing} onRefresh={report.refresh}>
      <ScreenHeader
        title="Waste"
        subtitle="Of what was cut, not of what was bought"
        onBack={() => navigation.goBack()}
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <View style={styles.monthRow}>
            <RoundButton icon="chevronLeft" onPress={() => setMonth(shiftMonth(month, -1))} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
                {data.totals.wastePct}% of what was issued
              </Text>
              <Text variant="display" tone="onAccent">{data.totals.wasted}</Text>
              <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75 }}>
                wasted in {month}
              </Text>
            </View>
            <RoundButton
              icon="chevronRight"
              testID="next-month"
              onPress={() => setMonth(shiftMonth(month, 1))}
            />
          </View>
        </Card>
      </Animated.View>

      <Field label="Month" placeholder="YYYY-MM" value={month} onChangeText={setMonth} />

      {data.rows.length === 0 ? (
        <EmptyState icon="layers" title="Nothing was cut this month" />
      ) : (
        data.rows.map((row) => (
          <Card key={row.material.id} tone="dark" style={styles.row}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3" numberOfLines={1}>{row.material.name}</Text>
                <Text variant="tiny" tone="muted">
                  {row.consumed} issued · {row.offcut} back as offcut
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="h3">{row.wastePct}%</Text>
                <Text variant="tiny" tone="muted">
                  {row.wasted} {row.material.stockUnit}
                </Text>
              </View>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${Math.min(100, Math.max(2, row.wastePct))}%` },
                ]}
              />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  track: {
    height: 6,
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceInset,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: radius.pill, backgroundColor: palette.danger },
});
