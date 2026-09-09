'use client';

import { useRouter } from 'next/navigation';
import type { Lead } from '@fas/shared';
import { api } from '@/lib/api';
import { usePaginated } from '@/lib/usePaginated';
import { Shell } from '@/components/Shell';
import { Card, EmptyState, ListFooter, Loader, PageHead, Pill } from '@/ui';
import { formatInr, relativeTime } from '@/lib/format';

export default function ArchivedLeadsPage() {
  return (
    <Shell>
      <Archived />
    </Shell>
  );
}

/**
 * Enquiries that went quiet.
 *
 * Nothing was deleted and nothing needs restoring: a lead lands here by having
 * sat untouched longer than the pipeline allows, and leaves the moment somebody
 * touches it again.
 */
function Archived() {
  const router = useRouter();
  const leads = usePaginated<Lead>((page) => api.leads({ archived: true, page, limit: 25 }), []);

  return (
    <>
      <PageHead title="Archived" subtitle={`${leads.total} gone quiet`} />

      <p className="t-small muted" style={{ marginTop: 0 }}>
        Enquiries nobody has touched for longer than the pipeline allows. Open one
        and do anything at all — a note, a call, a move — and it goes back on the
        board.
      </p>

      {leads.loading ? (
        <Loader />
      ) : leads.items.length === 0 ? (
        <EmptyState
          icon="trend"
          title="Nothing has gone quiet"
          message="Every enquiry has been touched inside the window."
        />
      ) : (
        <div className="stack-sm">
          {leads.items.map((lead) => (
            <Card
              key={lead.id}
              size="sm"
              className="row-card"
              onClick={() => router.push(`/leads/board?lead=${lead.id}`)}>
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <div className="t-h3 truncate">{lead.title}</div>
                  <div className="t-tiny muted truncate">
                    {lead.code} · last touched {relativeTime(lead.updatedAt)} ·{' '}
                    {lead.contactName ?? lead.client?.name ?? '—'}
                  </div>
                </div>
                <div className="row">
                  {lead.estimatedValue ? (
                    <span className="t-small muted">
                      {formatInr(Number(lead.estimatedValue))}
                    </span>
                  ) : null}
                  <Pill label={lead.status.name} color={lead.status.color} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ListFooter
        loading={leads.loadingMore}
        hasMore={leads.hasMore}
        shown={leads.items.length}
        total={leads.total}
        noun="enquiries"
        onMore={leads.loadMore}
      />
    </>
  );
}
