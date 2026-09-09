'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MODULE_CATALOGUE, CORE_MODULES } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Button, Card, Field, Loader, PageHead, Pill, SectionHead } from '@/ui';
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
  const router = useRouter();
  const overview = useApi<PlatformOverview>(
    () => api.platformOverview() as Promise<PlatformOverview>,
    [],
  );

  const [tierPrices, setTierPrices] = useState<Record<string, string>>({});
  const [modulePrices, setModulePrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!overview.data) return;
    setTierPrices(
      Object.fromEntries(overview.data.tiers.map((t) => [t.key, String(t.monthlyPrice)])),
    );
    setModulePrices(
      Object.fromEntries(
        overview.data.modulePrices.map((m) => [m.moduleKey, m.isPriced ? String(m.monthlyPrice) : '']),
      ),
    );
  }, [overview.data]);

  async function saveTier(key: string) {
    setSaving(key);
    setFailed(null);
    try {
      await api.setTierPrice(key, { monthlyPrice: Number(tierPrices[key] || 0) });
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

  const data = overview.data;
  if (overview.loading && !data) return <Loader label="Loading the price list" />;
  if (!data) return null;

  return (
    <div className="shell-page" style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--s-lg)' }}>
      <PageHead
        title="Plans and prices"
        subtitle="What a tier costs, and what a module costs beyond it"
        action={<Button title="Back" variant="ghost" onClick={() => router.push('/platform')} />}
      />

      {failed && <p className="t-small" style={{ color: 'var(--danger)' }}>{failed}</p>}

      <SectionHead title="Tiers" />
      <div className="stack-sm">
        {data.tiers.map((tier) => (
          <Card key={tier.key} size="sm">
            <div className="row-between" style={{ alignItems: 'flex-start', gap: 'var(--s-lg)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="t-h3">{tier.label}</div>
                <div className="t-tiny muted">{tier.blurb}</div>
                <div className="t-tiny faint" style={{ marginTop: 4 }}>
                  Includes:{' '}
                  {tier.includedModules
                    .map((key) => MODULE_CATALOGUE.find((m) => m.key === key)?.label ?? key)
                    .join(' · ') || 'nothing beyond the core'}
                </div>
              </div>
              <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
                <Field
                  label="₹ a month"
                  type="number"
                  value={tierPrices[tier.key] ?? ''}
                  onChange={(value) => setTierPrices((c) => ({ ...c, [tier.key]: value }))}
                  style={{ width: 130 }}
                />
                <Button
                  title="Save"
                  size="sm"
                  variant="dark"
                  loading={saving === tier.key}
                  onClick={() => saveTier(tier.key)}
                />
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
        {data.modulePrices.map((module) => {
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
    </div>
  );
}
