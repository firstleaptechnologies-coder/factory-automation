'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Material, Order, Workflow } from '@decor/shared';
import { LENGTH_UNITS, PERMISSIONS, UNIT_LABEL } from '@decor/shared';
import type { LengthUnit } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { usePaginated } from '@/lib/usePaginated';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { FilterSheet } from '@/components/FilterSheet';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  ListFooter,
  Loader,
  PageHead,
  Pill,
} from '@/ui';
import { formatInr, relativeTime } from '@/lib/format';

export default function OrdersPage() {
  return (
    <Shell>
      <Orders />
    </Shell>
  );
}

function Orders() {
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [statusId, setStatusId] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [unit, setUnit] = useState<LengthUnit>('FT');

  const workflow = useApi<Workflow>(() => api.defaultWorkflow(), []);
  const materials = useApi<Material[]>(() => api.materials(), []);

  const orders = usePaginated<Order>(
    (page) =>
      api.orders({
        unit,
        search: search || undefined,
        statusId: statusId ?? undefined,
        materialId: materialId ?? undefined,
        page,
        limit: 25,
      }),
    [unit, search, statusId, materialId],
  );

  const active = [statusId, materialId].filter(Boolean).length;

  return (
    <>
      {/* Everything the list is worked with stays at the top; only the rows
          scroll. */}
      <div className="sticky-bar">
      <PageHead
        title="Orders"
        subtitle={`${orders.total} total`}
        action={
          <div className="row">
            {/*
              The board is a way of looking at this list, not a place of its
              own — so it is reached from here rather than from the sidebar.
            */}
            <Button title="Board" variant="dark" onClick={() => router.push('/board')} />
            {can(PERMISSIONS.ORDER_PUNCH) ? (
              <Button title="Punch order" icon="plus" onClick={() => router.push('/punch')} />
            ) : null}
          </div>
        }
      />

      <div className="toolbar">
        <div style={{ flex: 1, minWidth: 240 }}>
          <Field
            placeholder="Order number, client or location"
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

      <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
        <span className="t-tiny faint" style={{ alignSelf: 'center', marginRight: 4 }}>
          Sizes in
        </span>
        {LENGTH_UNITS.map((option) => (
          <Chip
            key={option}
            label={UNIT_LABEL[option]}
            selected={unit === option}
            onClick={() => setUnit(option)}
          />
        ))}
      </div>
      </div>

      <div style={{ height: 'var(--s-lg)' }} />

      {orders.loading ? (
        <Loader />
      ) : orders.items.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title="No orders match"
          message="Try clearing the search or the filters."
        />
      ) : (
        <div className="stack-sm">
          {orders.items.map((order) => (
            <Card key={order.id} size="sm" className="row-card" onClick={() => router.push(`/orders/${order.id}`)}>
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <div className="t-h3 truncate">{order.client.name}</div>
                  <div className="t-tiny muted truncate">
                    {order.code} · {order.location} · {relativeTime(order.createdAt)}
                  </div>
                </div>
                <div className="row">
                  {Number(order.grandTotal) > 0 ? (
                    <span className="t-body bold accent">{formatInr(order.grandTotal)}</span>
                  ) : null}
                  <Pill label={order.status.name} color={order.status.color} />
                </div>
              </div>

              {/* The card stacks its children, so the items sit under the
                  heading line rather than beside the money. */}
              <div className="wrap">
                {order.items.map((item) => (
                  <span key={item.id} className="t-tiny muted">
                    <span
                      style={{
                        display: 'inline-block',
                        width: 7,
                        height: 7,
                        borderRadius: 4,
                        marginRight: 6,
                        background: item.material.color ?? 'var(--text-faint)',
                      }}
                    />
                    {item.display
                      ? `${item.display.length} × ${item.display.width} ${UNIT_LABEL[item.display.unit]}`
                      : '—'}
                    {' · '}
                    {item.material.name} × {item.quantity}
                  </span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter orders"
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
            key: 'materialId',
            label: 'Material',
            options: [
              { id: null, label: 'Any material' },
              ...(materials.data ?? []).map((material) => ({
                id: material.id,
                label: material.name,
                color: material.color,
              })),
            ],
          },
        ]}
        value={{ statusId, materialId }}
        onApply={(next) => {
          setStatusId(next.statusId ?? null);
          setMaterialId(next.materialId ?? null);
        }}
      />

      <ListFooter
        loading={orders.loadingMore}
        hasMore={orders.hasMore}
        shown={orders.items.length}
        total={orders.total}
        noun="orders"
        onMore={orders.loadMore}
      />
    </>
  );
}
