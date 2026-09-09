import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Payslip, SalaryRunDetail } from '@fas/shared';
import { PERMISSIONS, SALARY_RUN_LABELS } from '@fas/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import {
  Button,
  Card,
  Field,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Select,
  Sheet,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatInr } from '../lib/format';

/**
 * One month, person by person.
 *
 * The lines are shown rather than the total alone: somebody is going to check
 * this by hand, and "₹21,000" with nothing under it is a number they have to
 * take on trust.
 */
export function SalaryRunScreen({ navigation, route }: { navigation: any; route: any }) {
  const id: string = route.params.id;
  const { can } = useAuth();
  const run = useApi<SalaryRunDetail>(() => api.salaryRun(id), [id]);

  const [editing, setEditing] = useState<Payslip | null>(null);
  const [pieces, setPieces] = useState('');
  const [deduction, setDeduction] = useState('');
  const [deductionNote, setDeductionNote] = useState('');
  const [paying, setPaying] = useState(false);
  const [mode, setMode] = useState<'CASH' | 'ONLINE'>('ONLINE');
  const [busy, setBusy] = useState(false);

  const canManage = can(PERMISSIONS.SALARY_MANAGE);
  const canPay = can(PERMISSIONS.SALARY_PAY);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      haptic('notificationSuccess');
      run.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not do that', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const saveAdjustment = () =>
    act(async () => {
      await api.adjustPayslip(id, editing!.id, {
        pieces: pieces ? Number(pieces) : undefined,
        otherDeductions: deduction ? Number(deduction) : undefined,
        deductionNote: deductionNote.trim() || undefined,
      });
      setEditing(null);
    });

  if (run.loading && !run.data) return <Loader label="Adding it up" />;
  const data = run.data;
  if (!data) return null;

  const draft = data.status === 'DRAFT';
  const paid = data.status === 'PAID';

  return (
    <Screen refreshing={run.refreshing} onRefresh={run.refresh}>
      <ScreenHeader
        title={data.month.slice(0, 7)}
        subtitle={`${data.workingDays} working days`}
        onBack={() => navigation.goBack()}
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <View style={styles.heroTop}>
            <Text variant="label" tone="onAccent" style={{ opacity: 0.75, flex: 1 }}>
              {data.totals.count} {data.totals.count === 1 ? 'payslip' : 'payslips'}
            </Text>
            <Pill
              label={SALARY_RUN_LABELS[data.status]}
              color={paid ? palette.success : draft ? palette.warning : palette.info}
              small
            />
          </View>
          <Text variant="display" tone="onAccent">{formatInr(data.totals.net)}</Text>
          <Text variant="small" tone="onAccent" style={{ opacity: 0.8, marginTop: 4 }}>
            {formatInr(data.totals.gross)} earned, less {formatInr(data.totals.advances)}{' '}
            advanced
            {data.totals.deductions > 0
              ? ` and ${formatInr(data.totals.deductions)} held back`
              : ''}
          </Text>
        </Card>
      </Animated.View>

      {data.payslips.map((slip) => (
        <Card
          key={slip.id}
          tone="dark"
          style={styles.row}
          onPress={
            canManage && !paid
              ? () => {
                  setEditing(slip);
                  setPieces(slip.pieces == null ? '' : String(slip.pieces));
                  setDeduction(
                    Number(slip.otherDeductions) ? String(slip.otherDeductions) : '',
                  );
                  setDeductionNote(slip.deductionNote ?? '');
                }
              : undefined
          }>
          <View style={styles.rowTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="h3" numberOfLines={1}>{slip.employee.name}</Text>
              <Text variant="tiny" tone="muted">
                {slip.payableDays} days
                {slip.overtimeMinutes ? ` · ${slip.overtimeMinutes}m overtime` : ''}
              </Text>
            </View>
            <Text variant="h3">{formatInr(slip.net)}</Text>
          </View>

          {slip.lines.map((line, index) => (
            <View key={`${line.kind}-${index}`} style={styles.line}>
              <Text variant="tiny" tone="muted" style={{ flex: 1 }}>
                {line.label} · {line.quantity} × {formatInr(line.rate)}
              </Text>
              <Text variant="tiny">{formatInr(line.amount)}</Text>
            </View>
          ))}
          {Number(slip.advanceDeducted) > 0 ? (
            <View style={styles.line}>
              <Text variant="tiny" tone="muted" style={{ flex: 1 }}>Advance taken back</Text>
              <Text variant="tiny">− {formatInr(slip.advanceDeducted)}</Text>
            </View>
          ) : null}
          {Number(slip.otherDeductions) > 0 ? (
            <View style={styles.line}>
              <Text variant="tiny" tone="muted" style={{ flex: 1 }}>
                {slip.deductionNote || 'Held back'}
              </Text>
              <Text variant="tiny">− {formatInr(slip.otherDeductions)}</Text>
            </View>
          ) : null}
        </Card>
      ))}

      {canManage && draft ? (
        <View style={styles.actions}>
          <Button
            title="Approve"
            loading={busy}
            onPress={() => act(() => api.approveSalaryRun(id))}
            style={{ flex: 1 }}
          />
          <Button
            title="Throw away"
            variant="danger"
            loading={busy}
            onPress={() =>
              act(async () => {
                await api.discardSalaryRun(id);
                navigation.goBack();
              })
            }
            style={{ flex: 1 }}
          />
        </View>
      ) : null}

      {canPay && data.status === 'APPROVED' ? (
        <Button
          title="Pay it"
          loading={busy}
          onPress={() => setPaying(true)}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}

      {paid ? (
        <Text variant="tiny" tone="faint" style={styles.footnote}>
          Paid. Every payslip posted to the ledger on its own line, so the month can be
          reconciled person by person.
        </Text>
      ) : null}

      <Sheet
        visible={Boolean(editing)}
        title={editing?.employee.name ?? ''}
        subtitle="Piece counts and anything held back"
        onClose={() => setEditing(null)}>
        <Field
          label="Pieces"
          testID="pieces"
          hint="How many they made this month"
          keyboardType="number-pad"
          value={pieces}
          onChangeText={setPieces}
        />
        <Field
          label="Held back"
          testID="held-back"
          keyboardType="numeric"
          value={deduction}
          onChangeText={setDeduction}
        />
        <Field label="What for" value={deductionNote} onChangeText={setDeductionNote} />
        <Button title="Save" loading={busy} onPress={saveAdjustment} />
      </Sheet>

      <Sheet
        visible={paying}
        title="Pay this month?"
        subtitle="One ledger entry per person, so the month reconciles against people rather than a total."
        onClose={() => setPaying(false)}>
        <Select
          label="Paid by"
          value={mode}
          options={[
            { value: 'ONLINE', label: 'Bank transfer' },
            { value: 'CASH', label: 'Cash' },
          ]}
          onChange={(value) => setMode(value as 'CASH' | 'ONLINE')}
        />
        <Button
          title="Pay it"
          loading={busy}
          onPress={() =>
            act(async () => {
              await api.paySalaryRun(id, mode);
              setPaying(false);
            })
          }
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  footnote: { marginTop: spacing.lg, textAlign: 'center' },
});
