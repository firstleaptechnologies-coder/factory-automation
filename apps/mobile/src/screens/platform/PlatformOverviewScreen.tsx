import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  CORE_MODULES,
  MODULE_CATALOGUE,
  PLATFORM_NAV,
  billFor,
  jobsNeedingAttention,
} from '@fas/shared';
import type { JobHealth, ModuleKey, ModulePrices, Tier } from '@fas/shared';
import { api } from '../../api/client';
import { goTo } from '../../navigation/routes';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Loader,
  Pill,
  Screen,
  ScreenHeader,
  Sheet,
  Text,
} from '../../ui';
import { Select } from '../../ui/Select';
import { palette, spacing } from '../../theme';
import { formatInr } from '../../lib/format';
import type { PlatformOverview } from './overview-types';
import { JOB_STATE_LABELS, jobStateColour, jobWarning } from './job-health';
import { statusColour, unpricedWarning } from './overview-types';

/**
 * FirstLeap's own dashboard, on a phone.
 *
 * The same figures the web screen shows, and the same editor behind a tap on a
 * client — because the person who needs to move somebody onto a bigger tier is
 * as likely to be standing in a client's workshop as sitting at a desk.
 */
export function PlatformOverviewScreen({ navigation }: { navigation: any }) {
  const { signOut, can } = useAuth();
  const overview = useApi<PlatformOverview>(
    () => api.platformOverview() as Promise<PlatformOverview>,
    [],
  );

  // Its own request: a different question on a different rhythm, and a slow
  // read of the job log should not hold up the money figures.
  const jobs = useApi<JobHealth[]>(() => api.platformJobHealth() as Promise<JobHealth[]>, []);

  const [editing, setEditing] = useState<string | null>(null);
  const [tier, setTier] = useState('');
  const [extras, setExtras] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const data = overview.data;
  // Every list is guarded, not just `data`. A payload that arrives without one
  // of them — an error shape, an older API — should render an empty dashboard
  // rather than throw on the first `.find`.
  const workspaces = data?.workspaces ?? [];
  const tiers = data?.tiers ?? [];
  const modulePrices = data?.modulePrices ?? [];
  const editingWorkspace = workspaces.find((one) => one.id === editing) ?? null;

  useEffect(() => {
    if (!editingWorkspace) return;
    setTier(editingWorkspace.tier ?? '');
    setExtras([...editingWorkspace.extras]);
    setFailed(null);
  }, [editingWorkspace]);

  /** The same `billFor` the API bills with, so the preview cannot drift. */
  function preview() {
    if (!data || !editingWorkspace) return null;
    const chosen = tiers.find((one) => one.key === tier);
    const asTier: Tier | undefined = chosen
      ? {
          key: chosen.key,
          label: chosen.label,
          blurb: chosen.blurb ?? '',
          monthlyPrice: chosen.monthlyPrice,
          includedModules: chosen.includedModules as ModuleKey[],
        }
      : undefined;

    const prices: ModulePrices = {};
    for (const price of modulePrices) {
      if (price.isPriced) prices[price.moduleKey as ModuleKey] = price.monthlyPrice;
    }
    const labels: Partial<Record<ModuleKey, string>> = {};
    for (const module of MODULE_CATALOGUE) labels[module.key] = module.label;

    return billFor(asTier, extras, prices, labels);
  }

  async function save() {
    if (!editingWorkspace) return;
    setSaving(true);
    setFailed(null);
    try {
      await api.updateTenant(editingWorkspace.id, { plan: tier || undefined, modules: extras });
      setEditing(null);
      overview.refresh();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'That did not save');
    } finally {
      setSaving(false);
    }
  }

  if (overview.loading && !data) return <Loader label="Loading the platform" />;
  if (!data) return <EmptyState icon="box" title="Nothing to show" />;

  const warning = data.totals ? unpricedWarning(data.totals) : null;
  const next = preview();

  return (
    <Screen refreshing={overview.refreshing} onRefresh={overview.refresh}>
      <ScreenHeader title="FirstLeap" subtitle="Every client, and what they pay" />

      <Card tone="accent">
        <Text variant="label" tone="onAccent" style={{ opacity: 0.75 }}>
          Monthly recurring
        </Text>
        <Text variant="display" tone="onAccent">{formatInr(data.totals?.monthlyRecurring ?? 0)}</Text>
        <Text variant="tiny" tone="onAccent" style={{ opacity: 0.75 }}>
          from {data.totals?.paying ?? 0} paying{' '}
          {(data.totals?.paying ?? 0) === 1 ? 'client' : 'clients'} · {workspaces.length} workspaces
          {/* Said, rather than silently missing, so nobody wonders why the
              figure is smaller than the list below it looks. */}
          {data.totals?.internal ? ` · ${data.totals.internal} of ours` : ''}
        </Text>
      </Card>

      {/* Said loudly, because it is money nobody is collecting. */}
      {!!warning && (
        <Card tone="dark" style={styles.warning}>
          <Text variant="h3" style={{ color: palette.warning }}>{warning.title}</Text>
          <Text variant="tiny" tone="muted">{warning.body}</Text>
        </Card>
      )}

      {/*
        The console's menu, read from the same tree the browser's sidebar
        reads.
        
        Hard-coded buttons is how the two clients drifted before: this screen
        offered two of the six places the console has, and nothing failed. A
        screen added to PLATFORM_NAV now appears here without anybody
        remembering to add it.
        
        The overview is left out — it is this screen — and so is anything
        reached from another screen rather than from a menu.
      */}
      {PLATFORM_NAV.map((group) => {
        const items = group.items.filter(
          (item) =>
            item.app &&
            item.key !== 'platform-overview' &&
            (!item.permission || can(item.permission)),
        );
        if (!items.length) return null;

        return (
          <View key={group.key}>
            <Text variant="label" tone="muted" style={styles.menuHead}>{group.label}</Text>
            {items.map((item) => (
              <Button
                key={item.key}
                title={item.label}
                variant="dark"
                onPress={() => goTo(navigation, item.app as string)}
                style={{ marginBottom: spacing.sm }}
              />
            ))}
          </View>
        );
      })}

      <Button title="Sign out" variant="ghost" onPress={signOut} />

      {(() => {
        const health = jobs.data ?? [];
        if (!health.length) return null;
        const warning = jobWarning(jobsNeedingAttention(health));
        return (
          <>
            <Text variant="label" tone="muted" style={{ marginTop: spacing.lg }}>
              Work on a clock
            </Text>
            {!!warning && (
              <Text variant="tiny" style={{ color: palette.warning }}>{warning}</Text>
            )}
            {health.map((one) => (
              <Card key={one.job.name} tone="dark" style={styles.row}>
                <View style={styles.rowTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="h3" numberOfLines={1}>{one.job.label}</Text>
                    <Text variant="tiny" tone="muted">{one.summary}</Text>
                  </View>
                  <Pill
                    label={JOB_STATE_LABELS[one.state]}
                    color={jobStateColour(one.state)}
                    small
                  />
                </View>
              </Card>
            ))}
          </>
        );
      })()}

      {workspaces.map((workspace) => (
        <Card
          key={workspace.id}
          tone="dark"
          style={styles.row}
          onPress={() => setEditing(workspace.id)}>
          <View style={styles.rowTop}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="h3" numberOfLines={1}>{workspace.name}</Text>
              <Text variant="tiny" tone="muted" numberOfLines={1}>
                {workspace.slug} · {workspace.tierLabel ?? 'no tier'}
              </Text>
              <Text variant="tiny" tone="faint" numberOfLines={2}>
                {workspace.bill.modules
                  .map((key) => MODULE_CATALOGUE.find((m) => m.key === key)?.label ?? key)
                  .join(' · ')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="h3">{formatInr(workspace.bill.monthlyTotal)}</Text>
              <Pill label={workspace.status} color={statusColour(workspace.status)} small />
              {workspace.unknownPlan && <Pill label="unknown plan" color={palette.danger} small />}
            </View>
          </View>
        </Card>
      ))}

      <Sheet
        visible={Boolean(editing)}
        title={editingWorkspace?.name ?? ''}
        subtitle="What they are on, and what it comes to"
        onClose={() => setEditing(null)}
        fullHeight>
        {!!editingWorkspace && (
          <>
            <Select
              label="Tier"
              value={tier}
              onChange={(next_) => setTier(next_ as string)}
              options={tiers.map((one) => ({ value: one.key, label: one.label }))}
            />

            <Text variant="label" tone="muted" style={{ marginTop: spacing.lg }}>
              Modules
            </Text>
            <View style={styles.chips}>
              {MODULE_CATALOGUE.map((module) => {
                const inTier =
                  (CORE_MODULES as string[]).includes(module.key) ||
                  ((tiers.find((one) => one.key === tier)?.includedModules ?? []) as string[])
                    .includes(module.key);
                return (
                  <Chip
                    key={module.key}
                    label={inTier ? `${module.label} (in tier)` : module.label}
                    selected={inTier || extras.includes(module.key)}
                    // A module the tier covers is not an add-on; offering it as
                    // one reads as something they are charged for and are not.
                    onPress={
                      inTier
                        ? undefined
                        : () =>
                            setExtras((current) =>
                              current.includes(module.key)
                                ? current.filter((key) => key !== module.key)
                                : [...current, module.key],
                            )
                    }
                  />
                );
              })}
            </View>

            {!!next && (
              <Card tone="dark" style={{ marginTop: spacing.lg }}>
                <Text variant="label" tone="muted">What they would pay</Text>
                {next.lines.map((line, index) => (
                  <View key={`${line.label}-${index}`} style={styles.billLine}>
                    <Text variant="small">
                      {line.label}{line.unpriced ? ' — unpriced' : ''}
                    </Text>
                    <Text variant="small">{formatInr(line.amount)}</Text>
                  </View>
                ))}
                <View style={styles.billLine}>
                  <Text variant="h3">A month</Text>
                  <Text variant="h3">{formatInr(next.monthlyTotal)}</Text>
                </View>
                {next.monthlyTotal !== editingWorkspace.bill.monthlyTotal && (
                  <Text variant="tiny" style={{ color: palette.warning }}>
                    Not saved yet — {formatInr(editingWorkspace.bill.monthlyTotal)} today.
                  </Text>
                )}
              </Card>
            )}

            {!!failed && (
              <Text variant="tiny" style={{ color: palette.danger, marginTop: spacing.sm }}>
                {failed}
              </Text>
            )}

            <Button title="Save" onPress={save} loading={saving} style={{ marginTop: spacing.lg }} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  menuHead: { marginTop: spacing.lg, marginBottom: spacing.sm },
  warning: { marginTop: spacing.md, borderLeftWidth: 3, borderLeftColor: palette.warning },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs },
  billLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
});
