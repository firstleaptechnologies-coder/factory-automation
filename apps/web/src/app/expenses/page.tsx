'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Expense, ExpenseFormOptions } from '@fas/shared';
import { PERMISSIONS } from '@fas/shared';
import { api } from '@/lib/api';
import { usePaginated } from '@/lib/usePaginated';
import { useApi } from '@/lib/useApi';
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

export default function ExpensesPage() {
  return (
    <Shell>
      <Expenses />
    </Shell>
  );
}

/**
 * What the shop spends on itself.
 *
 * Separate from payouts, which belong to an order. Every filter here is a list
 * the shop keeps itself, so the options come from the server — a category
 * added this morning can be filtered by this afternoon.
 */
function Expenses() {
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [spentType, setSpentType] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<string | null>(null);
  const [doneBy, setDoneBy] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [total, setTotal] = useState(0);

  const options = useApi<ExpenseFormOptions>(() => api.expenseOptions(), []);

  const feed = usePaginated<Expense>(
    async (page) => {
      const result = await api.expenses({
        search: search || undefined,
        spentType: spentType ?? undefined,
        paymentType: paymentType ?? undefined,
        doneBy: doneBy ?? undefined,
        page,
        limit: 25,
      });
      // The total rides along with every page, so the hero describes the whole
      // filtered set even while only a page of rows is on screen.
      setTotal(result.total);
      return result;
    },
    [search, spentType, paymentType, doneBy],
  );

  const canManage = can(PERMISSIONS.EXPENSE_MANAGE);
  const applied = [spentType, paymentType, doneBy].filter(Boolean).length;
  const labels = (values: string[] | undefined) => [
    { id: null, label: 'Any' },
    ...(values ?? []).map((value) => ({ id: value, label: value })),
  ];

  return (
    <>
      <PageHead
        title="Expenses"
        subtitle="What the shop spends on itself"
        action={
          <div className="row">
            <Button
              title="Where it went"
              variant="dark"
              icon="trend"
              onClick={() => router.push('/expenses/analytics')}
            />
            {canManage ? (
              <Button
                title="Record one"
                icon="plus"
                onClick={() => router.push('/expenses/new')}
              />
            ) : null}
          </div>
        }
      />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          Spent across {feed.meta?.total ?? feed.items.length} entr
          {(feed.meta?.total ?? feed.items.length) === 1 ? 'y' : 'ies'}
        </span>
        <div className="t-display on-accent">{formatInr(total)}</div>
      </Card>

      <div className="toolbar" style={{ marginTop: 'var(--s-lg)' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Field
            placeholder="What it was, or who it went to"
            icon="search"
            value={search}
            onChange={setSearch}
            pasteable={false}
            style={{ marginBottom: 0 }}
          />
        </div>
        <Button
          title={applied ? `${applied} filter${applied === 1 ? '' : 's'}` : 'Filter'}
          variant={applied ? 'primary' : 'dark'}
          icon="filter"
          onClick={() => setFilterOpen(true)}
        />
      </div>

      <div style={{ height: 'var(--s-lg)' }} />

      {feed.loading ? (
        <Loader />
      ) : feed.items.length === 0 ? (
        <EmptyState title="Nothing recorded yet" />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>What for</th>
                <th>Category</th>
                <th>Paid to</th>
                <th>Paid by</th>
                <th>When</th>
                <th className="num">Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {feed.items.map((row) => (
                <tr
                  key={row.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/expenses/${row.id}`)}>
                  <td className="bold">{row.description}</td>
                  <td className="muted">{row.spentType}</td>
                  <td className="muted">{row.toName}</td>
                  <td className="muted">
                    {row.paymentType}
                    <div className="t-tiny faint">{row.doneBy}</div>
                  </td>
                  <td className="muted">{formatDateShort(row.date)}</td>
                  <td className="num bold">{formatInr(row.amount)}</td>
                  <td>
                    {row.order ? <Pill label={row.order.code} color="var(--accent)" /> : null}
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
        title="Filter expenses"
        dimensions={[
          { key: 'spentType', label: 'Category', options: labels(options.data?.SPENT_TYPE) },
          { key: 'paymentType', label: 'Paid by', options: labels(options.data?.PAYMENT_TYPE) },
          { key: 'doneBy', label: 'Spent by', options: labels(options.data?.DONE_BY) },
        ]}
        value={{ spentType, paymentType, doneBy }}
        onApply={(next) => {
          setSpentType((next.spentType as string) ?? null);
          setPaymentType((next.paymentType as string) ?? null);
          setDoneBy((next.doneBy as string) ?? null);
          setFilterOpen(false);
        }}
      />

      <ListFooter
        loading={feed.loadingMore}
        hasMore={feed.hasMore}
        shown={feed.items.length}
        total={feed.meta?.total ?? feed.items.length}
        noun="expenses"
        onMore={feed.loadMore}
      />
    </>
  );
}
