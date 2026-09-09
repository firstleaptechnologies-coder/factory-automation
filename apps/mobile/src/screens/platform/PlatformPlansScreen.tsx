import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CORE_MODULES, MODULE_CATALOGUE, PLAN_KEYS, effectOfIncluding } from '@fas/shared';
import type { ModuleKey } from '@fas/shared';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../auth/AuthContext';
import { Button, Card, Chip, Field, Loader, Pill, Screen, ScreenHeader, Sheet, Text } from '../../ui';
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

  const { can } = useAuth();
  const mayPrice = can('platform.pricing.manage');

  /*
   * What a tier change would do, asked of the API before it is saved.
   *
   * The arithmetic on this screen can only say what a change costs us. Only
   * the server knows which workspaces are on the tier and which of them hold
   * the module directly — and taking a module off a shop that is using it
   * today is the one thing here that cannot be undone by ticking it back on.
   */
  const [confirming, setConfirming] = useState<{
    tierKey: string;
    losing: { module: string; label: string; workspaces: { id: string; name: string }[] }[];
    gaining: string[];
  } | null>(null);

  const [making, setMaking] = useState(false);
  const [draft, setDraft] = useState({ key: '', label: '', price: '' });

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

  const tierRow = (key: string) => data?.tiers.find((one) => one.key === key);

  /**
   * The modules a tier would hold, with the core put back whatever was ticked.
   *
   * Falls back to what the tier already holds rather than to nothing: the
   * ticked state is filled in by an effect after the first render, so an empty
   * map is "not read yet", not "somebody unticked everything".
   */
  function chosenFor(key: string) {
    const chosen = tierModules[key] ?? tierRow(key)?.includedModules ?? [];
    return [...new Set([...(CORE_MODULES as string[]), ...chosen])];
  }

  /** Likewise: an empty box is not a price of zero, it is a price not yet read. */
  function priceFor(key: string) {
    const typed = tierPrices[key];
    return typed === undefined || typed === '' ? (tierRow(key)?.monthlyPrice ?? 0) : Number(typed);
  }

  /** Save, unless something would be taken away — then ask first. */
  async function attemptSaveTier(key: string) {
    const saved = tierRow(key)?.includedModules ?? [];
    const removing = saved.filter((one) => !chosenFor(key).includes(one));
    if (removing.length === 0) return saveTier(key);

    setSaving(key);
    setFailed(null);
    try {
      const effect = await api.tierEffect(key, chosenFor(key));
      if (effect.losing.every((one) => one.workspaces.length === 0)) return saveTier(key);
      setConfirming({ tierKey: key, losing: effect.losing, gaining: effect.gaining });
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Could not work out what that would do');
    } finally {
      setSaving(null);
    }
  }

  async function saveTier(key: string) {
    setConfirming(null);
    setSaving(key);
    setFailed(null);
    try {
      await api.setTierPrice(key, {
        monthlyPrice: priceFor(key),
        // The core goes back in whatever the chips say: a tier without Orders
        // and Clients is not a cheaper tier, it is a broken one.
        includedModules: chosenFor(key),
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
      {mayPrice ? (
        <Button
          title="New tier"
          onPress={() => setMaking(true)}
          style={{ marginBottom: spacing.md }}
        />
      ) : null}
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
              value={tierPrices[tier.key] ?? String(tier.monthlyPrice)}
              onChangeText={(value) => setTierPrices((c) => ({ ...c, [tier.key]: value }))}
              containerStyle={{ marginTop: spacing.sm }}
            />
            <Button
              title="Save"
              variant="dark"
              size="sm"
              loading={saving === tier.key}
              onPress={() => void attemptSaveTier(tier.key)}
            />
            {/*
              Only a tier we wrote. The seeded three are what an unrecognised
              plan key falls back to, so removing one turns a bad key into no
              product rather than a default one — the API refuses it either way.
            */}
            {mayPrice && !PLAN_KEYS.includes(tier.key) ? (
              <Button
                title="Remove this tier"
                variant="danger"
                size="sm"
                loading={saving === `del:${tier.key}`}
                onPress={() =>
                  void (async () => {
                    setSaving(`del:${tier.key}`);
                    setFailed(null);
                    try {
                      await api.deleteTier(tier.key);
                      overview.refresh();
                    } catch (error) {
                      setFailed(
                        error instanceof Error ? error.message : 'That tier is still in use',
                      );
                    } finally {
                      setSaving(null);
                    }
                  })()
                }
              />
            ) : null}
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
      {/*
        Asked before it lands, not discovered after. This is the one control
        here where a careless tap takes a module away from a shop that is using
        it today.
      */}
      <Sheet
        visible={Boolean(confirming)}
        title="This takes something away"
        subtitle="Saving this tier removes a module from workspaces that are on it"
        onClose={() => setConfirming(null)}>
        {(confirming?.losing ?? []).map((loss) => (
          <Card key={loss.module} tone="dark" style={styles.row}>
            <Text variant="small" bold>{loss.label}</Text>
            <Text variant="tiny" tone="muted">
              {loss.workspaces.length === 0
                ? 'Nobody loses it — everybody on this tier was granted it directly.'
                : `${loss.workspaces.map((one) => one.name).join(', ')} ${
                    loss.workspaces.length === 1 ? 'loses' : 'lose'
                  } it as soon as this is saved.`}
            </Text>
          </Card>
        ))}
        {confirming?.gaining.length ? (
          <Text variant="tiny" tone="muted">
            They gain {confirming.gaining.join(', ')} at the same time.
          </Text>
        ) : null}
        <Button
          title="Save it anyway"
          variant="danger"
          loading={saving === confirming?.tierKey}
          onPress={() => void saveTier(confirming!.tierKey)}
        />
        <Button title="Leave it alone" variant="dark" onPress={() => setConfirming(null)} />
      </Sheet>

      <Sheet
        visible={making}
        title="New tier"
        subtitle="What it costs and what it includes are edited on the list afterwards"
        onClose={() => setMaking(false)}>
        <Field
          label="Called"
          placeholder="Studio"
          value={draft.label}
          onChangeText={(value) =>
            setDraft((current) => ({
              ...current,
              label: value,
              // Offered rather than demanded, and it stays editable: the key is
              // what a workspace row points at and does not change after.
              key:
                current.key === '' || current.key === slugifyKey(current.label)
                  ? slugifyKey(value)
                  : current.key,
            }))
          }
        />
        <Field
          label="Key"
          placeholder="studio"
          value={draft.key}
          onChangeText={(value) => setDraft((current) => ({ ...current, key: slugifyKey(value) }))}
        />
        <Field
          label="₹ a month"
          keyboardType="numeric"
          value={draft.price}
          onChangeText={(value) => setDraft((current) => ({ ...current, price: value }))}
        />
        <Button
          title="Make it"
          loading={saving === 'new'}
          disabled={draft.label.trim().length < 2 || draft.key.trim().length < 2}
          onPress={() =>
            void (async () => {
              setSaving('new');
              setFailed(null);
              try {
                await api.createTier({
                  key: draft.key,
                  label: draft.label.trim(),
                  monthlyPrice: Number(draft.price || 0),
                  // Starts at the core and nothing else. Ticking modules into
                  // it is the next thing somebody does, on the list, where the
                  // effect on everybody already on it is visible.
                  includedModules: [...(CORE_MODULES as string[])],
                });
                setMaking(false);
                setDraft({ key: '', label: '', price: '' });
                overview.refresh();
              } catch (error) {
                setFailed(error instanceof Error ? error.message : 'That tier was not made');
              } finally {
                setSaving(null);
              }
            })()
          }
        />
      </Sheet>
    </Screen>
  );
}

/** A tier key: lowercase, hyphenated, and nothing a URL would argue with. */
function slugifyKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const styles = StyleSheet.create({
  row: { marginTop: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  pills: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
});
