'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Client } from '@fas/shared';
import { api } from '@/lib/api';
import { usePaginated } from '@/lib/usePaginated';
import { Shell } from '@/components/Shell';
import {
  Avatar,
  Card,
  EmptyState,
  Field,
  Icon,
  Button,
  ListFooter,
  Loader,
  PageHead,
} from '@/ui';

export default function ClientsPage() {
  return (
    <Shell>
      <Clients />
    </Shell>
  );
}

function Clients() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const clients = usePaginated<Client>(
    (page) => api.clients({ search: search || undefined, page, limit: 25 }),
    [search],
  );

  return (
    <>
      <PageHead
        title="Clients"
        subtitle={`${clients.total} on file`}
        action={<Button title="Add client" icon="plus" onClick={() => router.push('/clients/new')} />}
      />

      <Field
        placeholder="Name, phone or code"
        icon="search"
        value={search}
        onChange={setSearch}
        pasteable={false}
      />

      {clients.loading ? (
        <Loader />
      ) : clients.items.length === 0 ? (
        <EmptyState
          icon="users"
          title={search ? 'Nobody matches that' : 'No clients yet'}
          message={
            search
              ? 'Add them, and the next order can be punched against their name.'
              : 'Add one by hand — orders punched for somebody new add them too.'
          }
          action={
            <Button
              title="Add client"
              onClick={() =>
                router.push(
                  search.trim()
                    ? `/clients/new?name=${encodeURIComponent(search.trim())}`
                    : '/clients/new',
                )
              }
            />
          }
        />
      ) : (
        <div className="stack-sm">
          {clients.items.map((client) => (
            <Card key={client.id} size="sm" className="row-card" onClick={() => router.push(`/clients/${client.id}`)}>
              <div className="row">
                <Avatar name={client.name} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t-body bold truncate">{client.name}</div>
                  <div className="t-tiny muted truncate">
                    {client.code}
                    {client.phone ? ` · ${client.phone}` : ''}
                    {client.company ? ` · ${client.company}` : ''}
                    {client.gstin ? ` · ${client.gstin}` : ''}
                  </div>
                </div>
                <span className="t-tiny accent bold">{client._count?.orders ?? 0} orders</span>
                <Icon name="chevronRight" size={16} color="var(--text-faint)" />
              </div>
            </Card>
          ))}
        </div>
      )}

      <ListFooter
        loading={clients.loadingMore}
        hasMore={clients.hasMore}
        shown={clients.items.length}
        total={clients.total}
        noun="clients"
        onMore={clients.loadMore}
      />
    </>
  );
}
