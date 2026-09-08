import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { SalaryRun, SalaryRunStatus } from '@decor/shared';
import { PERMISSIONS, SALARY_RUN_LABELS, shiftMonth, thisMonth } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Loader,
  Pill,
  RoundButton,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';

/** The colour a month's standing reads as. */
const TONE: Record<SalaryRunStatus, string> = {
  DRAFT: palette.warning,
  APPROVED: palette.info,
  PAID: palette.success,
};

/** The month a run pays for, from its first day. */
export function monthOf(run: { month: string }): string {
  return run.month.slice(0, 7);
}

/**
 * A month of pay at a time.
 *
 * Opening one drafts a payslip for everybody from the register and their
 * arrangements. Nothing has moved until somebody approves it and pays it —
 * two separate decisions, often two separate people.
 */
export function SalaryScreen({ navigation }: { navigation: any }) {
  const { can } = useAuth();
  const runs = useApi<SalaryRun[]>(() => api.salaryRuns(), []);

  const [opening, setOpening] = useState(false);
  const [month, setMonth] = useState(shiftMonth(thisMonth(), -1));
  const [workingDays, setWorkingDays] = useState('26');
  const [busy, setBusy] = useState(false);

  const canManage = can(PERMISSIONS.SALARY_MANAGE);

  const open = async () => {
    setBusy(true);
    try {
      const run = await api.openSalaryRun({ month, workingDays: Number(workingDays) });
      haptic('notificationSuccess');
      setOpening(false);
      navigation.navigate('SalaryRun', { id: run.id });
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not open it', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (runs.loading && !runs.data) return <Loader label="Loading" />;
  const rows = runs.data ?? [];

  return (
    <Screen refreshing={runs.refreshing} onRefresh={runs.refresh}>
      <ScreenHeader
        title="Salary"
        subtitle="A month at a time"
        onBack={() => navigation.goBack()}
        right={
          <View style={styles.actions}>
            <RoundButton icon="tune" onPress={() => navigation.navigate('PayStructures')} />
            <RoundButton
              icon="arrowUpRight"
              onPress={() => navigation.navigate('SalaryAdvances')}
            />
            {canManage ? (
              <RoundButton icon="plus" testID="open-month" onPress={() => setOpening(true)} />
            ) : null}
          </View>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon="card"
          title="No month opened yet"
          message={canManage ? 'Tap + to work out a month' : undefined}
        />
      ) : (
        rows.map((run, index) => (
          <Animated.View
            key={run.id}
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}>
            <Card
              tone="dark"
              style={styles.row}
              onPress={() => navigation.navigate('SalaryRun', { id: run.id })}>
              <View style={styles.rowTop}>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">{monthOf(run)}</Text>
                  <Text variant="tiny" tone="muted">
                    {run._count?.payslips ?? 0} payslips · {run.workingDays} working days
                  </Text>
                </View>
                <Pill label={SALARY_RUN_LABELS[run.status]} color={TONE[run.status]} small />
              </View>
            </Card>
          </Animated.View>
        ))
      )}

      <Sheet
        visible={opening}
        title="Open a month"
        subtitle="Everybody gets a draft payslip from the register and their arrangement"
        onClose={() => setOpening(false)}>
        <Field label="Month" placeholder="YYYY-MM" value={month} onChangeText={setMonth} />
        <Field
          label="Working days"
          hint="How many days this shop calls a full month"
          keyboardType="number-pad"
          value={workingDays}
          onChangeText={setWorkingDays}
        />
        <View style={styles.presets}>
          {['26', '30'].map((days) => (
            <Chip
              key={days}
              label={`${days} days`}
              selected={workingDays === days}
              onPress={() => setWorkingDays(days)}
            />
          ))}
        </View>
        <Button
          title="Work it out"
          loading={busy}
          disabled={!month || !Number(workingDays)}
          onPress={open}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  presets: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
});
