import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Employee, PayKind, PayStructure } from '@fas/shared';
import {
  PAY_KINDS,
  PAY_KIND_HINTS,
  PAY_KIND_LABELS,
  PERMISSIONS,
  today,
} from '@fas/shared';
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

/**
 * How each person is paid.
 *
 * A raise is a new arrangement rather than an edit, so this list is a history
 * as much as a setting: last month's payslip has to still divide by last
 * month's rate, and the row that produced it stays here saying so.
 */
export function PayStructuresScreen({ navigation }: { navigation: any }) {
  const { can } = useAuth();
  const structures = useApi<PayStructure[]>(() => api.payStructures(), []);
  const people = useApi<{ data: Employee[] }>(() => api.employees({ limit: 200 }), []);

  const [sheet, setSheet] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [kind, setKind] = useState<PayKind>('MONTHLY');
  const [rate, setRate] = useState('');
  const [pieceLabel, setPieceLabel] = useState('');
  const [overtime, setOvertime] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [busy, setBusy] = useState(false);

  const canManage = can(PERMISSIONS.SALARY_MANAGE);

  const save = async () => {
    setBusy(true);
    try {
      await api.setPayStructure({
        employeeId: employeeId!,
        kind,
        rate: Number(rate),
        pieceLabel: kind === 'PIECE' ? pieceLabel.trim() : undefined,
        overtimeHourlyRate: overtime ? Number(overtime) : undefined,
        effectiveFrom,
      });
      haptic('notificationSuccess');
      setSheet(false);
      setRate('');
      structures.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (structures.loading && !structures.data) return <Loader label="Loading" />;
  const rows = structures.data ?? [];

  return (
    <Screen refreshing={structures.refreshing} onRefresh={structures.refresh}>
      <ScreenHeader
        title="How people are paid"
        subtitle="A raise is a new arrangement, not an edit"
        onBack={() => navigation.goBack()}
        right={
          canManage ? (
            <RoundButton icon="plus" testID="add-structure" onPress={() => setSheet(true)} />
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon="card" title="Nobody is on a pay arrangement yet" />
      ) : (
        rows.map((structure, index) => (
          <Animated.View
            key={structure.id}
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}>
            <Card tone="dark" style={styles.row}>
              <View style={styles.rowTop}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="h3" numberOfLines={1}>
                    {structure.employee?.name ?? 'Unknown'}
                  </Text>
                  <Text variant="tiny" tone="muted">
                    {PAY_KIND_LABELS[structure.kind]}
                    {structure.pieceLabel ? ` · per ${structure.pieceLabel}` : ''}
                  </Text>
                  <Text variant="tiny" tone="faint">
                    from {formatDateShort(structure.effectiveFrom)}
                    {structure.effectiveTo
                      ? ` to ${formatDateShort(structure.effectiveTo)}`
                      : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="h3">{formatInr(structure.rate)}</Text>
                  {structure.effectiveTo ? (
                    <Pill label="Replaced" color={palette.textFaint} small />
                  ) : null}
                  {structure.overtimeHourlyRate ? (
                    <Text variant="tiny" tone="muted">
                      OT {formatInr(structure.overtimeHourlyRate)}/h
                    </Text>
                  ) : null}
                </View>
              </View>
            </Card>
          </Animated.View>
        ))
      )}

      <Sheet
        visible={sheet}
        title="New arrangement"
        subtitle="It replaces whatever they were on, from the day it starts"
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
        <Select
          label="Paid how"
          hint={PAY_KIND_HINTS[kind]}
          value={kind}
          options={PAY_KINDS.map((key) => ({ value: key, label: PAY_KIND_LABELS[key] }))}
          onChange={(value) => setKind(value as PayKind)}
        />
        <Field label="Rate" placeholder="0" keyboardType="numeric" value={rate} onChangeText={setRate} />
        {kind === 'PIECE' ? (
          <Field
            label="A piece is"
            placeholder="panel"
            value={pieceLabel}
            onChangeText={setPieceLabel}
          />
        ) : null}
        <Field
          label="Overtime an hour"
          hint="Leave empty if this arrangement pays none"
          keyboardType="numeric"
          value={overtime}
          onChangeText={setOvertime}
        />
        <Field
          label="From"
          placeholder="YYYY-MM-DD"
          value={effectiveFrom}
          onChangeText={setEffectiveFrom}
        />
        <Button
          title="Save"
          loading={busy}
          disabled={!employeeId || !Number(rate) || (kind === 'PIECE' && !pieceLabel.trim())}
          onPress={save}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
});
