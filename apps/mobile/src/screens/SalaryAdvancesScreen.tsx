import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Employee, SalaryAdvance } from '@decor/shared';
import { PERMISSIONS, today } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Loader,
  Pill,
  RoundButton,
  Screen,
  ScreenHeader,
  Select,
  Sheet,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatDateShort, formatInr } from '../lib/format';

/** What is still owed on one advance. */
export function outstanding(advance: SalaryAdvance): number {
  return Math.max(0, Number(advance.amount) - Number(advance.recoveredAmount));
}

/**
 * Money handed over before it is earned.
 *
 * It leaves the drawer the day it is given — so it posts to the ledger then,
 * not when a payslip eventually takes it back. Recording it only as a
 * deduction would have the cash position wrong for however long that took.
 */
export function SalaryAdvancesScreen({ navigation }: { navigation: any }) {
  const { can } = useAuth();
  const advances = useApi<SalaryAdvance[]>(() => api.salaryAdvances(), []);
  const people = useApi<{ data: Employee[] }>(() => api.employees({ limit: 200 }), []);

  const [sheet, setSheet] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [givenOn, setGivenOn] = useState(today());
  const [mode, setMode] = useState<'CASH' | 'ONLINE'>('CASH');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const canManage = can(PERMISSIONS.SALARY_MANAGE);

  const give = async () => {
    setBusy(true);
    try {
      await api.giveSalaryAdvance({
        employeeId: employeeId!,
        amount: Number(amount),
        givenOn,
        mode,
        note: note.trim() || undefined,
      });
      haptic('notificationSuccess');
      setSheet(false);
      setAmount('');
      setNote('');
      advances.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (advances.loading && !advances.data) return <Loader label="Loading" />;
  const rows = advances.data ?? [];
  const owed = rows.reduce((total, advance) => total + outstanding(advance), 0);

  return (
    <Screen refreshing={advances.refreshing} onRefresh={advances.refresh}>
      <ScreenHeader
        title="Advances"
        subtitle="Paid before it was earned"
        onBack={() => navigation.goBack()}
        right={
          canManage ? (
            <RoundButton icon="plus" testID="give-advance" onPress={() => setSheet(true)} />
          ) : null
        }
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
            Still to come back
          </Text>
          <Text variant="display" tone="onAccent">{formatInr(owed)}</Text>
        </Card>
      </Animated.View>

      {rows.length === 0 ? (
        <EmptyState icon="arrowUpRight" title="Nothing advanced" />
      ) : (
        rows.map((advance) => {
          const left = outstanding(advance);
          return (
            <Card key={advance.id} tone="dark" style={styles.row}>
              <View style={styles.rowTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="h3" numberOfLines={1}>
                    {advance.employee?.name ?? 'Unknown'}
                  </Text>
                  <Text variant="tiny" tone="muted">
                    {formatDateShort(advance.givenOn)} ·{' '}
                    {advance.mode === 'CASH' ? 'cash' : 'bank'}
                  </Text>
                  {advance.note ? (
                    <Text variant="tiny" tone="faint">{advance.note}</Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="h3">{formatInr(advance.amount)}</Text>
                  <Pill
                    label={left > 0 ? `${formatInr(left)} left` : 'Recovered'}
                    color={left > 0 ? palette.warning : palette.success}
                    small
                  />
                </View>
              </View>
            </Card>
          );
        })
      )}

      <Sheet
        visible={sheet}
        title="Give an advance"
        subtitle="It leaves the drawer today and comes off a payslip later"
        onClose={() => setSheet(false)}>
        <Select
          label="Who"
          value={employeeId}
          options={(people.data?.data ?? []).map((person) => ({
            value: person.id,
            label: `${person.name} · ${person.code}`,
          }))}
          onChange={setEmployeeId}
        />
        <Field label="Amount" placeholder="0" keyboardType="numeric" value={amount} onChangeText={setAmount} />
        <Select
          label="Paid by"
          value={mode}
          options={[
            { value: 'CASH', label: 'Cash' },
            { value: 'ONLINE', label: 'Bank transfer' },
          ]}
          onChange={(value) => setMode(value as 'CASH' | 'ONLINE')}
        />
        <Field label="When" placeholder="YYYY-MM-DD" value={givenOn} onChangeText={setGivenOn} />
        <Field label="Note" value={note} onChangeText={setNote} />
        <Button
          title="Give it"
          loading={busy}
          disabled={!employeeId || !Number(amount)}
          onPress={give}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
});
