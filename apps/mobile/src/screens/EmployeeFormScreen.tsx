import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Employee, EmploymentStatus, WorkspaceUser } from '@decor/shared';
import { EMPLOYMENT_STATUS_LABELS, today } from '@decor/shared';
import { api } from '../api/client';
import { useApi } from '../hooks/useApi';
import {
  Button,
  Card,
  Field,
  Loader,
  Screen,
  ScreenHeader,
  Select,
  Text,
  haptic,
} from '../ui';
import { spacing } from '../theme';

/**
 * Add somebody, or correct their details.
 *
 * The identifiers are write-only here: what is stored is encrypted and what
 * comes back is the last four digits, so this form shows what is on file
 * rather than pretending to have the number. Typing a new one replaces it;
 * leaving it alone leaves it alone.
 */
export function EmployeeFormScreen({ navigation, route }: { navigation: any; route: any }) {
  const id: string | undefined = route?.params?.id;
  const existing = useApi<Employee | null>(
    () => (id ? api.employee(id) : Promise.resolve(null)),
    [id],
  );
  const users = useApi<WorkspaceUser[]>(() => api.users(), []);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('');
  const [joinedOn, setJoinedOn] = useState(today());
  const [status, setStatus] = useState<EmploymentStatus>('ACTIVE');
  const [userId, setUserId] = useState<string | null>(null);

  const [aadhaar, setAadhaar] = useState('');
  const [pan, setPan] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');

  const [address, setAddress] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const row = existing.data;
    if (!row) return;
    setName(row.name);
    setPhone(row.phone ?? '');
    setDesignation(row.designation ?? '');
    setDepartment(row.department ?? '');
    setJoinedOn(row.joinedOn.slice(0, 10));
    setStatus(row.status);
    setUserId(row.userId ?? null);
    setBankAccountName(row.bankAccountName ?? '');
    setBankIfsc(row.bankIfsc ?? '');
    setAddress(row.address ?? '');
    setEmergencyName(row.emergencyName ?? '');
    setEmergencyPhone(row.emergencyPhone ?? '');
  }, [existing.data]);

  const submit = async () => {
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        phone: phone.trim() || undefined,
        designation: designation.trim() || undefined,
        department: department.trim() || undefined,
        joinedOn,
        status,
        userId: userId ?? undefined,
        aadhaar: aadhaar.replace(/\s+/g, '') || undefined,
        pan: pan.trim().toUpperCase() || undefined,
        bankAccountName: bankAccountName.trim() || undefined,
        bankAccountNumber: bankAccountNumber.replace(/\s+/g, '') || undefined,
        bankIfsc: bankIfsc.trim().toUpperCase() || undefined,
        address: address.trim() || undefined,
        emergencyName: emergencyName.trim() || undefined,
        emergencyPhone: emergencyPhone.trim() || undefined,
      };
      const saved = id ? await api.updateEmployee(id, body) : await api.createEmployee(body);
      haptic('notificationSuccess');
      navigation.replace('EmployeeDetail', { id: saved.id });
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (existing.loading) return <Loader label="Loading" />;
  const onFile = existing.data;

  return (
    <Screen>
      <ScreenHeader
        title={id ? 'Edit employee' : 'Add an employee'}
        subtitle={id ? onFile?.code : 'They need no login unless you give them one'}
        onBack={() => navigation.goBack()}
      />

      <Animated.View entering={FadeInDown.duration(320)}>
        <Field label="Name" placeholder="Ramesh Kumar" value={name} onChangeText={setName} />
        <Field
          label="Phone"
          placeholder="98765 43210"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <Field
          label="What they do"
          placeholder="CNC operator"
          value={designation}
          onChangeText={setDesignation}
        />
        <Field
          label="Department"
          placeholder="Production"
          value={department}
          onChangeText={setDepartment}
        />
        <Field label="Joined on" placeholder="YYYY-MM-DD" value={joinedOn} onChangeText={setJoinedOn} />

        <Select
          label="Standing"
          value={status}
          options={(['ACTIVE', 'ON_LEAVE', 'LEFT'] as const).map((key) => ({
            value: key,
            label: EMPLOYMENT_STATUS_LABELS[key],
          }))}
          onChange={(value) => setStatus(value as EmploymentStatus)}
        />

        <Select
          label="Login"
          hint="Most of the floor will never need one"
          value={userId}
          options={[
            { value: '', label: 'No login' },
            ...(users.data ?? []).map((user) => ({
              value: user.id,
              label: `${user.name} · ${user.code}`,
            })),
          ]}
          onChange={(value) => setUserId(value || null)}
        />

        <Card tone="dark" style={styles.block}>
          <Text variant="label">Identifiers</Text>
          <Text variant="tiny" tone="muted">
            Stored encrypted. Only the last four digits are ever shown.
          </Text>
          <Field
            label="Aadhaar"
            placeholder={onFile?.aadhaarLast4 ? `•••• •••• ${onFile.aadhaarLast4}` : '1234 1234 1234'}
            keyboardType="number-pad"
            value={aadhaar}
            onChangeText={setAadhaar}
          />
          <Field
            label="PAN"
            placeholder={onFile?.panLast4 ? `•••••${onFile.panLast4}` : 'ABCDE1234F'}
            autoCapitalize="characters"
            value={pan}
            onChangeText={setPan}
          />
        </Card>

        <Card tone="dark" style={styles.block}>
          <Text variant="label">Where the salary goes</Text>
          <Field
            label="Account name"
            value={bankAccountName}
            onChangeText={setBankAccountName}
          />
          <Field
            label="Account number"
            placeholder={
              onFile?.bankAccountLast4 ? `•••••• ${onFile.bankAccountLast4}` : '50100123456789'
            }
            keyboardType="number-pad"
            value={bankAccountNumber}
            onChangeText={setBankAccountNumber}
          />
          <Field
            label="IFSC"
            placeholder="HDFC0001234"
            autoCapitalize="characters"
            value={bankIfsc}
            onChangeText={setBankIfsc}
          />
        </Card>

        <Card tone="dark" style={styles.block}>
          <Text variant="label">If something happens</Text>
          <Field label="Address" value={address} onChangeText={setAddress} multiline />
          <Field label="Who to call" value={emergencyName} onChangeText={setEmergencyName} />
          <Field
            label="Their number"
            keyboardType="phone-pad"
            value={emergencyPhone}
            onChangeText={setEmergencyPhone}
          />
        </Card>

        <Button
          title={id ? 'Save' : 'Add them'}
          loading={busy}
          disabled={name.trim().length < 2 || !joinedOn}
          onPress={submit}
          style={{ marginTop: spacing.lg }}
        />
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.lg },
});
