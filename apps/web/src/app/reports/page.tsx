'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Report } from '@fas/shared';
import { PERMISSIONS, REPORT_LABELS, REPORT_STATUS_LABELS } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { Button, Card, EmptyState, Loader, PageHead, Pill, SectionHead } from '@/ui';
import { formatDateShort } from '@/lib/format';
import { isWorking, statusColour } from './status';

export default function ReportsPage() {
  return (
    <Shell>
      <Reports />
    </Shell>
  );
}

/**
 * Everything the shop has asked for, newest first.
 *
 * A report is asked for on one request and built on another, so this list is
 * showing work in progress: rows move from Waiting to Building to Ready with
 * nobody touching them. It reloads itself while anything is still working and
 * stops as soon as nothing is — a screen that polls forever is a screen that
 * keeps a phone awake in somebody's pocket.
 */
function Reports() {
  const router = useRouter();
  const { can } = useAuth();
  const reports = useApi<Report[]>(() => api.reports(), []);

  const rows = reports.data ?? [];
  const working = rows.some((row) => isWorking(row.status));

  useEffect(() => {
    if (!working) return;
    const timer = setInterval(reports.reload, 4000);
    return () => clearInterval(timer);
  }, [working, reports.reload]);

  if (reports.loading && rows.length === 0) return <Loader label="Loading reports" />;

  return (
    <>
      <PageHead title="Reports" subtitle="Exports for the books" />

      {can(PERMISSIONS.REPORT_RUN) && (
        <Button title="Ask for a report" onClick={() => router.push('/reports/new')} />
      )}

      <SectionHead title="Asked for" />

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing asked for yet"
          message="A report is built in the background and kept for a fortnight."
        />
      ) : (
        <div className="stack-sm">
          {rows.map((row) => (
            <Card key={row.id} size="sm">
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <div className="t-h3 truncate">{REPORT_LABELS[row.kind as never] ?? row.kind}</div>
                  <div className="t-tiny muted">
                    {row.fromDate && row.toDate
                      ? `${formatDateShort(row.fromDate)} — ${formatDateShort(row.toDate)}`
                      : 'All time'}
                    {row.rowCount != null ? ` · ${row.rowCount} rows` : ''}
                  </div>
                  <div className="t-tiny faint">
                    {formatDateShort(row.createdAt)}
                    {row.requestedBy?.name ? ` · ${row.requestedBy.name}` : ''}
                  </div>
                  {/* Said plainly, rather than leaving somebody staring at a
                      row that stopped moving with no reason given. */}
                  {row.status === 'FAILED' && row.error && (
                    <div className="t-tiny" style={{ color: 'var(--danger)' }}>
                      {row.error}
                    </div>
                  )}
                </div>
                <div className="row">
                  {row.status === 'READY' && (
                    <a
                      className="t-tiny"
                      href={api.reportDownloadUrl(row.id)}
                      style={{ color: 'var(--accent)' }}
                    >
                      Download
                    </a>
                  )}
                  <Pill
                    label={REPORT_STATUS_LABELS[row.status]}
                    color={statusColour(row.status)}
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
