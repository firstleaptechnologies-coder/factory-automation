'use client';

import { useState } from 'react';
import type { ExpenseAnalytics, ExpenseSlice } from '@decor/shared';
import { isoDate } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { Shell } from '@/components/Shell';
import { Card, Chip, EmptyState, Loader, PageHead } from '@/ui';
import { formatInr } from '@/lib/format';

/** The windows worth asking for, without making anybody type a date. */
const WINDOWS = [
  { key: 'all', label: 'All time' },
  { key: 'year', label: 'This year' },
  { key: 'month', label: 'This month' },
] as const;

type Window = (typeof WINDOWS)[number]['key'];

/** The first day of the window, or nothing at all for all time. */
export function windowStart(key: Window, now = new Date()): string | undefined {
  if (key === 'all') return undefined;
  // Local, like every date a person picks: a shop is asking about its own
  // year, not about UTC's.
  return isoDate(new Date(now.getFullYear(), key === 'month' ? now.getMonth() : 0, 1));
}

export default function ExpenseAnalyticsPage() {
  return (
    <Shell>
      <Analytics />
    </Shell>
  );
}

/** Where the money went, cut the four ways the shop asks about. */
function Analytics() {
  const [window, setWindow] = useState<Window>('year');
  const analytics = useApi<ExpenseAnalytics>(
    () => api.expenseAnalytics({ from: windowStart(window) }),
    [window],
  );

  if (analytics.loading) return <Loader />;
  const data = analytics.data;
  if (!data) return null;

  return (
    <>
      <PageHead
        title="Where the money went"
        subtitle="Spending, cut four ways"
        action={
          <div className="row">
            {WINDOWS.map((option) => (
              <Chip
                key={option.key}
                label={option.label}
                selected={window === option.key}
                onClick={() => setWindow(option.key)}
              />
            ))}
          </div>
        }
      />

      <Card tone="accent" className="enter">
        <span className="t-label on-accent" style={{ opacity: 0.75 }}>
          {data.count} entr{data.count === 1 ? 'y' : 'ies'}
        </span>
        <div className="t-display on-accent">{formatInr(data.total)}</div>
      </Card>

      {data.count === 0 ? (
        <EmptyState title="Nothing spent in this window" />
      ) : (
        <div className="grid-2" style={{ marginTop: 'var(--s-lg)' }}>
          <Breakdown title="By category" slices={data.bySpentType} total={data.total} />
          <Breakdown title="By who spent it" slices={data.byDoneBy} total={data.total} />
          <Breakdown title="By how it was paid" slices={data.byPaymentType} total={data.total} />
          <Breakdown title="Top recipients" slices={data.byToName} total={data.total} />
        </div>
      )}
    </>
  );
}

/**
 * One cut of the spending.
 *
 * A bar per row rather than a pie: the question is nearly always "what is the
 * big one", and a length is easier to compare than an angle.
 */
function Breakdown({
  title,
  slices,
  total,
}: {
  title: string;
  slices: ExpenseSlice[];
  total: number;
}) {
  if (slices.length === 0) return null;
  return (
    <Card size="sm">
      <div className="t-label muted">{title}</div>
      {slices.map((slice) => (
        <div key={slice.label} style={{ marginTop: 'var(--s-sm)' }}>
          <div className="toolbar" style={{ gap: 'var(--s-md)' }}>
            <span className="t-small" style={{ flex: 1 }}>{slice.label}</span>
            <span className="t-small bold">{formatInr(slice.amount)}</span>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{
                width: `${total > 0 ? Math.max(2, (slice.amount / total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      ))}
    </Card>
  );
}
