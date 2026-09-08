import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import type { WorkspaceRole, WorkspaceUser } from '@decor/shared';
import {
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
} from '@decor/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import {
  Button,
  Card,
  Chip,
  Field,
  Icon,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Select,
  Sheet,
  Text,
  haptic,
} from '../../ui';
import { palette, spacing } from '../../theme';

/**
 * Who may do what here.
 *
 * The seeded roles are a starting point, not a fixed set: a shop with a
 * separate accountant, or one where the same person does sales and dispatch,
 * should be able to say so without asking us. The permissions are grouped the
 * way the product is, so the list reads as a description of the shop rather
 * than as a list of strings.
 */
export function AdminRolesScreen({ navigation }: { navigation: any }) {
  const { can } = useAuth();
  const roles = useApi<WorkspaceRole[]>(() => api.roles(), []);
  const users = useApi<WorkspaceUser[]>(() => api.users(), []);

  const [editing, setEditing] = useState<WorkspaceRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [granted, setGranted] = useState<string[]>([]);
  const [assigning, setAssigning] = useState<WorkspaceUser | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = can(PERMISSIONS.ROLE_MANAGE);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      haptic('notificationSuccess');
      roles.reload();
      users.reload();
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const openRole = (role: WorkspaceRole | null) => {
    setEditing(role);
    setCreating(role === null);
    setName(role?.name ?? '');
    setGranted(role?.permissions ?? []);
  };

  const closeRole = () => {
    setEditing(null);
    setCreating(false);
  };

  const toggle = (permission: string) =>
    setGranted((current) =>
      current.includes(permission)
        ? current.filter((one) => one !== permission)
        : [...current, permission],
    );

  const save = () =>
    run(async () => {
      const body = { name: name.trim(), permissions: granted };
      if (editing) await api.updateRole(editing.id, body);
      else await api.createRole(body);
      closeRole();
    });

  if (!roles.data) return <Loader label="Loading" />;

  return (
    <Screen refreshing={roles.refreshing} onRefresh={roles.refresh}>
      <ScreenHeader
        title="Roles and people"
        subtitle="Who may do what here"
        onBack={() => navigation.goBack()}
      />

      {canManage ? (
        <Button
          title="New role"
          icon={<Icon name="plus" size={17} color={palette.textOnAccent} />}
          onPress={() => openRole(null)}
          style={{ marginBottom: spacing.lg }}
        />
      ) : null}

      {roles.data.map((role, index) => (
        <Animated.View
          key={role.id}
          entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(300)}
          layout={Layout.springify()}>
          <Card
            tone="dark"
            style={styles.card}
            onPress={canManage ? () => openRole(role) : undefined}>
            <View style={styles.head}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="h3">{role.name}</Text>
                <Text variant="tiny" tone="muted">
                  {role.permissions.length} permissions ·{' '}
                  {role._count?.users ?? 0}{' '}
                  {(role._count?.users ?? 0) === 1 ? 'person' : 'people'}
                </Text>
              </View>
              {role.isSystem ? (
                <Pill label="Seeded" color={palette.textFaint} small />
              ) : null}
            </View>
          </Card>
        </Animated.View>
      ))}

      <Text variant="label" tone="muted" style={styles.sectionLabel}>People</Text>
      {(users.data ?? []).map((user) => (
        <Card
          key={user.id}
          tone="dark"
          style={styles.card}
          onPress={canManage ? () => setAssigning(user) : undefined}>
          <View style={styles.head}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="h3" numberOfLines={1}>{user.name}</Text>
              <Text variant="tiny" tone="muted">
                {user.code} · {user.roleRef?.name ?? 'No role'}
              </Text>
            </View>
            {user.isActive ? null : (
              <Pill label="Switched off" color={palette.textFaint} small />
            )}
          </View>
        </Card>
      ))}

      <Sheet
        visible={Boolean(editing) || creating}
        title={creating ? 'New role' : (editing?.name ?? '')}
        subtitle="Tick what this kind of person may do"
        onClose={closeRole}>
        <Field label="Called" value={name} onChangeText={setName} />
        {PERMISSION_GROUPS.map((group) => (
          <View key={group.label} style={styles.group}>
            <Text variant="label" tone="muted">{group.label}</Text>
            <View style={styles.chips}>
              {group.permissions.map((permission) => (
                <Chip
                  key={permission}
                  label={PERMISSION_LABELS[permission] ?? permission}
                  selected={granted.includes(permission)}
                  onPress={() => toggle(permission)}
                />
              ))}
            </View>
          </View>
        ))}
        <Button
          title="Save"
          loading={busy}
          disabled={name.trim().length < 2}
          onPress={save}
        />
        {editing && !editing.isSystem ? (
          <Button
            title="Remove this role"
            variant="danger"
            loading={busy}
            onPress={() =>
              run(async () => {
                await api.deleteRole(editing.id);
                closeRole();
              })
            }
          />
        ) : null}
      </Sheet>

      <Sheet
        visible={Boolean(assigning)}
        title={assigning?.name ?? ''}
        subtitle="What this person may do here"
        onClose={() => setAssigning(null)}>
        <Select
          label="Role"
          value={assigning?.roleId ?? ''}
          options={[
            { value: '', label: 'No role' },
            ...(roles.data ?? []).map((role) => ({ value: role.id, label: role.name })),
          ]}
          onChange={(value) =>
            run(async () => {
              await api.assignRole(assigning!.id, value || null);
              setAssigning(null);
            })
          }
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sectionLabel: { marginTop: spacing.xl, marginBottom: spacing.sm },
  group: { marginBottom: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
});
