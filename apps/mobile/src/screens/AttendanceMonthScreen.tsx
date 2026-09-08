import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { AttendanceMonth } from '@decor/shared';
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
import { spacing } from '../theme';

/** Hours and minutes, because 90 minutes reads worse than 1h 30m. */
export function formatMinutes(minutes: number): string {
  if (!minutes) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ''}` : `${rest}m`;
}

/**
 * What each person's month came to.
 *
 * The figure the salary run reads, shown before anybody is paid from it: a
 * shop that disagrees with the days should find out here rather than on a
 * payslip.
 */
export function AttendanceMonthScreen({ navigation }: { navigation: any }) {
  const [month, setMonth] = useState(thisMonth());
  const bounds = monthBounds(month);
  const summary = useApi<AttendanceMonth>(() => api.attendanceSummary(bounds), [month]);

  if (summary.loading && !summary.data) return <Loader label="Adding it up" />;
  const rows = summary.data?.rows ?? [];

  return (
    <Screen refreshing={summary.refreshing} onRefresh={summary.refresh}>
      <ScreenHeader
        title="The month"
        subtitle="What the salary run will read"
        onBack={() => navigation.goBack()}
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <View style={styles.monthRow}>
            <RoundButton icon="chevronLeft" onPress={() => setMonth(shiftMonth(month, -1))} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
                {rows.length} {rows.length === 1 ? 'person' : 'people'}
              </Text>
              <Text variant="h2" tone="onAccent">{month}</Text>
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

      {rows.length === 0 ? (
        <EmptyState icon="users" title="Nobody on the list" />
      ) : (
        rows.map((row) => (
          <Card key={row.employee.id} tone="dark" style={styles.row}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3" numberOfLines={1}>{row.employee.name}</Text>
                <Text variant="tiny" tone="muted">
                  {row.employee.designation ?? row.employee.code}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="h3">{row.payableDays}</Text>
                <Text variant="tiny" tone="muted">payable days</Text>
              </View>
            </View>
            <Text variant="tiny" tone="faint" style={{ marginTop: 4 }}>
              {row.present} in · {row.halfDays} half · {row.absent} absent · {row.leave} leave ·{' '}
              {row.holidays} off · OT {formatMinutes(row.overtimeMinutes)}
            </Text>
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
});
