'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Invoice } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Shell } from '@/components/Shell';
import { Card, EmptyState, Field, Loader, PageHead, Pill, SectionHead } from '@/ui';
import { formatDateShort, formatInr } from '@/lib/format';

export default function InvoicesPage() {
  return (
    <Shell>
      <Invoices />
    </Shell>
  );
}

/**
 * Every bill the shop has raised, newest first.
 *
 * The search covers the invoice number, the client and the order number
 * together, because somebody holding a piece of paper has one of the three and
 * does not know which of them the system calls it.
 */
function Invoices() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const invoices = useApi<Invoice[]>(
    () => api.invoices(search ? { search } : undefined),
    [search],
  );

  const rows = invoices.data ?? [];
  // Cancelled invoices keep their numbers and claim nothing, so they are
  // counted nowhere: summing them would overstate what the shop has billed.
  const billed = rows
    .filter((row) => row.status === 'ISSUED')
    .reduce((sum, row) => sum + Number(row.total), 0);

  if (invoices.loading && rows.length === 0) return <Loader label="Loading invoices" />;

  return (
    <>
      <PageHead title="Invoices" subtitle="What the shop has billed" />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          Billed
        </span>
        <div className="t-display on-accent">{formatInr(billed)}</div>
        <div className="t-tiny on-accent" style={{ opacity: 0.75, marginTop: 'var(--s-sm)' }}>
          {rows.length} document{rows.length === 1 ? '' : 's'} · cancelled ones claim nothing
        </div>
      </Card>

      <Field
        label="Find one"
        placeholder="Invoice number, client or order"
        value={search}
        onChange={setSearch}
      />

      <SectionHead title="Invoices" />

      {rows.length === 0 ? (
        <EmptyState title="Nothing billed yet" />
      ) : (
        <div className="stack-sm">
          {rows.map((row) => (
            <Card key={row.id} size="sm" onClick={() => router.push(`/invoices/${row.id}`)}>
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <div className="t-h3 truncate">{row.code}</div>
                  <div className="t-tiny muted">
                    {row.clientName}
                    {row.order?.code ? ` · ${row.order.code}` : ''}
                  </div>
                  <div className="t-tiny faint">{formatDateShort(row.issuedOn)}</div>
                </div>
                <div className="row">
                  <span className="t-h3">{formatInr(row.total)}</span>
                  <Pill
                    label={row.status === 'CANCELLED' ? 'Cancelled' : 'Issued'}
                    color={row.status === 'CANCELLED' ? 'var(--danger)' : 'var(--success)'}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
