import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CORE_MODULES, MODULE_CATALOGUE, effectOfIncluding } from '@fas/shared';
import type { ModuleKey } from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { Button, Card, Chip, Field, Loader, Pill, Screen, ScreenHeader, Text } from '../../ui';
import { palette, spacing } from '../../theme';
import { formatInr } from '../../lib/format';
import type { PlatformOverview } from './overview-types';

/**
 * What each tier costs, and what each module costs beyond it.
 *
 * Both halves on one screen, because "should this be in the tier or an add-on?"
 * is a question you answer by looking at the two together.
 */
export function PlatformPlansScreen({ navigation }: { navigation: any }) {
  const overview = useApi<PlatformOverview>(
    () => api.platformOverview() as Promise<PlatformOverview>,
    [],
  );

  const [tierPrices, setTierPrices] = useState<Record<string, string>>({});
  const [tierModules, setTierModules] = useState<Record<string, string[]>>({});
  const [modulePrices, setModulePrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const data = overview.data;

  useEffect(() => {
    if (!data) return;
    setTierPrices(Object.fromEntries(data.tiers.map((t) => [t.key, String(t.monthlyPrice)])));
    setTierModules(Object.fromEntries(data.tiers.map((t) => [t.key, [...t.includedModules]])));
    setModulePrices(
      Object.fromEntries(
        data.modulePrices.map((m) => [m.moduleKey, m.isPriced ? String(m.monthlyPrice) : '']),
      ),
    );
  }, [data]);

  async function saveTier(key: string) {
    setSaving(key);
    setFailed(null);
    try {
      await api.setTierPrice(key, {
        monthlyPrice: Number(tierPrices[key] || 0),
        // The core goes back in whatever the chips say: a tier without Orders
        // and Clients is not a cheaper tier, it is a broken one.
        includedModules: [...new Set([...(CORE_MODULES as string[]), ...(tierModules[key] ?? [])])],
      });
      overview.refresh();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'That did not save');
    } finally {
      setSaving(null);
    }
  }

  async function saveModule(moduleKey: string) {
    setSaving(moduleKey);
    setFailed(null);
    try {
      await api.setModulePrice(moduleKey, Number(modulePrices[moduleKey] || 0));
      overview.refresh();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'That did not save');
    } finally {
      setSaving(null);
    }
  }

  /**
   * What including a module would cost, before it is saved.
   *
   * Only the clients on this tier, and only the add-ons they are actually
   * billed for — a client whose tier already covers it pays nothing for it,
   * and a client on another tier is untouched by this change.
   */
  function effectOfEdit(tierKey: string): string | null {
    if (!data) return null;
    const tier = data.tiers.find((one) => one.key === tierKey);
    if (!tier) return null;

    const added = (tierModules[tierKey] ?? []).filter((key) => !tier.includedModules.includes(key));
    if (!added.length) return null;

    const prices = Object.fromEntries(
      data.modulePrices.filter((m) => m.isPriced).map((m) => [m.moduleKey, m.monthlyPrice]),
    );
    const onThisTier = data.workspaces
      .filter((w) => w.tier === tierKey)
      .map((w) => ({
        billedAddOns: w.bill.lines
          .filter((line) => line.kind === 'module' && !line.unpriced)
          .map((line) => String(line.module)),
      }));

    let clients = 0;
    let change = 0;
    for (const moduleKey of added) {
      const effect = effectOfIncluding(moduleKey as ModuleKey, onThisTier, prices);
      clients += effect.affected;
      change += effect.monthlyChange;
    }

    if (!clients) return 'Not saved yet.';
    return `Not saved yet — including this stops ${clients} client${clients === 1 ? '' : 's'} paying for it, ${formatInr(Math.abs(change))} a month.`;
  }

  if (overview.loading && !data) return <Loader label="Loading the price list" />;
  if (!data) return null;

  return (
    <Screen refreshing={overview.refreshing} onRefresh={overview.refresh}>
      <ScreenHeader
        title="Plans and prices"
        subtitle="What a tier costs, and what a module costs beyond it"
        onBack={() => navigation.goBack()}
      />

      {!!failed && <Text variant="tiny" style={{ color: palette.danger }}>{failed}</Text>}

      <Text variant="label" tone="muted" style={{ marginTop: spacing.md }}>Tiers</Text>
      {data.tiers.map((tier) => {
        const change = effectOfEdit(tier.key);
        return (
          <Card key={tier.key} tone="dark" style={styles.row}>
            <Text variant="h3">{tier.label}</Text>
            <Text variant="tiny" tone="muted">{tier.blurb}</Text>

            <View style={styles.chips}>
              {MODULE_CATALOGUE.map((module) => {
                const isCore = (CORE_MODULES as string[]).includes(module.key);
                return (
                  <Chip
                    key={module.key}
                    label={isCore ? `${module.label} (core)` : module.label}
                    selected={isCore || (tierModules[tier.key] ?? []).includes(module.key)}
                    onPress={
                      isCore
                        ? undefined
                        : () =>
                            setTierModules((current) => {
                              const chosen = current[tier.key] ?? [];
                              return {
                                ...current,
                                [tier.key]: chosen.includes(module.key)
                                  ? chosen.filter((key) => key !== module.key)
                                  : [...chosen, module.key],
                              };
                            })
                    }
                  />
                );
              })}
            </View>

            {!!change && (
              <Text variant="tiny" style={{ color: palette.warning, marginTop: 6 }}>{change}</Text>
            )}

            <Field
              label="₹ a month"
              keyboardType="numeric"
              value={tierPrices[tier.key] ?? ''}
              onChangeText={(value) => setTierPrices((c) => ({ ...c, [tier.key]: value }))}
              containerStyle={{ marginTop: spacing.sm }}
            />
            <Button
              title="Save"
              variant="dark"
              size="sm"
              loading={saving === tier.key}
              onPress={() => saveTier(tier.key)}
            />
          </Card>
        );
      })}

      <Text variant="label" tone="muted" style={{ marginTop: spacing.lg }}>
        Modules, beyond the tier
      </Text>
      <Text variant="tiny" tone="faint">
        Orders and Clients are never charged: a shop without them has bought nothing.
      </Text>

      {data.modulePrices.map((module) => {
        const isCore = (CORE_MODULES as string[]).includes(module.moduleKey);
        return (
          <Card key={module.moduleKey} tone="dark" style={styles.row}>
            <View style={styles.rowTop}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.pills}>
                  <Text variant="h3">{module.label}</Text>
                  {isCore && <Pill label="core" color={palette.textMuted} small />}
                  {module.comingSoon && <Pill label="not built" color={palette.info} small />}
                  {!module.isPriced && !isCore && (
                    <Pill label="unpriced" color={palette.warning} small />
                  )}
                </View>
                <Text variant="tiny" tone="muted">{module.blurb}</Text>
              </View>
            </View>

            {isCore ? (
              <Text variant="tiny" tone="faint">never charged</Text>
            ) : (
              <>
                <Field
                  label="₹ a month"
                  placeholder="unpriced"
                  keyboardType="numeric"
                  value={modulePrices[module.moduleKey] ?? ''}
                  onChangeText={(value) =>
                    setModulePrices((c) => ({ ...c, [module.moduleKey]: value }))
                  }
                  containerStyle={{ marginTop: spacing.sm }}
                />
                <Button
                  title="Save"
                  variant="dark"
                  size="sm"
                  loading={saving === module.moduleKey}
                  onPress={() => saveModule(module.moduleKey)}
                />
              </>
            )}
          </Card>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  pills: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
});
