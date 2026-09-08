import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { AttendanceDay, AttendanceMark, MarkInput } from '@decor/shared';
import { ATTENDANCE_LABELS, ATTENDANCE_MARKS, PERMISSIONS, shiftDay, today } from '@decor/shared';
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
  RoundButton,
  Screen,
  ScreenHeader,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';

/** The colour each mark reads as. */
const TONE: Record<AttendanceMark, string> = {
  PRESENT: palette.success,
  HALF_DAY: palette.warning,
  ABSENT: palette.danger,
  LEAVE: palette.info,
  HOLIDAY: palette.textMuted,
  WEEKLY_OFF: palette.textFaint,
};

/**
 * Marking in and marking out, never punching.
 *
 * The whole shop on one screen, marked in one go: that is how somebody at the
 * door actually does it, and saving a row at a time would leave half a
 * register on a morning the network was bad.
 */
export function AttendanceScreen({ navigation }: { navigation: any }) {
  const { can } = useAuth();
  const [date, setDate] = useState(today());
  const register = useApi<AttendanceDay>(() => api.attendanceDay(date), [date]);

  /** What is on screen but not yet saved. */
  const [draft, setDraft] = useState<Record<string, AttendanceMark>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const rows = register.data?.rows ?? [];
    setDraft(
      Object.fromEntries(
        rows.filter((row) => row.mark).map((row) => [row.employee.id, row.mark!]),
      ),
    );
  }, [register.data]);

  const canMark = can(PERMISSIONS.ATTENDANCE_MARK);

  const save = async () => {
    const marks: MarkInput[] = Object.entries(draft).map(([employeeId, mark]) => ({
      employeeId,
      mark,
    }));
    if (!marks.length) return;

    setBusy(true);
    try {
      await api.markAttendance(date, marks);
      haptic('notificationSuccess');
      register.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  /** Marks everybody who has not been marked yet. */
  const markRest = (mark: AttendanceMark) => {
    const rows = register.data?.rows ?? [];
    setDraft((current) => {
      const next = { ...current };
      for (const row of rows) if (!next[row.employee.id]) next[row.employee.id] = mark;
      return next;
    });
  };

  if (register.loading && !register.data) return <Loader label="Loading the register" />;
  const rows = register.data?.rows ?? [];
  const unmarked = rows.filter((row) => !draft[row.employee.id]).length;

  return (
    <Screen refreshing={register.refreshing} onRefresh={register.refresh}>
      <ScreenHeader
        title="Attendance"
        subtitle="Marked in and out — not punched"
        onBack={() => navigation.goBack()}
        right={
          <RoundButton icon="history" onPress={() => navigation.navigate('AttendanceMonth')} />
        }
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <View style={styles.dayRow}>
            <RoundButton icon="chevronLeft" onPress={() => setDate(shiftDay(date, -1))} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
                {unmarked === 0 ? 'Everybody marked' : `${unmarked} still to mark`}
              </Text>
              <Text variant="h2" tone="onAccent">{date}</Text>
            </View>
            <RoundButton
              icon="chevronRight"
              testID="next-day"
              onPress={() => setDate(shiftDay(date, 1))}
            />
          </View>
        </Card>
      </Animated.View>

      <Field label="Day" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} />

      {canMark && unmarked > 0 ? (
        <View style={styles.bulk}>
          <Text variant="tiny" tone="muted" style={{ flex: 1 }}>
            Mark everybody left
          </Text>
          <Chip label="In" testID="all-in" onPress={() => markRest('PRESENT')} />
          <Chip
            label="Weekly off"
            testID="all-off"
            onPress={() => markRest('WEEKLY_OFF')}
          />
        </View>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon="users" title="Nobody to mark" message="Add employees first" />
      ) : (
        rows.map((row) => (
          <Card key={row.employee.id} tone="dark" style={styles.row}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3" numberOfLines={1}>{row.employee.name}</Text>
                <Text variant="tiny" tone="muted" numberOfLines={1}>
                  {row.employee.designation ?? row.employee.code}
                </Text>
              </View>
              {row.markedBy ? (
                <Text variant="tiny" tone="faint">by {row.markedBy.name}</Text>
              ) : null}
            </View>
            <View style={styles.marks}>
              {ATTENDANCE_MARKS.map((mark) => (
                <Chip
                  key={mark}
                  label={ATTENDANCE_LABELS[mark]}
                  selected={draft[row.employee.id] === mark}
                  accent={TONE[mark]}
                  onPress={() =>
                    canMark
                      ? setDraft((current) => ({ ...current, [row.employee.id]: mark }))
                      : undefined
                  }
                />
              ))}
            </View>
          </Card>
        ))
      )}

      {canMark && rows.length > 0 ? (
        <Button
          title="Save the register"
          loading={busy}
          disabled={Object.keys(draft).length === 0}
          onPress={save}
          style={{ marginTop: spacing.lg }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  bulk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  row: { marginBottom: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  marks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
});
