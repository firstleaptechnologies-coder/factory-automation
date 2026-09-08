'use client';

import { Suspense, use, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Expense, HistoryEntry } from '@decor/shared';
import { PERMISSIONS } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { optimizeImage } from '@/lib/optimize-image';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { HistoryTimeline } from '@/components/HistoryTimeline';
import { Button, Card, Loader, PageHead, Pill, Sheet } from '@/ui';
import { formatDateShort, formatInr } from '@/lib/format';
import { ExpenseForm } from '../ExpenseForm';

export default function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Shell>
      <Suspense fallback={<Loader />}>
        <Page id={id} />
      </Suspense>
    </Shell>
  );
}

/**
 * The same route, reading or correcting.
 *
 * `?edit=1` rather than a route of its own, which is how a quote is edited
 * here too: the thing being edited keeps its address, so a half-finished
 * correction can be shared, reloaded, or backed out of without losing it.
 */
function Page({ id }: { id: string }) {
  const editing = useSearchParams().get('edit') === '1';
  return editing ? <ExpenseForm id={id} /> : <Detail id={id} />;
}

/** One expense, what it was recorded as, and everything since. */
function Detail({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const expense = useApi<Expense>(() => api.expense(id), [id]);
  const history = useApi<HistoryEntry[]>(() => api.history('expenses', id), [id]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const canManage = can(PERMISSIONS.EXPENSE_MANAGE);

  if (expense.loading) return <Loader />;
  const row = expense.data;
  if (!row) return null;

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteExpense(id);
      router.push('/expenses');
    } finally {
      setBusy(false);
    }
  };

  /**
   * The bill, photographed at the counter.
   *
   * Optimised as a size image rather than a reference one: a bill is read, not
   * looked at, and the harder compression turns a printed rate into a smudge.
   */
  const attachBill = async (file: File) => {
    setUploading(true);
    try {
      await api.attachExpenseBill(id, await optimizeImage(file, 'SIZE_IMAGE'));
      expense.reload();
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <PageHead
        title={row.description}
        subtitle={`${row.spentType} · ${formatDateShort(row.date)}`}
        action={
          canManage ? (
            <div className="row">
              <Button
                title="Edit"
                variant="dark"
                icon="edit"
                onClick={() => router.push(`/expenses/${id}?edit=1`)}
              />
              <Button title="Delete" variant="danger" onClick={() => setConfirming(true)} />
            </div>
          ) : null
        }
      />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          {row.spentType}
        </span>
        <div className="t-display on-accent">{formatInr(row.amount)}</div>
        <div className="t-small on-accent" style={{ opacity: 0.8, marginTop: 4 }}>
          {row.paymentType} · paid to {row.toName}
        </div>
      </Card>

      <div className="grid-2" style={{ marginTop: 'var(--s-lg)' }}>
        <Card size="sm">
          <Row label="Spent by" value={row.doneBy} />
          <Row label="Attributed to" value={row.vendor} />
          {row.order ? (
            <Row label="Against order" value={`${row.order.code} · ${row.order.client.name}`} />
          ) : null}
          {row.note ? <Row label="Note" value={row.note} /> : null}
          {row.createdBy ? <Row label="Recorded by" value={row.createdBy.name} /> : null}
        </Card>

        {row.vendorGstin || row.taxAmount != null ? (
          <Card size="sm">
            <div className="toolbar" style={{ marginBottom: 'var(--s-sm)' }}>
              <div className="t-label" style={{ flex: 1 }}>Tax on this bill</div>
              <Pill
                label={row.itcEligible ? 'Credit claimable' : 'No credit'}
                color={row.itcEligible ? 'var(--success)' : 'var(--text-faint)'}
              />
            </div>
            {row.vendorGstin ? <Row label="Vendor GSTIN" value={row.vendorGstin} /> : null}
            {row.taxableValue != null ? (
              <Row label="Taxable value" value={formatInr(row.taxableValue)} />
            ) : null}
            {row.taxAmount != null ? <Row label="Tax" value={formatInr(row.taxAmount)} /> : null}
          </Card>
        ) : null}
      </div>

      <Card size="sm" style={{ marginTop: 'var(--s-lg)' }}>
        <div className="t-label muted">The bill</div>
        {row.bill ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={api.fileUrl(row.bill.id)}
              alt={`Bill for ${row.description}`}
              style={{ maxWidth: '100%', borderRadius: 12, marginTop: 'var(--s-sm)' }}
            />
            {canManage ? (
              <Button
                title="Remove"
                variant="dark"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.removeExpenseBill(id);
                    expense.reload();
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : null}
          </>
        ) : canManage ? (
          <label className="t-small" style={{ display: 'block', marginTop: 'var(--s-sm)' }}>
            {uploading ? 'Uploading…' : 'Attach a photo of the bill'}
            <input
              type="file"
              accept="image/*"
              aria-label="Attach a photo of the bill"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void attachBill(file);
              }}
            />
          </label>
        ) : (
          <div className="t-small faint">No bill was attached.</div>
        )}
      </Card>

      <h2 className="t-label muted" style={{ marginTop: 'var(--s-xl)' }}>History</h2>
      <HistoryTimeline
        entries={history.data ?? []}
        empty="Nothing has changed since this was recorded"
      />

      <Sheet
        open={confirming}
        title="Delete this expense?"
        subtitle="It comes off the books with its ledger entry. The history keeps a record of what was here."
        onClose={() => setConfirming(false)}>
        <Button title="Delete it" block variant="danger" loading={busy} onClick={remove} />
      </Sheet>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="toolbar" style={{ gap: 'var(--s-md)' }}>
      <span className="t-tiny muted" style={{ flex: 1 }}>{label}</span>
      <span className="t-small">{value}</span>
    </div>
  );
}
