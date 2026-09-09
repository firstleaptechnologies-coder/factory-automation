'use client';

import { useRouter } from 'next/navigation';
import { MODULE_CATALOGUE } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { formatInr } from '@/lib/format';
import { Card, Loader, PageHead, Pill, SectionHead } from '@/ui';

interface BillingRow {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED';
  plan: string | null;
  tierLabel: string | null;
  monthlyTotal: number;
  unpriced: string[];
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  billingDay: number | null;
}

interface Billing {
  rows: BillingRow[];
  totals: { monthlyRecurring: number; paying: number; onTrial: number; suspended: number };
  needsAttention: {
    trialsExpired: BillingRow[];
    trialsEndingSoon: BillingRow[];
    trialsWithNoEnd: BillingRow[];
    unpriced: BillingRow[];
    payingNothing: BillingRow[];
  };
}

/**
 * The book of business.
 *
 * What everybody is on, what they pay, and — first, because it is the only
 * part anybody has to act on — what is about to stop being true. A trial that
 * ended in March and one ending on Friday are the same `TRIAL` row, and
 * neither is visible in a list sorted by name. That is how a client quietly
 * stops paying and nobody notices for a quarter.
 *
 * Nothing here is collected yet: there is no payment gateway, and this screen
 * does not pretend there is. It says what is owed and on which day, which is
 * the half that has to be right before any gateway is worth attaching.
 */
export default function BillingPage() {
  const router = useRouter();
  const billing = useApi<Billing>(() => api.platformBilling() as Promise<Billing>, []);

  if (!billing.data) return <Loader label="Loading" />;

  const { rows, totals, needsAttention } = billing.data;

  const label = (moduleKey: string) =>
    MODULE_CATALOGUE.find((one) => one.key === moduleKey)?.label ?? moduleKey;

  const attention: { key: string; tone: string; title: string; rows: BillingRow[]; why: string }[] =
    [
      {
        key: 'expired',
        tone: 'var(--danger)',
        title: 'Trials that have run out',
        rows: needsAttention.trialsExpired,
        why: 'Every day one of these stays open is the product given away by accident.',
      },
      {
        key: 'soon',
        tone: 'var(--warning)',
        title: 'Trials ending within a week',
        rows: needsAttention.trialsEndingSoon,
        why: 'Somebody has to speak to them before Friday.',
      },
      {
        key: 'noend',
        tone: 'var(--warning)',
        title: 'Trials with no end date',
        rows: needsAttention.trialsWithNoEnd,
        why: 'A trial without a date never ends, and nobody ever notices.',
      },
      {
        key: 'unpriced',
        tone: 'var(--info)',
        title: 'Add-ons nobody has priced',
        rows: needsAttention.unpriced,
        why: 'Granted and billed at nothing, which looks exactly like given away on purpose.',
      },
      {
        key: 'free',
        tone: 'var(--info)',
        title: 'Paying clients billed nothing',
        rows: needsAttention.payingNothing,
        why: 'Active, on a tier, and the tier costs zero.',
      },
    ];

  return (
    <div className="shell-page">
      <PageHead title="Billing" subtitle="What everybody is on, and what it is worth" />

      <div className="grid-3">
        <Card tone="accent">
          <span className="t-label on-accent" style={{ opacity: 0.75 }}>
            Monthly recurring
          </span>
          <div className="t-display on-accent">{formatInr(totals.monthlyRecurring)}</div>
          <div className="t-tiny on-accent" style={{ opacity: 0.75 }}>
            from {totals.paying} paying {totals.paying === 1 ? 'client' : 'clients'}
          </div>
        </Card>
        <Card>
          <span className="t-label faint">On trial</span>
          <div className="t-h1">{totals.onTrial}</div>
          <div className="t-tiny faint">not paying yet</div>
        </Card>
        <Card>
          <span className="t-label faint">Suspended</span>
          <div className="t-h1">{totals.suspended}</div>
          <div className="t-tiny faint">shut out, still on the books</div>
        </Card>
      </div>

      <SectionHead title="Needs doing" />
      <div className="stack">
        {attention.filter((one) => one.rows.length > 0).length === 0 ? (
          <Card>
            <span className="t-small faint">
              Nothing is expiring, unpriced or quietly free. This is what a clean book looks like.
            </span>
          </Card>
        ) : null}

        {attention
          .filter((one) => one.rows.length > 0)
          .map((group) => (
            <Card key={group.key}>
              <div className="row-between">
                <span className="t-small bold">{group.title}</span>
                <Pill label={String(group.rows.length)} color={group.tone} />
              </div>
              <div className="t-tiny faint">{group.why}</div>
              <div className="wrap" style={{ marginTop: 'var(--s-md)' }}>
                {group.rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className="chip"
                    onClick={() => router.push(`/platform/tenants/${row.id}`)}>
                    {row.name}
                    {group.key === 'expired' && row.trialDaysLeft !== null
                      ? ` · ${Math.abs(row.trialDaysLeft)} days ago`
                      : ''}
                    {group.key === 'soon' && row.trialDaysLeft !== null
                      ? ` · ${row.trialDaysLeft} days`
                      : ''}
                    {group.key === 'unpriced'
                      ? ` · ${row.unpriced.map(label).join(', ')}`
                      : ''}
                  </button>
                ))}
              </div>
            </Card>
          ))}
      </div>

      <SectionHead title="Every workspace" />
      <div className="stack">
        {rows.map((row) => (
          <Card key={row.id} onClick={() => router.push(`/platform/tenants/${row.id}`)}>
            <div className="row-between">
              <div style={{ minWidth: 0 }}>
                <div className="t-small bold">{row.name}</div>
                <div className="t-tiny faint">
                  {row.tierLabel ?? 'no tier'}
                  {row.billingDay ? ` · billed on the ${row.billingDay}th` : ' · no billing day'}
                  {row.status === 'TRIAL' && row.trialDaysLeft !== null
                    ? ` · trial ${row.trialDaysLeft < 0 ? 'ended' : `ends in ${row.trialDaysLeft} days`}`
                    : ''}
                </div>
              </div>
              <div className="row">
                <Pill
                  label={row.status.toLowerCase()}
                  color={
                    row.status === 'ACTIVE'
                      ? 'var(--success)'
                      : row.status === 'TRIAL'
                        ? 'var(--info)'
                        : 'var(--faint)'
                  }
                />
                <span className="t-small bold">{formatInr(row.monthlyTotal)}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <p className="t-tiny faint" style={{ marginTop: 'var(--s-xl)' }}>
        Nothing is collected here yet — there is no payment gateway attached. What this screen
        says is what is owed and on which day, which is the half that has to be right before a
        gateway is worth wiring in.
      </p>
    </div>
  );
}
