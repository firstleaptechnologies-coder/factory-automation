import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { Tenant, TenantIsolation } from '@fas/shared';
import { PERMISSIONS } from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Icon,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
  haptic,
} from '../../ui';
import { palette, spacing } from '../../theme';
import { formatDateShort } from '../../lib/format';

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: palette.success,
  TRIAL: palette.info,
  SUSPENDED: palette.danger,
};

/**
 * The control plane: every business using the product.
 *
 * This is above any one shop's admin — a tenant admin configures their own
 * workspace, only the platform creates them.
 */
export function TenantsScreen({ navigation: _navigation }: { navigation: any }) {
  const { signOut, can, openWorkspace } = useAuth();
  const tenants = useApi<Tenant[]>(() => api.tenants(), []);

  /* Which workspace is being opened to help, and why. */
  const [openFor, setOpenFor] = useState<Tenant | null>(null);
  const [reason, setReason] = useState('');
  const [opening, setOpening] = useState(false);

  const open = async () => {
    if (!openFor) return;
    setOpening(true);
    try {
      await openWorkspace(openFor.id, reason.trim());
      haptic('notificationSuccess');
      setOpenFor(null);
    } catch (e) {
      haptic('notificationError');
      Alert.alert(
        'Could not open it',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setOpening(false);
    }
  };

  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    slug: '',
    name: '',
    isolation: 'SHARED' as TenantIsolation,
    databaseUrl: '',
    ownerName: '',
    ownerCode: 'ADMIN',
    ownerPassword: '',
  });

  const create = async () => {
    setBusy(true);
    try {
      const created = await api.createTenant({
        slug: form.slug.trim().toLowerCase(),
        name: form.name.trim(),
        isolation: form.isolation,
        databaseUrl: form.isolation === 'DEDICATED' ? form.databaseUrl.trim() : undefined,
        ownerName: form.ownerName.trim(),
        ownerCode: form.ownerCode.trim(),
        ownerPassword: form.ownerPassword,
      });
      haptic('notificationSuccess');
      setSheet(false);
      setForm({
        slug: '', name: '', isolation: 'SHARED', databaseUrl: '',
        ownerName: '', ownerCode: 'ADMIN', ownerPassword: '',
      });
      tenants.reload();
      Alert.alert(
        'Workspace ready',
        `${created.name} can sign in at workspace "${created.signIn.workspace}" as ${created.signIn.code}.`,
      );
    } catch (e) {
      haptic('notificationError');
      Alert.alert('Could not create', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  if (!tenants.data) return <Loader label="Loading workspaces" />;

  return (
    <Screen refreshing={tenants.refreshing} onRefresh={tenants.refresh}>
      <ScreenHeader
        title="Workspaces"
        subtitle={`${tenants.data.length} on the platform`}
        right={
          <Button title="Sign out" variant="ghost" size="sm" onPress={() => void signOut()} />
        }
      />

      <Button
        title="New workspace"
        icon={<Icon name="plus" size={17} color={palette.white} />}
        onPress={() => setSheet(true)}
        style={{ marginBottom: spacing.lg }}
      />

      {tenants.data.length === 0 ? (
        <EmptyState icon="box" title="No workspaces yet" />
      ) : (
        tenants.data.map((tenant, index) => (
          <Animated.View
            key={tenant.id}
            entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(320)}>
            <Card tone="dark" style={styles.card}>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <Text variant="h3">{tenant.name}</Text>
                  <Text variant="tiny" tone="muted">
                    {tenant.slug} · since {formatDateShort(tenant.createdAt)}
                  </Text>
                </View>
                <Pill label={tenant.status} color={STATUS_COLOR[tenant.status]} small />
              </View>

              <View style={styles.metaRow}>
                <Pill
                  label={tenant.isolation === 'DEDICATED' ? 'own database' : 'shared'}
                  color={tenant.isolation === 'DEDICATED' ? palette.accent : palette.surfaceLit}
                  small
                />
                {tenant.plan ? (
                  <Text variant="tiny" tone="faint">{tenant.plan}</Text>
                ) : null}
              </View>

              {can(PERMISSIONS.PLATFORM_IMPERSONATE) ? (
                <View style={styles.metaRow}>
                  <Chip
                    label="Open to help"
                    onPress={() => {
                      setOpenFor(tenant);
                      setReason('');
                    }}
                  />
                </View>
              ) : null}

              {tenant.counts ? (
                <View style={styles.counts}>
                  {tenant.counts.unreachable ? (
                    <Text variant="tiny" tone="danger">database unreachable</Text>
                  ) : (
                    <>
                      <Count label="people" value={tenant.counts.users} />
                      <Count label="orders" value={tenant.counts.orders} />
                      <Count label="clients" value={tenant.counts.clients} />
                    </>
                  )}
                </View>
              ) : null}
            </Card>
          </Animated.View>
        ))
      )}

      <Sheet
        visible={Boolean(openFor)}
        title={`Open ${openFor?.name ?? ''}`}
        subtitle="You will be working as their administrator, under your own name"
        onClose={() => setOpenFor(null)}>
        <Text variant="small" tone="muted" style={{ marginBottom: spacing.md }}>
          This is written into their own history, and the session ends by itself after half an
          hour. Everything you do there is recorded under your name, not theirs.
        </Text>
        <Field
          label="Why are you going in?"
          placeholder="Their board is not loading and they are on the phone"
          value={reason}
          onChangeText={setReason}
        />
        <Button
          title="Open their workspace"
          loading={opening}
          // The shop reads this sentence months later; a word is not a reason.
          disabled={reason.trim().length < 8}
          onPress={open}
        />
      </Sheet>

      <Sheet
        visible={sheet}
        title="New workspace"
        subtitle="Seeded ready to use"
        onClose={() => setSheet(false)}
        fullHeight>
        <Field
          label="Workspace name"
          placeholder="woodcraft"
          value={form.slug}
          onChangeText={(v) => setForm({ ...form, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
          autoCapitalize="none"
          hint="What their staff type at sign-in."
        />
        <Field
          label="Business name"
          placeholder="Woodcraft Studio"
          value={form.name}
          onChangeText={(v) => setForm({ ...form, name: v })}
        />

        <Text variant="label" tone="muted" style={{ marginBottom: spacing.sm }}>
          Data isolation
        </Text>
        <View style={styles.chipWrap}>
          <Chip
            label="Shared database"
            selected={form.isolation === 'SHARED'}
            onPress={() => setForm({ ...form, isolation: 'SHARED' })}
          />
          <Chip
            label="Own database"
            selected={form.isolation === 'DEDICATED'}
            onPress={() => setForm({ ...form, isolation: 'DEDICATED' })}
          />
        </View>
        <Text variant="tiny" tone="faint" style={{ marginTop: spacing.sm, marginBottom: spacing.lg }}>
          {form.isolation === 'DEDICATED'
            ? 'The database must already exist with the schema applied.'
            : 'Pooled with other workspaces, separated by tenant.'}
        </Text>

        {form.isolation === 'DEDICATED' ? (
          <Field
            label="Connection string"
            placeholder="postgresql://…"
            value={form.databaseUrl}
            onChangeText={(v) => setForm({ ...form, databaseUrl: v })}
            autoCapitalize="none"
            hint="Stored encrypted."
          />
        ) : null}

        <Text variant="label" tone="muted" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
          First user
        </Text>
        <Field
          label="Name"
          placeholder="Ravi Kumar"
          value={form.ownerName}
          onChangeText={(v) => setForm({ ...form, ownerName: v })}
        />
        <Field
          label="Employee code"
          value={form.ownerCode}
          onChangeText={(v) => setForm({ ...form, ownerCode: v.toUpperCase() })}
          autoCapitalize="characters"
        />
        <Field
          label="Password"
          placeholder="••••••••"
          value={form.ownerPassword}
          onChangeText={(v) => setForm({ ...form, ownerPassword: v })}
          secureTextEntry
          hint="At least 6 characters. They should change it."
        />

        <Button
          title="Create workspace"
          loading={busy}
          disabled={
            !form.slug.trim() ||
            !form.name.trim() ||
            !form.ownerName.trim() ||
            form.ownerPassword.length < 6 ||
            (form.isolation === 'DEDICATED' && !form.databaseUrl.trim())
          }
          onPress={create}
        />
      </Sheet>
    </Screen>
  );
}

function Count({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant="h3">{value ?? '—'}</Text>
      <Text variant="micro" tone="faint">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  counts: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.25)',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
