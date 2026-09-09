import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { PLATFORM_PERMISSION_TREE } from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import { PermissionTree } from '../../components/PermissionTree';
import {
  Button,
  Card,
  Chip,
  Field,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  haptic,
} from '../../ui';
import { palette, spacing } from '../../theme';

interface PlatformRole {
  id: string;
  key: string;
  name: string;
  blurb: string;
  permissions: string[];
  isSystem: boolean;
  people: number;
}

interface Staff {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
}

/**
 * Who at FirstLeap may do what.
 *
 * The roles were four constants in shared code, which made the shape of the
 * company a release. They are rows now, edited on the same tree the shops use
 * for their own — one component, not two that drift.
 *
 * The API refuses two things whatever this screen allows: a save leaving
 * nobody able to manage staff, and somebody stripping their own ability to
 * undo what they just did. There is no support desk above us.
 */
export function PlatformStaffScreen({ navigation }: { navigation: any }) {
  const { can, user } = useAuth();
  const roles = useApi<PlatformRole[]>(() => api.platformRoles() as Promise<PlatformRole[]>, []);
  const staff = useApi<Staff[]>(() => api.platformStaff() as Promise<Staff[]>, []);

  const mayManage = can('platform.staff.manage');

  const [editing, setEditing] = useState<PlatformRole | null>(null);
  const [name, setName] = useState('');
  const [granted, setGranted] = useState<string[]>([]);
  const [person, setPerson] = useState<Staff | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      haptic('notificationSuccess');
      roles.reload();
      staff.reload();
      return true;
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openRole = (role: PlatformRole) => {
    setEditing(role);
    setName(role.name);
    setGranted(role.permissions);
  };

  if (!roles.data) return <Loader label="Loading" />;

  const roleNamed = (key: string) => roles.data?.find((one) => one.key === key)?.name ?? key;

  return (
    <Screen refreshing={roles.refreshing} onRefresh={roles.refresh}>
      <ScreenHeader
        title="Staff and roles"
        subtitle="Who at FirstLeap may do what"
        onBack={() => navigation.goBack()}
      />

      <Text variant="label" tone="muted" style={styles.head}>Roles</Text>
      {roles.data.map((role) => (
        <Card
          key={role.id}
          tone="dark"
          style={styles.card}
          onPress={mayManage ? () => openRole(role) : undefined}>
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="h3">{role.name}</Text>
              <Text variant="tiny" tone="muted">
                {role.permissions.length} permissions · {role.people}{' '}
                {role.people === 1 ? 'person' : 'people'}
              </Text>
            </View>
            {role.isSystem ? <Pill label="Seeded" color={palette.textFaint} small /> : null}
          </View>
        </Card>
      ))}

      <Text variant="label" tone="muted" style={styles.head}>People</Text>
      {(staff.data ?? []).map((one) => (
        <Card
          key={one.id}
          tone="dark"
          style={styles.card}
          onPress={mayManage ? () => setPerson(one) : undefined}>
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="h3" numberOfLines={1}>{one.name}</Text>
              <Text variant="tiny" tone="muted">
                {one.email} · {roleNamed(one.role)}
              </Text>
            </View>
            {one.id === user?.id ? <Pill label="You" color={palette.accent} small /> : null}
            {one.isActive ? null : (
              <Pill label="Switched off" color={palette.textFaint} small />
            )}
          </View>
        </Card>
      ))}

      <Sheet
        visible={Boolean(editing)}
        title={editing?.name ?? ''}
        subtitle="Tick what this kind of colleague may do"
        onClose={() => setEditing(null)}>
        <Field label="Called" value={name} onChangeText={setName} />
        <View style={styles.tree}>
          <PermissionTree
            granted={granted}
            sections={PLATFORM_PERMISSION_TREE}
            // Nothing here is gated by a module: a client's plan cannot decide
            // what we may do about them.
            has={() => true}
            onChange={setGranted}
          />
        </View>
        <Button
          title="Save"
          loading={busy}
          disabled={name.trim().length < 2}
          onPress={async () => {
            const done = await run(() =>
              api.savePlatformRole(editing!.key, { name: name.trim(), permissions: granted }),
            );
            if (done) setEditing(null);
          }}
        />
      </Sheet>

      <Sheet
        visible={Boolean(person)}
        title={person?.name ?? ''}
        subtitle={person?.email}
        onClose={() => setPerson(null)}>
        <Text variant="label" tone="muted">Role</Text>
        <View style={styles.chips}>
          {roles.data.map((role) => (
            <Chip
              key={role.key}
              label={role.name}
              selected={person?.role === role.key}
              onPress={() =>
                void run(async () => {
                  await api.savePlatformStaff(person!.id, { role: role.key });
                  setPerson(null);
                })
              }
            />
          ))}
        </View>
        <Button
          title={person?.isActive ? 'Switch this person off' : 'Switch this person back on'}
          variant={person?.isActive ? 'danger' : 'primary'}
          loading={busy}
          onPress={() =>
            void run(async () => {
              await api.savePlatformStaff(person!.id, { isActive: !person!.isActive });
              setPerson(null);
            })
          }
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  head: { marginTop: spacing.xl, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  tree: { marginTop: spacing.md, marginBottom: spacing.lg },
});
