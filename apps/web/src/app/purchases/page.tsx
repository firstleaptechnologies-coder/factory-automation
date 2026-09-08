'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Purchase, PurchaseStatus } from '@decor/shared';
import { PERMISSIONS, PURCHASE_STATUS_LABELS } from '@decor/shared';
import { api } from '@/lib/api';
import { usePaginated } from '@/lib/usePaginated';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { FilterSheet } from '@/components/FilterSheet';
import { Button, Card, EmptyState, Field, ListFooter, Loader, PageHead, Pill } from '@/ui';
import { formatDateShort, formatInr } from '@/lib/format';

/** The colour a purchase's standing reads as. */
const TONE: Record<PurchaseStatus, string> = {
  DRAFT: 'var(--text-muted)',
  ORDERED: 'var(--info)',
  PART_RECEIVED: 'var(--warning)',
  RECEIVED: 'var(--success)',
  CANCELLED: 'var(--text-faint)',
};

export default function PurchasesPage() {
  return (
    <Shell>
      <Purchases />
    </Shell>
  );
}

/** What the shop bought, from ordering it to paying for it. */
function Purchases() {
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PurchaseStatus | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const feed = usePaginated<Purchase>(
    (page) =>
      api.purchases({
        search: search || undefined,
        status: status ?? undefined,
        page,
        limit: 25,
      }),
    [search, status],
  );

  const canManage = can(PERMISSIONS.PURCHASE_MANAGE);

  return (
    <>
      <PageHead
        title="Purchases"
        subtitle="Ordered, arrived, billed, paid"
        action={
          canManage ? (
            <Button title="New order" icon="plus" onClick={() => router.push('/purchases/new')} />
          ) : null
        }
      />

      <div className="toolbar">
        <div style={{ flex: 1, minWidth: 240 }}>
          <Field
            placeholder="Order number, vendor or their bill"
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

      {feed.loading ? (
        <Loader />
      ) : feed.items.length === 0 ? (
        <EmptyState title="Nothing ordered yet" />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Number</th>
                <th>Their bill</th>
                <th>Expected</th>
                <th className="num">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {feed.items.map((purchase) => (
                <tr
                  key={purchase.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/purchases/${purchase.id}`)}>
                  <td className="bold">{purchase.vendor.name}</td>
                  <td className="muted">{purchase.code}</td>
                  <td className="muted">
                    {purchase.billNumber ?? '—'}
                    {purchase.paidOn ? <div className="t-tiny faint">paid</div> : null}
                  </td>
                  <td className="muted">
                    {purchase.expectedOn ? formatDateShort(purchase.expectedOn) : '—'}
                  </td>
                  <td className="num bold">{formatInr(purchase.total)}</td>
                  <td>
                    <Pill
                      label={PURCHASE_STATUS_LABELS[purchase.status]}
                      color={TONE[purchase.status]}
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
        title="Filter purchases"
        dimensions={[
          {
            key: 'status',
            label: 'Where it is',
            options: [
              { id: null, label: 'Everything' },
              ...(['DRAFT', 'ORDERED', 'PART_RECEIVED', 'RECEIVED', 'CANCELLED'] as const).map(
                (key) => ({ id: key, label: PURCHASE_STATUS_LABELS[key], color: TONE[key] }),
              ),
            ],
          },
        ]}
        value={{ status }}
        onApply={(next) => {
          setStatus((next.status as PurchaseStatus) ?? null);
          setFilterOpen(false);
        }}
      />

      <ListFooter
        loading={feed.loadingMore}
        hasMore={feed.hasMore}
        shown={feed.items.length}
        total={feed.meta?.total ?? feed.items.length}
        noun="purchases"
        onMore={feed.loadMore}
      />
    </>
  );
}
