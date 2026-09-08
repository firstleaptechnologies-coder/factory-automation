'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Lead, LeadSource, Workflow } from '@decor/shared';
import { PERMISSIONS } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
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
import { formatInr, relativeTime } from '@/lib/format';

export default function LeadsPage() {
  return (
    <Shell>
      <Leads />
    </Shell>
  );
}

/**
 * Enquiries as a list.
 *
 * The sidebar opens this rather than the board for the same reason it opens the
 * order list: looking one up — by name, by phone, by where it came from — is
 * the common errand, and pushing the pipeline along is the occasional one.
 */
function Leads() {
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [statusId, setStatusId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const workflow = useApi<Workflow>(() => api.defaultWorkflow('LEAD'), []);
  const sources = useApi<LeadSource[]>(() => api.leadSources(), []);

  const leads = usePaginated<Lead>(
    (page) =>
      api.leads({
        search: search || undefined,
        statusId: statusId ?? undefined,
        sourceId: sourceId ?? undefined,
        page,
        limit: 25,
      }),
    [search, statusId, sourceId],
  );

  const active = [statusId, sourceId].filter(Boolean).length;

  return (
    <>
      {/* Same as the orders list: what you work the list with stays put. */}
      <div className="sticky-bar">
      <PageHead
        title="Leads"
        subtitle={`${leads.total} enquir${leads.total === 1 ? 'y' : 'ies'}`}
        action={
          <div className="row">
            <Button title="Board" variant="dark" onClick={() => router.push('/leads/board')} />
            <Button
              title="Archived"
              variant="dark"
              onClick={() => router.push('/leads/archived')}
            />
            {can(PERMISSIONS.LEAD_CREATE) ? (
              <Button title="New lead" icon="plus" onClick={() => router.push('/leads/board?new=1')} />
            ) : null}
          </div>
        }
      />

      <div className="toolbar">
        <div style={{ flex: 1, minWidth: 240 }}>
          <Field
            placeholder="Name, phone or what it is for"
            icon="search"
            value={search}
            onChange={setSearch}
            pasteable={false}
            style={{ marginBottom: 0 }}
          />
        </div>
        <Button
          title={active === 0 ? 'Filter' : `${active} filter${active === 1 ? '' : 's'}`}
          variant={active === 0 ? 'dark' : 'primary'}
          icon="filter"
          onClick={() => setFilterOpen(true)}
        />
      </div>
      </div>

      <div style={{ height: 'var(--s-lg)' }} />

      {leads.loading ? (
        <Loader />
      ) : leads.items.length === 0 ? (
        <EmptyState
          icon="trend"
          title="No enquiries match"
          message="Try clearing the search or the filters."
        />
      ) : (
        <div className="stack-sm">
          {leads.items.map((lead) => (
            <Card
              key={lead.id}
              size="sm"
              className="row-card"
              onClick={() => router.push(`/leads/${lead.id}`)}>
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <div className="t-h3 truncate">{lead.title}</div>
                  <div className="t-tiny muted truncate">
                    {lead.code} · {relativeTime(lead.createdAt)} ·{' '}
                    {lead.contactName ?? lead.client?.name ?? '—'}
                    {lead.contactPhone ? ` · ${lead.contactPhone}` : ''}
                  </div>
                </div>
                <div className="row">
                  {lead.convertedOrder ? (
                    <span className="t-tiny success bold">→ {lead.convertedOrder.code}</span>
                  ) : lead.estimatedValue ? (
                    <span className="t-body bold accent">
                      {formatInr(Number(lead.estimatedValue))}
                    </span>
                  ) : null}
                  {lead.source ? (
                    <Pill label={lead.source.name} color={lead.source.color ?? 'var(--surface-lit)'} />
                  ) : null}
                  <Pill label={lead.status.name} color={lead.status.color} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter leads"
        dimensions={[
          {
            key: 'statusId',
            label: 'Stage',
            options: [
              { id: null, label: 'Any stage' },
              ...(workflow.data?.statuses ?? []).map((status) => ({
                id: status.id,
                label: status.name,
                color: status.color,
              })),
            ],
          },
          {
            key: 'sourceId',
            label: 'Source',
            options: [
              { id: null, label: 'Any source' },
              ...(sources.data ?? []).map((source) => ({
                id: source.id,
                label: source.name,
                color: source.color,
              })),
            ],
          },
        ]}
        value={{ statusId, sourceId }}
        onApply={(next) => {
          setStatusId(next.statusId ?? null);
          setSourceId(next.sourceId ?? null);
        }}
      />

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
