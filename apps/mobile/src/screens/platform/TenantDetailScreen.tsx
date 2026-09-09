import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CORE_MODULES, MODULE_CATALOGUE, billFor } from '@fas/shared';
import type { ModuleKey } from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import { Card, Chip, Loader, Pill, Screen, ScreenHeader, Text } from '../../ui';
import { palette, spacing } from '../../theme';
import { formatInr } from '../../lib/format';
import type { TenantDetail } from './tenant-detail-types';

/**
 * One workspace, all the way down.
 *
 * The same page the browser shows, from the same read. A list can only say
 * what is true of everybody; this is where a question about one shop gets
 * answered — what they are on, what they can reach, who is in it, and what it
 * is worth.
 *
 * Their people and their roles are read only here as they are there. Changing
 * somebody's role inside a shop is done by opening their workspace, under our
 * own name, in their own audit trail.
 */
export function TenantDetailScreen({ navigation, route }: { navigation: any; route: any }) {
  const id: string = route?.params?.id;
  const { can } = useAuth();

  const detail = useApi<TenantDetail>(() => api.tenantDetail(id) as Promise<TenantDetail>, [id]);
  const tiers = useApi<
    { key: string; label: string; monthlyPrice: number; includedModules: string[] }[]
  >(() => api.platformTiers() as never, []);
  const prices = useApi<{ moduleKey: string; monthlyPrice: number }[]>(
    () => api.platformModulePrices() as never,
    [],
  );

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const mayManage = can('platform.tenant.manage');

  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    setFailed(null);
    try {
      await api.updateTenant(id, body as never);
      detail.reload();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  if (!detail.data) return <Loader label="Loading" />;

  const workspace = detail.data;
  const tier = (tiers.data ?? []).find((one) => one.key === workspace.plan);
  const included = new Set(tier?.includedModules ?? []);
  const extras = workspace.modules ?? [];

  const bill = tier
    ? billFor(
        {
          key: tier.key,
          label: tier.label,
          blurb: '',
          monthlyPrice: tier.monthlyPrice,
          includedModules: tier.includedModules as ModuleKey[],
        },
        extras,
        Object.fromEntries((prices.data ?? []).map((one) => [one.moduleKey, one.monthlyPrice])),
      )
    : null;

  const toggleExtra = (module: string) =>
    save({
      modules: extras.includes(module)
        ? extras.filter((one) => one !== module)
        : [...extras, module],
    });

  return (
    <Screen refreshing={detail.refreshing} onRefresh={detail.refresh}>
      <ScreenHeader
        title={workspace.name}
        subtitle={`${workspace.slug} · ${
          workspace.isolation === 'DEDICATED' ? 'their own database' : 'shared database'
        }`}
        onBack={() => navigation.goBack()}
      />

      <Card tone="accent" style={styles.card}>
        <Text variant="label" tone="onAccent">Billed monthly</Text>
        <Text variant="display" tone="onAccent">{formatInr(bill?.monthlyTotal ?? 0)}</Text>
        <Text variant="tiny" tone="onAccent">
          {tier ? `${tier.label} · ${formatInr(tier.monthlyPrice)}` : 'No tier'}
        </Text>
      </Card>

      <Card tone="dark" style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text variant="tiny" tone="muted">In the workspace</Text>
            <Text variant="h2">{workspace.counts?.users ?? 0} people</Text>
            <Text variant="tiny" tone="muted">
              {workspace.counts?.orders ?? 0} orders · {workspace.counts?.clients ?? 0} clients
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="tiny" tone="muted">Last fortnight</Text>
            <Text variant="h2">{workspace.health?.writes ?? 0}</Text>
            <Text variant="tiny" tone="muted">
              changes · {workspace.health?.failures ?? 0} failures
            </Text>
          </View>
        </View>
      </Card>

      <Text variant="label" tone="muted" style={styles.head}>Tier</Text>
      <View style={styles.chips}>
        {(tiers.data ?? []).map((one) => (
          <Chip
            key={one.key}
            label={`${one.label} · ${formatInr(one.monthlyPrice)}`}
            selected={workspace.plan === one.key}
            onPress={mayManage ? () => void save({ plan: one.key }) : undefined}
          />
        ))}
      </View>

      <Text variant="label" tone="muted" style={styles.head}>Status</Text>
      <View style={styles.chips}>
        {(['ACTIVE', 'TRIAL', 'SUSPENDED'] as const).map((status) => (
          <Chip
            key={status}
            label={status.toLowerCase()}
            selected={workspace.status === status}
            onPress={mayManage ? () => void save({ status }) : undefined}
          />
        ))}
      </View>

      <Text variant="label" tone="muted" style={styles.head}>Modules</Text>
      {MODULE_CATALOGUE.map((module) => {
        const core = (CORE_MODULES as readonly string[]).includes(module.key);
        const inTier = included.has(module.key);
        const extra = extras.includes(module.key);
        const on = core || inTier || extra;

        return (
          <Card key={module.key} tone="dark" style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="small" bold>{module.label}</Text>
                <Text variant="tiny" tone="muted">
                  {core ? 'in every product' : inTier ? 'in the tier' : extra ? 'add-on' : 'not on'}
                </Text>
              </View>
              <Chip
                testID={`module-${module.key}`}
                label={on ? 'on' : 'off'}
                selected={on}
                // The core and the tier's own modules are not this workspace's
                // to change: one is in every product, the other is a decision
                // about everybody on that tier.
                onPress={mayManage && !core && !inTier ? () => void toggleExtra(module.key) : undefined}
              />
            </View>
          </Card>
        );
      })}

      <Text variant="label" tone="muted" style={styles.head}>Their people</Text>
      {(workspace.users ?? []).map((person) => (
        <Card key={person.id} tone="dark" style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="small" bold numberOfLines={1}>{person.name}</Text>
              <Text variant="tiny" tone="muted">
                {person.code} · {person.roleRef?.name ?? 'no role'}
              </Text>
            </View>
            {person.isActive ? null : (
              <Pill label="switched off" color={palette.textFaint} small />
            )}
          </View>
        </Card>
      ))}

      <Text variant="label" tone="muted" style={styles.head}>Their roles</Text>
      {(workspace.roles ?? []).map((role) => (
        <Card key={role.id} tone="dark" style={styles.card}>
          <Text variant="small" bold>{role.name}</Text>
          <Text variant="tiny" tone="muted">
            {role.permissions.length} permissions · {role._count?.users ?? 0}{' '}
            {(role._count?.users ?? 0) === 1 ? 'person' : 'people'}
          </Text>
        </Card>
      ))}

      {failed ? (
        <Text variant="small" tone="danger">{failed}</Text>
      ) : busy ? (
        <Text variant="tiny" tone="muted">Saving…</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  head: { marginTop: spacing.xl, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
