import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Employee, EmployeeIdentifiers } from '@decor/shared';
import { EMPLOYMENT_STATUS_LABELS, PERMISSIONS, today } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import {
  Avatar,
  Button,
  Card,
  Field,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  haptic,
} from '../ui';
import { palette, spacing } from '../theme';
import { formatDateShort } from '../lib/format';

/** One person: what they do, what is on file, and how to reach them. */
export function EmployeeDetailScreen({ navigation, route }: { navigation: any; route: any }) {
  const id: string = route.params.id;
  const { can } = useAuth();
  const employee = useApi<Employee>(() => api.employee(id), [id]);

  const [secrets, setSecrets] = useState<EmployeeIdentifiers | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leftOn, setLeftOn] = useState(today());
  const [busy, setBusy] = useState(false);

  const canManage = can(PERMISSIONS.EMPLOYEE_MANAGE);
  const canReveal = can(PERMISSIONS.EMPLOYEE_IDENTIFIERS);

  /**
   * Fetches the whole numbers, on purpose.
   *
   * They are not sent with the employee: a list of staff should not carry
   * every identifier in the shop through the browser, and asking for them by
   * name means "who read this person's Aadhaar" has an answer.
   */
  const reveal = async () => {
    try {
      setSecrets(await api.employeeIdentifiers(id));
    } catch (e) {
      Alert.alert('Could not read them', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const markLeft = async () => {
    setBusy(true);
    try {
      await api.markEmployeeLeft(id, leftOn);
      haptic('notificationSuccess');
      setLeaving(false);
      employee.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (employee.loading) return <Loader label="Loading" />;
  const person = employee.data;
  if (!person) return null;

  const gone = person.status === 'LEFT';

  return (
    <Screen refreshing={employee.refreshing} onRefresh={employee.refresh}>
      <ScreenHeader
        title={person.name}
        subtitle={person.code}
        onBack={() => navigation.goBack()}
      />

      <Animated.View entering={FadeInDown.duration(400).springify()}>
        <Card tone="accent">
          <View style={styles.head}>
            <Avatar name={person.name} />
            <View style={{ flex: 1 }}>
              <Text variant="h2" tone="onAccent">
                {person.designation ?? 'No designation'}
              </Text>
              <Text variant="small" tone="onAccent" style={{ opacity: 0.8 }}>
                {person.department ?? 'No department'} · joined{' '}
                {formatDateShort(person.joinedOn)}
              </Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      <Card tone="dark" style={styles.block}>
        <View style={styles.rowBetween}>
          <Text variant="label" style={{ flex: 1 }}>Standing</Text>
          <Pill
            label={EMPLOYMENT_STATUS_LABELS[person.status]}
            color={gone ? palette.textFaint : palette.success}
            small
          />
        </View>
        {person.leftOn ? <Row label="Left on" value={formatDateShort(person.leftOn)} /> : null}
        <Row label="Phone" value={person.phone ?? '—'} />
        {person.user ? (
          <Row label="Login" value={`${person.user.name} · ${person.user.code}`} />
        ) : (
          <Row label="Login" value="None — they do not use the app" />
        )}
      </Card>

      <Card tone="dark" style={styles.block}>
        <Text variant="label">Identifiers</Text>
        <Text variant="tiny" tone="muted">
          Stored encrypted. Only the last four digits are kept in the open.
        </Text>
        <Row
          label="Aadhaar"
          value={
            secrets?.aadhaar ??
            (person.aadhaarLast4 ? `•••• •••• ${person.aadhaarLast4}` : 'Not on file')
          }
        />
        <Row
          label="PAN"
          value={secrets?.pan ?? (person.panLast4 ? `•••••${person.panLast4}` : 'Not on file')}
        />
        <Row
          label="Account"
          value={
            secrets?.bankAccountNumber ??
            (person.bankAccountLast4 ? `•••••• ${person.bankAccountLast4}` : 'Not on file')
          }
        />
        {person.bankIfsc ? <Row label="IFSC" value={person.bankIfsc} /> : null}
        {canReveal && !secrets && (person.aadhaarLast4 || person.panLast4 || person.bankAccountLast4) ? (
          <Button title="Show the full numbers" variant="dark" onPress={reveal} />
        ) : null}
      </Card>

      {person.address || person.emergencyName ? (
        <Card tone="dark" style={styles.block}>
          <Text variant="label">If something happens</Text>
          {person.address ? <Row label="Address" value={person.address} /> : null}
          {person.emergencyName ? (
            <Row
              label="Who to call"
              value={`${person.emergencyName}${
                person.emergencyPhone ? ` · ${person.emergencyPhone}` : ''
              }`}
            />
          ) : null}
        </Card>
      ) : null}

      {canManage ? (
        <View style={styles.actions}>
          <Button
            title="Edit"
            variant="dark"
            onPress={() => navigation.navigate('EmployeeForm', { id })}
            style={{ flex: 1 }}
          />
          <Button
            title="Letters"
            variant="dark"
            onPress={() => navigation.navigate('EmployeeLetters', { id })}
            style={{ flex: 1 }}
          />
          {gone ? null : (
            <Button
              title="They have left"
              variant="danger"
              onPress={() => setLeaving(true)}
              style={{ flex: 1 }}
            />
          )}
        </View>
      ) : null}

      <Sheet
        visible={leaving}
        title="Mark them as left?"
        subtitle="The record stays — their attendance and payslips hang off it. Their login is switched off."
        onClose={() => setLeaving(false)}>
        <Field label="Last day" placeholder="YYYY-MM-DD" value={leftOn} onChangeText={setLeftOn} />
        <Button title="Save" variant="danger" loading={busy} onPress={markLeft} />
      </Sheet>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowBetween}>
      <Text variant="tiny" tone="muted">{label}</Text>
      <Text variant="small" style={{ flex: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  block: { marginTop: spacing.lg, gap: spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
