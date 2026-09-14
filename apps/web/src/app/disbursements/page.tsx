'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Disbursement, DisbursementStatus } from '@fas/shared';
import { PERMISSIONS } from '@fas/shared';
import { api } from '@/lib/api';
import { usePaginated } from '@/lib/usePaginated';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { FilterSheet } from '@/components/FilterSheet';
import {
  Button,
  Card,
  EmptyState,
  Field,
  ListFooter,
  Loader,
  PageHead,
  Pill,
  Sheet,
} from '@/ui';
import { formatDateShort, formatInr } from '@/lib/format';

export default function DisbursementsPage() {
  return (
    <Shell>
      <Ledger />
    </Shell>
  );
}

/**
 * Every payout across every order — the view an accountant reconciles against
 * the bank. Orders keep their own totals; this is purely what went out.
 */
function Ledger() {
  const router = useRouter();
  const { can } = useAuth();
  const [status, setStatus] = useState<DisbursementStatus | undefined>();
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [summary, setSummary] = useState({
    label: 'ISC',
    totals: { total: 0, paid: 0, pending: 0, count: 0 },
  });

  const [renaming, setRenaming] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const ledger = usePaginated<Disbursement>(
    async (page) => {
      const result = await api.disbursementLedger({
        status,
        search: search || undefined,
        page,
        limit: 25,
      });
      // Totals ride along with every page, so the hero always describes the
      // whole filtered ledger even while only a page of rows is on screen.
      setSummary({ label: result.label, totals: result.totals });
      return result;
    },
    [status, search],
  );

  const canManage = can(PERMISSIONS.DISBURSEMENT_MANAGE);

  return (
    <>
      <PageHead
        title={`${summary.label} ledger`}
        subtitle="Money paid out to other people, after the client has paid"
        action={
          canManage ? (
            <div className="row">
              {/* What a payout is filed under. Nothing could reach these
                  before, so a shop that was never seeded any had a ledger of
                  Uncategorised rows it could do nothing about. */}
              <Button
                title="Headings"
                variant="dark"
                icon="tune"
                onClick={() => router.push('/admin/payout-headings')}
              />
              <Button
                title="Rename"
                variant="dark"
                size="sm"
                onClick={() => {
                  setLabel(summary.label);
                  setRenaming(true);
                }}
              />
            </div>
          ) : null
        }
      />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          Committed across {summary.totals.count} payout
          {summary.totals.count === 1 ? '' : 's'}
        </span>
        <div className="t-display on-accent">{formatInr(summary.totals.total)}</div>
        <div className="row-between" style={{ marginTop: 'var(--s-lg)' }}>
          <div>
            <div className="t-tiny on-accent" style={{ opacity: 0.75 }}>
              Paid out
            </div>
            <div className="t-h3 on-accent">{formatInr(summary.totals.paid)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="t-tiny on-accent" style={{ opacity: 0.75 }}>
              Still owed
            </div>
            <div className="t-h3 on-accent">{formatInr(summary.totals.pending)}</div>
          </div>
        </div>
      </Card>

      <div className="toolbar" style={{ marginTop: 'var(--s-lg)' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Field
            placeholder="Payee or order number"
            icon="search"
            value={search}
            onChange={setSearch}
            pasteable={false}
            style={{ marginBottom: 0 }}
          />
        </div>
        <Button
          title={status ? '1 filter' : 'Filter'}
          variant={status ? 'primary' : 'dark'}
          icon="filter"
          onClick={() => setFilterOpen(true)}
        />
      </div>

      <div style={{ height: 'var(--s-lg)' }} />

      {ledger.loading ? (
        <Loader />
      ) : ledger.items.length === 0 ? (
        <EmptyState title="Nothing here yet" />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Payee</th>
                <th>Order</th>
                <th>What for</th>
                <th>When</th>
                <th className="num">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ledger.items.map((row) => (
                <tr
                  key={row.id}
                  style={{ cursor: row.order ? 'pointer' : 'default' }}
                  onClick={() =>
                    row.order ? router.push(`/orders/${row.orderId}/disbursements`) : undefined
                  }>
                  <td className="bold">{row.payeeName}</td>
                  <td className="muted">
                    {row.order?.code ?? '—'}
                    {row.order?.client?.name ? (
                      <div className="t-tiny faint">{row.order.client.name}</div>
                    ) : null}
                  </td>
                  <td className="muted">{row.category?.name ?? 'Uncategorised'}</td>
                  <td className="muted">{row.paidAt ? formatDateShort(row.paidAt) : '—'}</td>
                  <td className="num bold">{formatInr(row.amount)}</td>
                  <td>
                    <Pill
                      label={row.status === 'PAID' ? 'Paid' : row.status === 'PLANNED' ? 'Owed' : 'Cancelled'}
                      color={
                        row.status === 'PAID'
                          ? 'var(--success)'
                          : row.status === 'PLANNED'
                            ? 'var(--warning)'
                            : 'var(--text-faint)'
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter payouts"
        dimensions={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { id: null, label: 'Owed and paid' },
              { id: 'PLANNED', label: 'Owed', color: 'var(--warning)' },
              { id: 'PAID', label: 'Paid', color: 'var(--success)' },
              { id: 'CANCELLED', label: 'Cancelled', color: 'var(--text-faint)' },
            ],
          },
        ]}
        value={{ status: status ?? null }}
        onApply={(next) => setStatus((next.status as DisbursementStatus) ?? undefined)}
      />

      <ListFooter
        loading={ledger.loadingMore}
        hasMore={ledger.hasMore}
        shown={ledger.items.length}
        total={ledger.meta?.total ?? ledger.items.length}
        noun="payouts"
        onMore={ledger.loadMore}
      />

      <Sheet
        open={renaming}
        title="Rename this ledger"
        subtitle="Every heading and button follows this word"
        onClose={() => setRenaming(false)}>
        <Field label="Called" value={label} onChange={setLabel} autoFocus />
        <Button
          title="Save"
          block
          loading={busy}
          disabled={!label.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              await api.setDisbursementLabel(label.trim());
              setRenaming(false);
              ledger.reload();
            } finally {
              setBusy(false);
            }
          }}
        />
      </Sheet>
    </>
  );
}
