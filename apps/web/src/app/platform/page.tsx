'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CORE_MODULES, MODULE_CATALOGUE, billFor, jobsNeedingAttention } from '@fas/shared';
import type { JobHealth } from '@fas/shared';
import type { ModuleKey, ModulePrices, Tier } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Button, Card, Chip, EmptyState, Loader, PageHead, Pill, SectionHead, Sheet } from '@/ui';
import { Select } from '@/ui/Select';
import { formatInr } from '@/lib/format';
import type { PlatformOverview } from './overview-types';
import { JOB_STATE_LABELS, jobStateColour, jobWarning } from './job-health';
import { statusColour, unpricedWarning } from './overview-types';

/**
 * FirstLeap's own dashboard: every client, what they are on, and what they pay.
 *
 * Behind PlatformShell rather than the shop's Shell — the platform screens
 * belong to us rather than to any
 * workspace, and wrapping them in a tenant's chrome is how somebody ends up
 * looking at one shop's menu while reading another's figures.
 */
export default function PlatformOverviewPage() {
  const overview = useApi<PlatformOverview>(
    () => api.platformOverview() as Promise<PlatformOverview>,
    [],
  );
  // Its own request: it answers a different question on a different rhythm,
  // and a slow read of the job log should not hold up the money figures.
  const jobs = useApi<JobHealth[]>(() => api.platformJobHealth() as Promise<JobHealth[]>, []);

  const [editing, setEditing] = useState<string | null>(null);
  const [tier, setTier] = useState<string>('');
  const [extras, setExtras] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const editingWorkspace =
    overview.data?.workspaces.find((one) => one.id === editing) ?? null;

  useEffect(() => {
    if (!editingWorkspace) return;
    setTier(editingWorkspace.tier ?? '');
    setExtras([...editingWorkspace.extras]);
    setFailed(null);
  }, [editingWorkspace]);

  /**
   * What this client would pay, as the chips are tapped.
   *
   * Computed with the same `billFor` the API bills with, so the figure on
   * screen is the figure that will be charged — a preview that used its own
   * arithmetic would eventually disagree with the invoice.
   */
  function preview() {
    if (!overview.data || !editingWorkspace) return null;
    const chosen = overview.data.tiers.find((one) => one.key === tier);
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
    for (const price of overview.data.modulePrices) {
      if (price.isPriced) prices[price.moduleKey as ModuleKey] = price.monthlyPrice;
    }
    const labels: Partial<Record<ModuleKey, string>> = {};
    for (const module of MODULE_CATALOGUE) labels[module.key] = module.label;

    return billFor(asTier, extras, prices, labels);
  }

  async function saveWorkspace() {
    if (!editingWorkspace) return;
    setSaving(true);
    setFailed(null);
    try {
      await api.updateTenant(editingWorkspace.id, { plan: tier || undefined, modules: extras });
      setEditing(null);
      overview.reload();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'That did not save');
    } finally {
      setSaving(false);
    }
  }

  const data = overview.data;
  if (overview.loading && !data) return <Loader label="Loading the platform" />;
  if (!data) return <EmptyState title="Nothing to show" message={overview.error ?? undefined} />;

  // Defaulted list by list: an unexpected payload renders an empty dashboard
  // rather than throwing on the first map.
  const workspaces = data.workspaces ?? [];
  const tiers = data.tiers ?? [];
  const modulePrices = data.modulePrices ?? [];
  const totals = data.totals;
  const warning = totals ? unpricedWarning(totals) : null;

  return (
    <div className="shell-page">
      <PageHead
        title="FirstLeap"
        subtitle="Every client, what they are on, and what they pay"
      />

      <div className="grid-3">
        <Card tone="accent">
          <span className="t-label on-accent" style={{ opacity: 0.75 }}>Monthly recurring</span>
          <div className="t-display on-accent">{formatInr(totals?.monthlyRecurring ?? 0)}</div>
          <div className="t-tiny on-accent" style={{ opacity: 0.75 }}>
            from {totals?.paying ?? 0} paying {(totals?.paying ?? 0) === 1 ? 'client' : 'clients'}
          </div>
        </Card>

        <Card>
          <span className="t-label muted">Workspaces</span>
          <div className="t-display">{workspaces.length}</div>
          <div className="t-tiny faint">
            {Object.entries(totals?.byStatus ?? {})
              .filter(([, count]) => count > 0)
              .map(([status, count]) => `${count} ${status.toLowerCase()}`)
              .join(' · ')}
          </div>
        </Card>

        <Card>
          <span className="t-label muted">Modules priced</span>
          <div className="t-display">
            {modulePrices.filter((m) => m.isPriced).length}
            <span className="t-small faint"> / {modulePrices.length}</span>
          </div>
          <div className="t-tiny faint">Tiers priced: {tiers.filter((t) => t.monthlyPrice > 0).length} / {tiers.length}</div>
        </Card>
      </div>

      {/* Said loudly, because it is money nobody is collecting. */}
      {warning && (
        <Card tone="well" className="enter" style={{ borderLeft: '3px solid var(--warning)' }}>
          <strong className="t-h3" style={{ color: 'var(--warning)' }}>{warning.title}</strong>
          <p className="t-small" style={{ margin: '4px 0 0' }}>{warning.body}</p>
        </Card>
      )}

      {(() => {
        const health = jobs.data ?? [];
        if (!health.length) return null;
        const needing = jobsNeedingAttention(health);
        const warning = jobWarning(needing);
        return (
          <>
            <SectionHead title="Work on a clock" />
            {warning && (
              <p className="t-small" style={{ color: 'var(--warning)', margin: '0 0 var(--s-sm)' }}>
                {warning}
              </p>
            )}
            <div className="stack-sm">
              {health.map((one) => (
                <Card key={one.job.name} size="sm">
                  <div className="row-between">
                    <div style={{ minWidth: 0 }}>
                      <div className="t-h3 truncate">{one.job.label}</div>
                      <div className="t-tiny muted">{one.summary}</div>
                      <div className="t-tiny faint">{one.job.blurb}</div>
                    </div>
                    <Pill
                      label={JOB_STATE_LABELS[one.state]}
                      color={jobStateColour(one.state)}
                    />
                  </div>
                </Card>
              ))}
            </div>
          </>
        );
      })()}

      <SectionHead title="Clients" />
      <div className="stack-sm">
        {workspaces.map((workspace) => (
          <Card key={workspace.id} size="sm" onClick={() => setEditing(workspace.id)}>
            <div className="row-between">
              <div style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="t-h3 truncate">{workspace.name}</span>
                  <Pill label={workspace.status} color={statusColour(workspace.status)} />
                  {workspace.unknownPlan && (
                    <Pill label="unknown plan" color="var(--danger)" />
                  )}
                </div>
                <div className="t-tiny muted">
                  {workspace.slug} · {workspace.tierLabel ?? 'no tier'}
                  {workspace.extras.length ? ` · ${workspace.extras.length} add-on${workspace.extras.length === 1 ? '' : 's'}` : ''}
                </div>
                <div className="t-tiny faint">
                  {workspace.bill.modules
                    .map((key) => MODULE_CATALOGUE.find((m) => m.key === key)?.label ?? key)
                    .join(' · ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="t-h3">{formatInr(workspace.bill.monthlyTotal)}</div>
                <div className="t-tiny faint">a month</div>
                {workspace.bill.unpriced.length > 0 && (
                  <div className="t-tiny" style={{ color: 'var(--warning)' }}>
                    {workspace.bill.unpriced.length} unpriced
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Sheet
        open={Boolean(editing)}
        title={editingWorkspace?.name ?? ''}
        subtitle="What they are on, and what it comes to"
        onClose={() => setEditing(null)}>
        {editingWorkspace && (
          <>
            <Select
              label="Tier"
              value={tier}
              onChange={setTier}
              options={(data?.tiers ?? []).map((one) => ({
                value: one.key,
                label: one.label,
              }))}
            />

            <div className="t-label muted" style={{ marginTop: 'var(--s-lg)' }}>
              Modules
            </div>
            <p className="t-tiny faint" style={{ margin: '2px 0 6px' }}>
              A module the tier already covers is shown as included and costs nothing extra.
            </p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {MODULE_CATALOGUE.map((module) => {
                const inTier =
                  (CORE_MODULES as string[]).includes(module.key) ||
                  ((data?.tiers.find((one) => one.key === tier)?.includedModules ?? []) as string[])
                    .includes(module.key);
                return (
                  <Chip
                    key={module.key}
                    label={inTier ? `${module.label} (in tier)` : module.label}
                    selected={inTier || extras.includes(module.key)}
                    // Granting a module the tier already covers changes nothing
                    // and would read as an add-on they are not being charged for.
                    onClick={
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
            </div>

            {(() => {
              const next = preview();
              if (!next) return null;
              const now = editingWorkspace.bill.monthlyTotal;
              const changed = next.monthlyTotal !== now;
              return (
                <Card tone="well" style={{ marginTop: 'var(--s-lg)' }}>
                  <div className="t-label muted">What they would pay</div>
                  {next.lines.map((line, index) => (
                    <div key={`${line.label}-${index}`} className="row-between t-small">
                      <span>{line.label}{line.unpriced ? ' — unpriced' : ''}</span>
                      <span>{formatInr(line.amount)}</span>
                    </div>
                  ))}
                  <div className="row-between t-h3" style={{ marginTop: 6 }}>
                    <span>A month</span>
                    <span>{formatInr(next.monthlyTotal)}</span>
                  </div>
                  {changed && (
                    <div className="t-tiny" style={{ color: 'var(--warning)', marginTop: 4 }}>
                      Not saved yet — {formatInr(now)} today.
                    </div>
                  )}
                  {next.unpriced.length > 0 && (
                    <div className="t-tiny" style={{ color: 'var(--warning)', marginTop: 4 }}>
                      {next.unpriced.length} of these has no price, so it is billed as nothing.
                    </div>
                  )}
                </Card>
              );
            })()}

            {failed && (
              <p className="t-small" style={{ color: 'var(--danger)' }}>{failed}</p>
            )}

            <Button
              title="Save"
              block
              loading={saving}
              onClick={saveWorkspace}
              style={{ marginTop: 'var(--s-lg)' }}
            />
          </>
        )}
      </Sheet>
    </div>
  );
}
