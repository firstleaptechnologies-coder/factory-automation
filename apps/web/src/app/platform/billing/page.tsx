'use client';

import { useRouter } from 'next/navigation';
import { MODULE_CATALOGUE } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { formatInr } from '@/lib/format';
import { Button, Card, Field, Loader, PageHead, Pill, SectionHead, Sheet } from '@/ui';
import { useAuth } from '@/lib/auth';
import { useState } from 'react';

interface BillingRow {
  id: string;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'TRIAL' | 'SUSPENDED';
  plan: string | null;
  /** Ours. Counted nowhere, shown anyway. */
  isInternal: boolean;
  tierLabel: string | null;
  monthlyTotal: number;
  unpriced: string[];
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  billingDay: number | null;
}

interface Invoice {
  id: string;
  tenantId: string;
  period: string;
  amount: number;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'FAILED' | 'VOID';
  lines: { kind: string; label: string; amount: number }[];
  paymentUrl: string | null;
  failureReason: string | null;
  paidAt: string | null;
  workspace: { id: string; name: string } | null;
}

interface Gateway {
  provider: string;
  connected: boolean;
  webhooksVerifiable: boolean;
}

interface Billing {
  rows: BillingRow[];
  totals: {
    monthlyRecurring: number;
    paying: number;
    onTrial: number;
    suspended: number;
    internal: number;
  };
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
  const { can } = useAuth();
  const billing = useApi<Billing>(() => api.platformBilling() as Promise<Billing>, []);
  const gateway = useApi<Gateway>(() => api.billingGateway(), []);
  const invoices = useApi<Invoice[]>(() => api.billingInvoices() as Promise<Invoice[]>, []);

  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [reason, setReason] = useState('');

  const mayBill = can('platform.pricing.manage');

  const run = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key);
    setFailed(null);
    try {
      await work();
      invoices.reload();
      return true;
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work');
      return false;
    } finally {
      setBusy(null);
    }
  };

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
            {/*
              Beside the figure it is excluded from, not under some other one:
              the reason to say it at all is to explain why this number is
              smaller than the list below it looks.
            */}
            {totals.internal
              ? ` · ${totals.internal} of ours, counted nowhere`
              : ''}
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
                  label={row.isInternal ? 'internal' : row.status.toLowerCase()}
                  color={
                    row.isInternal
                      ? 'var(--faint)'
                      : row.status === 'ACTIVE'
                        ? 'var(--success)'
                        : row.status === 'TRIAL'
                          ? 'var(--info)'
                          : 'var(--faint)'
                  }
                />
                {/*
                  Ours shows what it would be worth, struck through, rather
                  than a figure that reads as money coming in. Hiding it
                  entirely loses the answer to "what would we charge for this".
                */}
                <span
                  className={row.isInternal ? 't-small faint' : 't-small bold'}
                  style={row.isInternal ? { textDecoration: 'line-through' } : undefined}>
                  {formatInr(row.monthlyTotal)}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <SectionHead
        title="Invoices"
        action={
          mayBill ? (
            <Button
              title="Work out this month"
              variant="dark"
              loading={busy === 'run'}
              onClick={() => void run('run', () => api.runBilling())}
            />
          ) : null
        }
      />
      {failed ? <p className="t-small danger">{failed}</p> : null}
      <div className="stack">
        {(invoices.data ?? []).length === 0 ? (
          <Card>
            <span className="t-small faint">
              No bills have been written yet. They are drafted on each workspace&rsquo;s billing
              day, and sending one is a decision you take here.
            </span>
          </Card>
        ) : null}

        {(invoices.data ?? []).map((invoice) => (
          <Card key={invoice.id} testId={`invoice-${invoice.id}`}>
            <div className="row-between">
              <div style={{ minWidth: 0 }}>
                <div className="t-small bold">
                  {invoice.workspace?.name ?? 'Unknown workspace'} ·{' '}
                  {invoice.period.slice(0, 7)}
                </div>
                <div className="t-tiny faint">
                  {invoice.lines.map((line) => `${line.label} ${formatInr(line.amount)}`).join(' + ')}
                </div>
                {invoice.failureReason ? (
                  <div className="t-tiny danger">{invoice.failureReason}</div>
                ) : null}
              </div>
              <div className="row">
                <Pill
                  label={invoice.status.toLowerCase()}
                  color={
                    invoice.status === 'PAID'
                      ? 'var(--success)'
                      : invoice.status === 'FAILED'
                        ? 'var(--danger)'
                        : invoice.status === 'ISSUED'
                          ? 'var(--info)'
                          : 'var(--faint)'
                  }
                />
                <span className="t-small bold">{formatInr(invoice.amount)}</span>
              </div>
            </div>

            {mayBill && invoice.status !== 'PAID' && invoice.status !== 'VOID' ? (
              <div className="row" style={{ marginTop: 'var(--s-md)' }}>
                <Button
                  title={invoice.status === 'DRAFT' ? 'Send it' : 'Send it again'}
                  size="sm"
                  loading={busy === invoice.id}
                  // Without an account behind it, sending would mark a bill
                  // issued with nowhere to pay it.
                  disabled={!gateway.data?.connected}
                  onClick={() => void run(invoice.id, () => api.issueInvoice(invoice.id))}
                />
                <Button
                  title="Withdraw"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setVoiding(invoice);
                    setReason('');
                  }}
                />
                {invoice.paymentUrl ? (
                  <a className="chip" href={invoice.paymentUrl} target="_blank" rel="noreferrer">
                    Where they pay
                  </a>
                ) : null}
              </div>
            ) : null}
          </Card>
        ))}
      </div>

      {/*
        Said plainly rather than implied. A screen that shows invoices while no
        gateway is connected reads as if sending one would collect money.
      */}
      <p className="t-tiny faint" style={{ marginTop: 'var(--s-xl)' }}>
        {gateway.data?.connected
          ? gateway.data.webhooksVerifiable
            ? 'Razorpay is connected. A payment is recorded when Razorpay tells us it happened, never from a browser.'
            : 'Razorpay is connected, but no webhook secret is set — so payments will be collected and never recorded. Set RAZORPAY_WEBHOOK_SECRET.'
          : 'No payment gateway is connected. Bills can be worked out and read, but not sent. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'}
      </p>

      <Sheet
        open={Boolean(voiding)}
        title="Withdraw this bill"
        subtitle="It is marked withdrawn, never deleted — a bill that was sent and withdrawn happened"
        onClose={() => setVoiding(null)}>
        <Field
          label="Why"
          value={reason}
          onChange={setReason}
          hint="Kept on the invoice, for whoever reads it later."
        />
        <Button
          title="Withdraw it"
          variant="danger"
          block
          loading={busy === 'void'}
          disabled={reason.trim().length < 3}
          onClick={async () => {
            const done = await run('void', () => api.voidInvoice(voiding!.id, reason.trim()));
            if (done) setVoiding(null);
          }}
        />
      </Sheet>
    </div>
  );
}
