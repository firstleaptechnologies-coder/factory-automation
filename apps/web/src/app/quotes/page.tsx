'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Estimate, EstimateStatus } from '@fas/shared';
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
} from '@/ui';
import { formatDateShort, formatInr } from '@/lib/format';

const STATUS_COLOR: Record<EstimateStatus, string> = {
  DRAFT: 'var(--text-faint)',
  SENT: 'var(--info)',
  ACCEPTED: 'var(--success)',
  DECLINED: 'var(--danger)',
  EXPIRED: 'var(--warning)',
  CONVERTED: 'var(--accent)',
};

const STATUS_FILTERS: EstimateStatus[] = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CONVERTED',
];

export default function EstimatesPage() {
  return (
    <Shell>
      <Estimates />
    </Shell>
  );
}

function Estimates() {
  const router = useRouter();
  const { can } = useAuth();
  const [status, setStatus] = useState<EstimateStatus | undefined>();
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  const estimates = usePaginated<Estimate>(
    (page) => api.estimates({ status, search: search || undefined, page, limit: 25 }),
    [status, search],
  );

  return (
    <>
      <PageHead
        title="Quotes"
        subtitle={`${estimates.total} quoted`}
        action={
          can(PERMISSIONS.ESTIMATE_MANAGE) ? (
            <Button title="New quote" icon="plus" onClick={() => router.push('/quotes/new')} />
          ) : null
        }
      />

      <div className="toolbar">
        <div style={{ flex: 1, minWidth: 240 }}>
          <Field
            placeholder="Estimate number or client"
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

      {estimates.loading ? (
        <Loader />
      ) : estimates.items.length === 0 ? (
        <EmptyState
          icon="tag"
          title="No quotes yet"
          message="Quote a job before it becomes an order."
          action={
            can(PERMISSIONS.ESTIMATE_MANAGE) ? (
              <Button title="New quote" onClick={() => router.push('/quotes/new')} />
            ) : null
          }
        />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Number</th>
                <th>Date</th>
                <th className="num">Lines</th>
                <th className="num">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {estimates.items.map((estimate) => (
                <tr
                  key={estimate.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/quotes/${estimate.id}`)}>
                  <td className="bold">
                    {estimate.client?.name ?? estimate.clientName ?? 'Unnamed'}
                  </td>
                  <td className="muted">{estimate.code}</td>
                  <td className="muted">{formatDateShort(estimate.issuedOn)}</td>
                  <td className="num muted">{estimate.items.length}</td>
                  <td className="num bold accent">{formatInr(estimate.grandTotal)}</td>
                  <td>
                    <Pill label={estimate.status} color={STATUS_COLOR[estimate.status]} />
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
        title="Filter estimates"
        dimensions={[
          {
            key: 'status',
            label: 'Status',
            options: [
              { id: null, label: 'Any status' },
              ...STATUS_FILTERS.map((option) => ({
                id: option,
                label: option,
                color: STATUS_COLOR[option],
              })),
            ],
          },
        ]}
        value={{ status: status ?? null }}
        onApply={(next) => setStatus((next.status as EstimateStatus) ?? undefined)}
      />

      <ListFooter
        loading={estimates.loadingMore}
        hasMore={estimates.hasMore}
        shown={estimates.items.length}
        total={estimates.total}
        noun="estimates"
        onMore={estimates.loadMore}
      />
    </>
  );
}
