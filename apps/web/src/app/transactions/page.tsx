'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  CashToBankRow,
  CashPosition,
  Transaction,
  TransactionKind,
} from '@fas/shared';
import { TRANSACTION_LABELS } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePaginated } from '@/lib/usePaginated';
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
  SectionHead,
} from '@/ui';
import { formatDateTime, formatInr } from '@/lib/format';

export default function TransactionsPage() {
  return (
    <Shell>
      <Transactions />
    </Shell>
  );
}

/** The colour a movement reads as: money in, money moved, money spent. */
const TONE: Record<TransactionKind, string> = {
  PAYMENT_CASH: 'var(--success)',
  PAYMENT_ONLINE: 'var(--info)',
  BANK_DEPOSIT: 'var(--text-muted)',
  EXPENSE: 'var(--warning)',
  PURCHASE: 'var(--info)',
  SALARY: 'var(--accent)',
  ADVANCE: 'var(--text-muted)',
};

/**
 * Every movement of money except a payout.
 *
 * One list rather than one per source, because "what happened to the money" is
 * a single question: cash taken, an online transfer, a trip to the bank. What
 * is still in hand sits above it — the one figure that cannot be read off a
 * bank statement, and the one somebody has to answer for.
 *
 * Payouts are deliberately elsewhere, in their own ledger: they sit beside
 * orders rather than inside them, and folding them in here would be the
 * netting-off the books must not do.
 */
