'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StockLevels } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Shell } from '@/components/Shell';
import { Button, Card, Chip, EmptyState, Field, Loader, PageHead, Pill } from '@/ui';
import { formatInr } from '@/lib/format';

export default function StockPage() {
  return (
    <Shell>
      <Stock />
    </Shell>
  );
}

/**
 * What is on the rack.
 *
 * Summed from every move rather than read off a stored level: a quantity
 * somebody can type over is a quantity with no explanation behind it, and
 * "where did four sheets go" is the question this screen exists to answer.
 */
function Stock() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  const stock = useApi<StockLevels>(
    () => api.stockLevels({ search: search || undefined, lowOnly }),
    [search, lowOnly],
  );

  const data = stock.data;

  return (
    <>
      <PageHead
        title="Stock"
        subtitle="What is on the rack"
        action={
          <Button
            title="Waste"
            variant="dark"
            icon="trend"
            onClick={() => router.push('/stock/waste')}
          />
        }
      />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          The rack is worth
        </span>
        <div className="t-display on-accent">{formatInr(data?.totals.value ?? 0)}</div>
        {data && data.totals.low > 0 ? (
          <div className="t-small on-accent" style={{ opacity: 0.8, marginTop: 4 }}>
            {data.totals.low} {data.totals.low === 1 ? 'material needs' : 'materials need'}{' '}
            ordering
          </div>
        ) : null}
      </Card>

      <div className="toolbar" style={{ marginTop: 'var(--s-lg)' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Field
            placeholder="Material name or code"
            icon="search"
            value={search}
            onChange={setSearch}
            pasteable={false}
            style={{ marginBottom: 0 }}
          />
        </div>
        <Chip label="Everything" selected={!lowOnly} onClick={() => setLowOnly(false)} />
        <Chip label="Needs ordering" selected={lowOnly} onClick={() => setLowOnly(true)} />
      </div>

      <div style={{ height: 'var(--s-lg)' }} />

      {stock.loading ? (
        <Loader />
      ) : (data?.rows ?? []).length === 0 ? (
        <EmptyState
          title={lowOnly ? 'Nothing needs ordering' : 'Nothing on the rack yet'}
        />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Material</th>
                <th>By thickness</th>
                <th className="num">On the rack</th>
                <th className="num">Each</th>
                <th className="num">Worth</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row) => (
                <tr
                  key={row.material.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/stock/${row.material.id}`)}>
                  <td className="bold">{row.material.name}</td>
                  <td className="muted t-tiny">
                    {row.byThickness
                      .filter((one) => one.quantity !== 0)
                      .map(
                        (one) =>
                          `${one.thickness.label ?? `${one.thickness.valueMm}mm`}: ${one.quantity}`,
                      )
                      .join(' · ') || '—'}
                  </td>
                  <td className="num bold">
                    {row.quantity} {row.material.stockUnit}
                  </td>
                  <td className="num muted">
                    {row.averageRate > 0 ? formatInr(row.averageRate) : '—'}
                  </td>
                  <td className="num">{formatInr(row.value)}</td>
                  <td>{row.low ? <Pill label="Order more" color="var(--warning)" /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
