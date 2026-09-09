'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MODULE_CATALOGUE, CORE_MODULES, PLAN_KEYS, effectOfIncluding } from '@fas/shared';
import type { ModuleKey } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Button, Card, Chip, Field, Loader, PageHead, Pill, SectionHead, Sheet } from '@/ui';
import { useAuth } from '@/lib/auth';
import { formatInr } from '@/lib/format';
import type { PlatformOverview } from '../overview-types';

/**
 * What each tier costs, and what each module costs beyond it.
 *
 * The two halves of one price list, on one screen, because the question
 * "should this be in the tier or an add-on?" is answered by looking at both at
 * once.
 */
export default function PlansAndPricesPage() {
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
   * The arithmetic on this page can only say what a change costs us. Only the
   * server knows which workspaces are on the tier and which of them were
   * granted the module directly — and taking a module off a shop that is
   * using it today is the one thing on this screen that cannot be undone by
   * ticking the box back on.
   */
  const [confirming, setConfirming] = useState<{
    tierKey: string;
    losing: { module: string; label: string; workspaces: { id: string; name: string }[] }[];
    gaining: string[];
  } | null>(null);

  const [making, setMaking] = useState(false);
  const [draft, setDraft] = useState({ key: '', label: '', price: '' });

  useEffect(() => {
    if (!overview.data) return;
    // Guarded list by list, not just on `data`: a payload arriving without one
    // of them should show an empty price list rather than throw.
    const tiers = overview.data.tiers ?? [];
    const prices = overview.data.modulePrices ?? [];
    setTierPrices(Object.fromEntries(tiers.map((t) => [t.key, String(t.monthlyPrice)])));
    setTierModules(Object.fromEntries(tiers.map((t) => [t.key, [...t.includedModules]])));
    setModulePrices(
      Object.fromEntries(prices.map((m) => [m.moduleKey, m.isPriced ? String(m.monthlyPrice) : ''])),
    );
  }, [overview.data]);

  const tierRow = (key: string) => (overview.data?.tiers ?? []).find((one) => one.key === key);

  /**
   * The modules a tier would hold, with the core put back whatever was ticked.
   *
   * Falls back to what the tier already holds rather than to nothing. The
   * ticked state is filled in by an effect after the first render, so an empty
   * map is "not loaded yet", not "somebody unticked everything" — and saving
   * on that reading would strip a tier to the core in one click.
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

  /**
   * Save, unless something would be taken away — then ask first.
   *
   * A price change reaches nobody's product and goes straight through. Taking
   * a module out of a tier reaches every workspace on it, so the server is
   * asked who would lose what and the answer is put in front of somebody
   * before it happens.
   */
  async function attemptSaveTier(key: string) {
    const saved = new Set(
      (overview.data?.tiers ?? []).find((one) => one.key === key)?.includedModules ?? [],
    );
    const removing = [...saved].filter((one) => !chosenFor(key).includes(one));

    if (removing.length === 0) return saveTier(key);

    setSaving(key);
    setFailed(null);
    try {
      const effect = await api.tierEffect(key, chosenFor(key));
      // Nobody is actually on it, or everybody who is holds the module
      // directly. Then there is nothing to warn about.
      if (effect.losing.every((one) => one.workspaces.length === 0)) return saveTier(key);
      setConfirming({ tierKey: key, losing: effect.losing, gaining: effect.gaining });
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Could not work out what that would do');
    } finally {
      setSaving(null);
    }
  }

  async function saveTier(key: string) {
    setSaving(key);
    setFailed(null);
    setConfirming(null);
    try {
      await api.setTierPrice(key, {
        monthlyPrice: priceFor(key),
        // The core is always in, whatever the chips say — a tier without
        // Orders and Clients is not a tier, it is a mistake.
        includedModules: chosenFor(key),
      });
      overview.reload();
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
      overview.reload();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'That did not save');
    } finally {
      setSaving(null);
    }
  }

  function toggleModule(tierKey: string, moduleKey: string) {
    setTierModules((current) => {
      const chosen = current[tierKey] ?? [];
      return {
        ...current,
        [tierKey]: chosen.includes(moduleKey)
          ? chosen.filter((key) => key !== moduleKey)
          : [...chosen, moduleKey],
      };
    });
  }

  /**
   * What moving a module into this tier costs, before it is saved.
   *
   * Every client already paying for that module as an add-on stops paying for
   * it the moment it is included — which is the number worth seeing while the
   * decision is still reversible, not on next month's total.
   */
  function effectOfTierEdit(tierKey: string): string | null {
    if (!overview.data) return null;
    const tier = (overview.data.tiers ?? []).find((one) => one.key === tierKey);
    if (!tier) return null;

    const added = (tierModules[tierKey] ?? []).filter(
      (key) => !tier.includedModules.includes(key),
    );
    if (!added.length) return null;

    const prices = Object.fromEntries(
      (overview.data.modulePrices ?? []).filter((m) => m.isPriced).map((m) => [m.moduleKey, m.monthlyPrice]),
    );

    // Only the clients on *this* tier, and only the add-ons they are actually
    // billed for. A client on another tier is untouched by this change, and a
    // client whose tier already covers the module pays nothing for it.
    const workspaces = (overview.data.workspaces ?? [])
      .filter((w) => w.tier === tierKey)
      .map((w) => ({
        billedAddOns: w.bill.lines
          .filter((line) => line.kind === 'module' && !line.unpriced)
          .map((line) => String(line.module)),
      }));

    let clients = 0;
    let change = 0;
    for (const moduleKey of added) {
      const effect = effectOfIncluding(moduleKey as ModuleKey, workspaces, prices);
      clients += effect.affected;
      change += effect.monthlyChange;
    }

    if (!clients) return 'Not saved yet.';
    return `Not saved yet — including this stops ${clients} client${clients === 1 ? '' : 's'} paying for it, ${formatInr(Math.abs(change))} a month.`;
  }

  const data = overview.data;
  if (overview.loading && !data) return <Loader label="Loading the price list" />;
  if (!data) return null;

  return (
    <div className="shell-page" style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--s-lg)' }}>
      <PageHead
        title="Plans and prices"
        subtitle="What a tier costs, and what a module costs beyond it"
      />

      {failed && <p className="t-small" style={{ color: 'var(--danger)' }}>{failed}</p>}

      <SectionHead
        title="Tiers"
        action={
          mayPrice ? (
            <Button title="New tier" size="sm" onClick={() => setMaking(true)} />
          ) : null
        }
      />
      <div className="stack-sm">
        {(data.tiers ?? []).map((tier) => (
          <Card key={tier.key} size="sm">
            <div className="row-between" style={{ alignItems: 'flex-start', gap: 'var(--s-lg)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="t-h3">{tier.label}</div>
                <div className="t-tiny muted">{tier.blurb}</div>
                <div className="t-label muted" style={{ marginTop: 'var(--s-md)' }}>
                  Included at this price
                </div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {MODULE_CATALOGUE.map((module) => {
                    const isCore = (CORE_MODULES as string[]).includes(module.key);
                    const chosen =
                      isCore || (tierModules[tier.key] ?? []).includes(module.key);
                    return (
                      <Chip
                        key={module.key}
                        label={isCore ? `${module.label} (core)` : module.label}
                        selected={chosen}
                        // The core cannot be taken out: a tier without Orders
                        // and Clients is not a cheaper tier, it is a broken one.
                        onClick={isCore ? undefined : () => toggleModule(tier.key, module.key)}
                      />
                    );
                  })}
                </div>
                {(() => {
                  const change = effectOfTierEdit(tier.key);
                  if (!change) return null;
                  return (
                    <div className="t-tiny" style={{ color: 'var(--warning)', marginTop: 6 }}>
                      {change}
                    </div>
                  );
                })()}
              </div>
              <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                <Field
                  label="₹ a month"
                  type="number"
                  value={tierPrices[tier.key] ?? String(tier.monthlyPrice)}
                  onChange={(value) => setTierPrices((c) => ({ ...c, [tier.key]: value }))}
                  style={{ width: 130 }}
                />
                <Button
                  title="Save"
                  size="sm"
                  variant="dark"
                  loading={saving === tier.key}
                  onClick={() => void attemptSaveTier(tier.key)}
                />
                {/*
                  Only a tier we wrote. The seeded three are what an
                  unrecognised plan key falls back to, so removing one turns a
                  bad key into no product rather than a default one — the API
                  refuses it either way.
                */}
                {mayPrice && !PLAN_KEYS.includes(tier.key) ? (
                  <Button
                    title="Remove"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void (async () => {
                        setSaving(tier.key);
                        setFailed(null);
                        try {
                          await api.deleteTier(tier.key);
                          overview.reload();
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
              </div>
            </div>
          </Card>
        ))}
      </div>

      <SectionHead title="Modules, beyond the tier" />
      <p className="t-tiny muted" style={{ margin: '0 0 var(--s-md)' }}>
        Charged only when a client has the module and their tier does not include it. Orders and
        Clients are never charged: a shop without them has bought nothing.
      </p>

      <div className="stack-sm">
        {(data.modulePrices ?? []).map((module) => {
          const isCore = (CORE_MODULES as string[]).includes(module.moduleKey);
          return (
            <Card key={module.moduleKey} size="sm">
              <div className="row-between" style={{ alignItems: 'flex-start', gap: 'var(--s-lg)' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="t-h3">{module.label}</span>
                    {isCore && <Pill label="core" color="var(--muted)" />}
                    {module.comingSoon && <Pill label="not built" color="var(--info)" />}
                    {!module.isPriced && !isCore && (
                      <Pill label="unpriced" color="var(--warning)" />
                    )}
                  </div>
                  <div className="t-tiny muted">{module.blurb}</div>
                </div>
                {isCore ? (
                  <span className="t-tiny faint" style={{ whiteSpace: 'nowrap' }}>
                    never charged
                  </span>
                ) : (
                  <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                    <Field
                      label="₹ a month"
                      type="number"
                      placeholder="unpriced"
                      value={modulePrices[module.moduleKey] ?? ''}
                      onChange={(value) =>
                        setModulePrices((c) => ({ ...c, [module.moduleKey]: value }))
                      }
                      style={{ width: 130 }}
                    />
                    <Button
                      title="Save"
                      size="sm"
                      variant="dark"
                      loading={saving === module.moduleKey}
                      onClick={() => saveModule(module.moduleKey)}
                    />
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card tone="well" style={{ marginTop: 'var(--s-lg)' }}>
        <div className="t-label muted">What this comes to</div>
        <div className="t-h2">{formatInr(data.totals.monthlyRecurring)} a month</div>
        <div className="t-tiny faint">
          across {data.totals.paying} paying {data.totals.paying === 1 ? 'client' : 'clients'} —
          changing a price above changes this on the next save.
        </div>
      </Card>

      {/*
        Asked before it lands, not discovered after.

        This is the one control on the platform where a careless tick takes a
        module away from a shop that is using it today. The list is by name,
        and it leaves out anybody granted the module directly — a warning that
        cries wolf is one nobody reads on the day it is right.
      */}
      <Sheet
        open={Boolean(confirming)}
        title="This takes something away"
        subtitle="Saving this tier removes a module from workspaces that are on it"
        onClose={() => setConfirming(null)}>
        {(confirming?.losing ?? []).map((loss) => (
          <Card key={loss.module} size="sm" style={{ marginBottom: 'var(--s-md)' }}>
            <div className="t-small bold">{loss.label}</div>
            <div className="t-tiny faint">
              {loss.workspaces.length === 0
                ? 'Nobody loses it — everybody on this tier was granted it directly.'
                : `${loss.workspaces.map((one) => one.name).join(', ')} ${
                    loss.workspaces.length === 1 ? 'loses' : 'lose'
                  } it as soon as this is saved.`}
            </div>
          </Card>
        ))}
        {confirming?.gaining.length ? (
          <p className="t-tiny faint">
            They gain {confirming.gaining.join(', ')} at the same time.
          </p>
        ) : null}
        <Button
          title="Save it anyway"
          variant="danger"
          block
          loading={saving === confirming?.tierKey}
          onClick={() => void saveTier(confirming!.tierKey)}
        />
        <Button title="Leave it alone" variant="ghost" block onClick={() => setConfirming(null)} />
      </Sheet>

      <Sheet
        open={making}
        title="New tier"
        subtitle="What it costs and what it includes are edited on the list afterwards"
        onClose={() => setMaking(false)}>
        <Field
          label="Called"
          placeholder="Studio"
          value={draft.label}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              label: value,
              // Offered rather than demanded, and it stays editable: the key
              // is what a workspace row points at and does not change after.
              key:
                current.key === '' || current.key === slugifyKey(current.label)
                  ? slugifyKey(value)
                  : current.key,
            }))
          }
          autoFocus
        />
        <Field
          label="Key"
          placeholder="studio"
          value={draft.key}
          onChange={(value) => setDraft((current) => ({ ...current, key: slugifyKey(value) }))}
          hint="Stable. Workspace rows point at it, so it does not change afterwards."
        />
        <Field
          label="₹ a month"
          type="number"
          value={draft.price}
          onChange={(value) => setDraft((current) => ({ ...current, price: value }))}
        />
        <Button
          title="Make it"
          block
          loading={saving === 'new'}
          disabled={draft.label.trim().length < 2 || draft.key.trim().length < 2}
          onClick={() =>
            void (async () => {
              setSaving('new');
              setFailed(null);
              try {
                await api.createTier({
                  key: draft.key,
                  label: draft.label.trim(),
                  monthlyPrice: Number(draft.price || 0),
                  // Starts at the core and nothing else. Ticking modules into
                  // it is the next thing somebody does, on the list, where
                  // they can see what it does to everybody already on it.
                  includedModules: [...(CORE_MODULES as string[])],
                });
                setMaking(false);
                setDraft({ key: '', label: '', price: '' });
                overview.reload();
              } catch (error) {
                setFailed(error instanceof Error ? error.message : 'That tier was not made');
              } finally {
                setSaving(null);
              }
            })()
          }
        />
      </Sheet>
    </div>
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
