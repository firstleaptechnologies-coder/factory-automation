'use client';

import { useRouter } from 'next/navigation';
import { MODULE_CATALOGUE } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Button, Card, EmptyState, Loader, PageHead, Pill, SectionHead } from '@/ui';
import { formatInr } from '@/lib/format';
import type { PlatformOverview } from './overview-types';
import { statusColour, unpricedWarning } from './overview-types';

/**
 * FirstLeap's own dashboard: every client, what they are on, and what they pay.
 *
 * Not behind Shell — the platform screens belong to us rather than to any
 * workspace, and wrapping them in a tenant's chrome is how somebody ends up
 * looking at one shop's menu while reading another's figures.
 */
export default function PlatformOverviewPage() {
  const router = useRouter();
  const { signOut } = useAuth();
  const overview = useApi<PlatformOverview>(
    () => api.platformOverview() as Promise<PlatformOverview>,
    [],
  );

  const data = overview.data;
  if (overview.loading && !data) return <Loader label="Loading the platform" />;
  if (!data) return <EmptyState title="Nothing to show" message={overview.error ?? undefined} />;

  const { totals, workspaces, tiers, modulePrices } = data;
  const warning = unpricedWarning(totals);

  return (
    <div className="shell-page" style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--s-lg)' }}>
      <PageHead
        title="FirstLeap"
        subtitle="Every client, what they are on, and what they pay"
        action={
          <div className="row">
            <Button title="Workspaces" variant="dark" onClick={() => router.push('/platform/tenants')} />
            <Button title="Plans and prices" variant="dark" onClick={() => router.push('/platform/plans')} />
            <Button title="Sign out" variant="ghost" onClick={signOut} />
          </div>
        }
      />

      <div className="grid-3">
        <Card tone="accent">
          <span className="t-label on-accent" style={{ opacity: 0.75 }}>Monthly recurring</span>
          <div className="t-display on-accent">{formatInr(totals.monthlyRecurring)}</div>
          <div className="t-tiny on-accent" style={{ opacity: 0.75 }}>
            from {totals.paying} paying {totals.paying === 1 ? 'client' : 'clients'}
          </div>
        </Card>

        <Card>
          <span className="t-label muted">Workspaces</span>
          <div className="t-display">{totals.workspaces}</div>
          <div className="t-tiny faint">
            {Object.entries(totals.byStatus)
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

      <SectionHead title="Clients" />
      <div className="stack-sm">
        {workspaces.map((workspace) => (
          <Card key={workspace.id} size="sm">
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
    </div>
  );
}