function Transactions() {
  const router = useRouter();
  const position = useApi<CashPosition>(() => api.cashPosition(), []);
  const toBank = useApi<CashToBankRow[]>(() => api.cashToBank(), []);

  const [kind, setKind] = useState<TransactionKind | null>(null);
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  const feed = usePaginated<Transaction>(
    useCallback(
      (page) =>
        api.transactions({
          kind: kind ?? undefined,
          search: search || undefined,
          page,
          limit: 25,
        }),
      [kind, search],
    ),
    [kind, search],
  );

  if (position.loading) return <Loader label="Counting" />;
  const data = position.data;
  if (!data) return null;

  return (
    <>
      <PageHead
        title="Transactions"
        subtitle="Every movement of money except payouts"
        action={
          <Button
            title={kind ? TRANSACTION_LABELS[kind] : 'Filter'}
            variant={kind ? 'primary' : 'dark'}
            icon="filter"
            onClick={() => setFilterOpen(true)}
          />
        }
      />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          In hand
        </span>
        <div className="t-display on-accent">{formatInr(data.cash.inHand)}</div>
        {/*
          Every movement that made the figure, in the order they happened. The
          banked line used to be missing, so the words under the number did not
          add up to it: ₹20,000 taken less ₹6,000 paid out is not minus ₹1,000,
          and the ₹15,000 that explained it was nowhere on the card.
        */}
        <div className="t-small on-accent" style={{ opacity: 0.8, marginTop: 4 }}>
          {formatInr(data.cash.received)} taken in cash
        </div>
        {data.cash.deposited > 0 && (
          <div className="t-small on-accent" style={{ opacity: 0.8 }}>
            less {formatInr(data.cash.deposited)} banked
          </div>
        )}
        {data.cash.paidOut > 0 && (
          <div className="t-small on-accent" style={{ opacity: 0.8 }}>
            less {formatInr(data.cash.paidOut)} paid out in cash
          </div>
        )}
        {/*
          A drawer cannot hold less than nothing, so saying so plainly is the
          only honest thing to draw.
        */}
        {data.cash.inHand < 0 && (
          <div className="t-small on-accent bold" style={{ marginTop: 8 }} data-testid="cash-negative">
            More cash has gone out than came in. A receipt is missing, or this was
            paid from money the app has not seen.
          </div>
        )}
      </Card>

      {/* The bifurcation: where the money came in and where it went. */}
      <div className="grid-3" style={{ marginTop: 'var(--s-lg)' }}>
        <Card size="sm">
          <div className="t-label muted">Collected</div>
          <div className="t-h2">{formatInr(data.cash.received + data.online.received)}</div>
        </Card>
        <Card size="sm">
          <div className="t-label muted">Cash banked</div>
          <div className="t-h2">{formatInr(data.cash.deposited)}</div>
          <div className="t-tiny muted">{data.deposits} deposits</div>
        </Card>
        <Card size="sm">
          <div className="t-label muted">Online</div>
          <div className="t-h2">{formatInr(data.online.received)}</div>
          <div className="t-tiny muted">already in bank</div>
        </Card>
      </div>

      <SectionHead
        title={`${feed.total} ${feed.total === 1 ? 'movement' : 'movements'}`}
      />

      <Field
        icon="search"
        placeholder="Order, client or reference"
        value={search}
        onChange={setSearch}
        pasteable={false}
      />

      {feed.loading && feed.items.length === 0 ? (
        <Loader label="Reading the ledger" />
      ) : feed.items.length === 0 ? (
        <EmptyState
          icon="card"
          title="Nothing here"
          message={
            kind || search
              ? 'Nothing matches that. Clear the filter to see everything.'
              : 'Money recorded against an order shows up here.'
          }
        />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th>Order</th>
                <th>Reference</th>
                <th>By</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {feed.items.map((row) => (
                <tr
                  key={row.id}
                  data-testid={`movement-${row.id}`}
                  style={{ cursor: row.order ? 'pointer' : undefined }}
                  onClick={
                    row.order
                      ? () => router.push(`/orders/${row.order!.id}/payments`)
                      : undefined
                  }>
                  <td className="muted">{formatDateTime(row.at)}</td>
                  <td>
                    <Pill label={TRANSACTION_LABELS[row.kind]} color={TONE[row.kind]} />
                  </td>
                  <td>
                    {row.order ? (
                      <>
                        <span className="bold">{row.order.code}</span>
                        <span className="muted"> · {row.order.client.name}</span>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="muted">
                    {[row.reference, row.note].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="muted">{row.by?.name ?? '—'}</td>
                  {/* A trip to the bank is the same money moving, so it is
                      never shown as a gain. */}
                  <td className={`num bold${row.direction === 'IN' ? ' accent' : ' muted'}`}>
                    {row.direction === 'IN' ? '+' : ''}
                    {formatInr(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <ListFooter
        loading={feed.loadingMore}
        hasMore={feed.hasMore}
        shown={feed.items.length}
        total={feed.total}
        noun="movements"
        onMore={feed.loadMore}
      />

      {/*
        Not "in hand": these are receipts, and a payout empties the drawer
        without touching any of them. Under the old heading the two figures
        were the same word and a different number.
      */}
      <SectionHead title="Taken in cash, not yet banked" />
      {data.cash.paidOut > 0 && (
        <p className="t-tiny muted" data-testid="cash-reconcile">
          {formatInr(data.cash.notBanked)} still to bank, less{' '}
          {formatInr(data.cash.paidOut)} paid out in cash, leaves{' '}
          {formatInr(data.cash.inHand)} in hand.
        </p>
      )}
      {(toBank.data?.length ?? 0) === 0 ? (
        <EmptyState icon="card" title="Nothing in hand" message="Every rupee taken has been banked." />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Client</th>
                <th className="num">Taken</th>
                <th className="num">Banked</th>
                <th className="num">To bank</th>
              </tr>
            </thead>
            <tbody>
              {toBank.data?.map((row) => (
                <tr
                  key={row.paymentId}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/orders/${row.orderId}/payments`)}>
                  <td className="bold">{row.orderCode}</td>
                  <td className="muted">{row.client}</td>
                  <td className="num muted">{formatInr(row.received)}</td>
                  <td className="num muted">{formatInr(row.deposited)}</td>
                  <td className="num bold warning">{formatInr(row.notBanked)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter movements"
        dimensions={[
          {
            key: 'kind',
            label: 'Kind',
            options: [
              { id: null, label: 'Everything' },
              {
                id: 'PAYMENT_CASH',
                label: TRANSACTION_LABELS.PAYMENT_CASH,
                color: TONE.PAYMENT_CASH,
              },
              {
                id: 'PAYMENT_ONLINE',
                label: TRANSACTION_LABELS.PAYMENT_ONLINE,
                color: TONE.PAYMENT_ONLINE,
              },
              {
                id: 'BANK_DEPOSIT',
                label: TRANSACTION_LABELS.BANK_DEPOSIT,
                color: TONE.BANK_DEPOSIT,
              },
              { id: 'EXPENSE', label: TRANSACTION_LABELS.EXPENSE, color: TONE.EXPENSE },
              { id: 'PURCHASE', label: TRANSACTION_LABELS.PURCHASE, color: TONE.PURCHASE },
              { id: 'SALARY', label: TRANSACTION_LABELS.SALARY, color: TONE.SALARY },
              { id: 'ADVANCE', label: TRANSACTION_LABELS.ADVANCE, color: TONE.ADVANCE },
            ],
          },
        ]}
        value={{ kind }}
        onApply={(next) => {
          setKind((next.kind as TransactionKind) ?? null);
          setFilterOpen(false);
        }}
      />
    </>
  );
}
