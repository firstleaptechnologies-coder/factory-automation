import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { ExpenseAnalytics, ExpenseSlice } from '@decor/shared';
import { isoDate } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { Card, Chip, EmptyState, Loader, Screen, ScreenHeader, Text } from '../ui';
import { palette, radius, spacing } from '../theme';
import { formatInr } from '../lib/format';

/** The windows worth asking for, without making anybody type a date. */
const WINDOWS = [
  { key: 'all', label: 'All time' },
  { key: 'year', label: 'This year' },
  { key: 'month', label: 'This month' },
] as const;

type Window = (typeof WINDOWS)[number]['key'];

/** The first day of the window, or nothing at all for all time. */
export function windowStart(key: Window, now = new Date()): string | undefined {
  if (key === 'all') return undefined;
  // Local, like every date a person picks: a shop is asking about its own
  // year, not about UTC's.
  return isoDate(new Date(now.getFullYear(), key === 'month' ? now.getMonth() : 0, 1));
}

/** Where the money went, cut the four ways the shop asks about. */
export function ExpenseAnalyticsScreen({ navigation }: { navigation: any }) {
  const [window, setWindow] = useState<Window>('year');
  const analytics = useApi<ExpenseAnalytics>(
    () => api.expenseAnalytics({ from: windowStart(window) }),
    [window],
  );

  if (analytics.loading) return <Loader label="Adding it up" />;
  const data = analytics.data;
  if (!data) return null;

  return (
    <Screen refreshing={analytics.refreshing} onRefresh={analytics.refresh}>
      <ScreenHeader
        title="Where the money went"
        subtitle="Spending, cut four ways"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.windows}>
        {WINDOWS.map((option) => (
          <Chip
            key={option.key}
            label={option.label}
            selected={window === option.key}
            onPress={() => setWindow(option.key)}
          />
        ))}
      </View>

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
            {data.count} entr{data.count === 1 ? 'y' : 'ies'}
          </Text>
          <Text variant="display" tone="onAccent">{formatInr(data.total)}</Text>
        </Card>
      </Animated.View>

      {data.count === 0 ? (
        <EmptyState icon="receipt" title="Nothing spent in this window" />
      ) : (
        <>
          <Breakdown title="By category" slices={data.bySpentType} total={data.total} />
          <Breakdown title="By who spent it" slices={data.byDoneBy} total={data.total} />
          <Breakdown title="By how it was paid" slices={data.byPaymentType} total={data.total} />
          <Breakdown title="Top recipients" slices={data.byToName} total={data.total} />
        </>
      )}
    </Screen>
  );
}

/**
 * One cut of the spending.
 *
 * A bar per row rather than a pie: the question is nearly always "what is the
 * big one", and a length is easier to compare than an angle.
 */
function Breakdown({
  title,
  slices,
  total,
}: {
  title: string;
  slices: ExpenseSlice[];
  total: number;
}) {
  if (slices.length === 0) return null;
  return (
    <Card tone="dark" style={styles.block}>
      <Text variant="label" tone="muted">{title}</Text>
      {slices.map((slice) => (
        <View key={slice.label} style={styles.slice}>
          <View style={styles.sliceHead}>
            <Text variant="small" numberOfLines={1} style={{ flex: 1 }}>{slice.label}</Text>
            <Text variant="small" bold>{formatInr(slice.amount)}</Text>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                accentFill,
                { width: `${total > 0 ? Math.max(2, (slice.amount / total) * 100) : 0}%` },
              ]}
            />
          </View>
        </View>
      ))}
    </Card>
  );
}

/**
 * Applied inline wherever the accent is painted. A StyleSheet freezes the
 * colour at import time, and the accent is configurable per tenant at runtime.
 */
const accentFill = { backgroundColor: palette.accent };

const styles = StyleSheet.create({
  windows: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  block: { marginTop: spacing.lg, gap: spacing.sm },
  slice: { gap: 4 },
  sliceHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'baseline' },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceInset,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: radius.pill },
});
