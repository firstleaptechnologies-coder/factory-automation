'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Vendor } from '@fas/shared';
import { PERMISSIONS } from '@fas/shared';
import { api } from '@/lib/api';
import { usePaginated } from '@/lib/usePaginated';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { Button, Card, Chip, EmptyState, Field, ListFooter, Loader, PageHead, Pill } from '@/ui';

export default function VendorsPage() {
  return (
    <Shell>
      <Vendors />
    </Shell>
  );
}

/**
 * Everybody the shop buys from.
 *
 * A separate list from clients although the columns rhyme: the same firm is
 * occasionally both — a fabricator who supplies board and also orders panels —
 * and one list would have no way to say which way round.
 */
function Vendors() {
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const feed = usePaginated<Vendor>(
    (page) =>
      api.vendors({
        search: search || undefined,
        includeInactive: includeInactive || undefined,
        page,
        limit: 25,
      }),
    [search, includeInactive],
  );

  const canManage = can(PERMISSIONS.VENDOR_MANAGE);

  return (
    <>
      <PageHead
        title="Vendors"
        subtitle="Who the shop buys from"
        action={
          canManage ? (
            <Button title="Add a vendor" icon="plus" onClick={() => router.push('/vendors/new')} />
          ) : null
        }
      />

      <div className="toolbar">
        <div style={{ flex: 1, minWidth: 240 }}>
          <Field
            placeholder="Name, number or what they supply"
            icon="search"
            value={search}
            onChange={setSearch}
            pasteable={false}
            style={{ marginBottom: 0 }}
          />
        </div>
        <Chip label="Current" selected={!includeInactive} onClick={() => setIncludeInactive(false)} />
        <Chip
          label="Include retired"
          selected={includeInactive}
          onClick={() => setIncludeInactive(true)}
        />
      </div>

      <div style={{ height: 'var(--s-lg)' }} />

      {feed.loading ? (
        <Loader />
      ) : feed.items.length === 0 ? (
        <EmptyState title="Nobody on the list yet" />
      ) : (
        <Card size="sm" className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Number</th>
                <th>What they supply</th>
                <th>GSTIN</th>
                <th className="num">Purchases</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {feed.items.map((vendor) => (
                <tr
                  key={vendor.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/vendors/${vendor.id}`)}>
                  <td className="bold">{vendor.name}</td>
                  <td className="muted">{vendor.code}</td>
                  <td className="muted">{vendor.supplies ?? '—'}</td>
                  <td className="muted t-tiny">{vendor.gstin ?? '—'}</td>
                  <td className="num muted">{vendor._count?.purchases ?? 0}</td>
                  <td>
                    {vendor.isActive ? null : (
                      <Pill label="Retired" color="var(--text-faint)" />
                    )}
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
        total={feed.meta?.total ?? feed.items.length}
        noun="vendors"
        onMore={feed.loadMore}
      />
    </>
  );
}
