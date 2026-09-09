'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Employee, EmploymentStatus } from '@fas/shared';
import { EMPLOYMENT_STATUS_LABELS, PERMISSIONS } from '@fas/shared';
import { api } from '@/lib/api';
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
import { formatDateShort } from '@/lib/format';

/** The colour a person's standing reads as. */
const TONE: Record<EmploymentStatus, string> = {
  ACTIVE: 'var(--success)',
  ON_LEAVE: 'var(--warning)',
  LEFT: 'var(--text-faint)',
};

export default function EmployeesPage() {
  return (
    <Shell>
      <Employees />
    </Shell>
  );
}

/**
 * Who works here.
 *
 * People who have left are out of the way unless they are asked for: the
 * question this screen answers is nearly always "who is on the floor", not
 * "who ever was".
 */
function Employees() {
  const router = useRouter();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<EmploymentStatus | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const feed = usePaginated<Employee>(
    (page) =>
      api.employees({
        search: search || undefined,
        status: status ?? undefined,
        page,
        limit: 25,
      }),
    [search, status],
  );

  const canManage = can(PERMISSIONS.EMPLOYEE_MANAGE);

  return (
    <>
      <PageHead
        title="Employees"
        subtitle="Who works here — a person, not a login"
        action={
          canManage ? (
            <Button
              title="Add someone"
              icon="plus"
              onClick={() => router.push('/employees/new')}
            />
          ) : null
        }
      />

      <div className="toolbar">
        <div style={{ flex: 1, minWidth: 240 }}>
          <Field
            placeholder="Name, number or what they do"
            icon="search"
            value={search}
            onChange={setSearch}
            pasteable={false}
            style={{ marginBottom: 0 }}
          />
        </div>
        <Button
          title={status ? '1 filter' : 'Filter'}
          variant={status ? 'primary' : 'dark'}
          icon="filter"
          onClick={() => setFilterOpen(true)}
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
                <th>What they do</th>
                <th>Department</th>
                <th>Joined</th>
                <th>Login</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {feed.items.map((person) => (
                <tr
                  key={person.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/employees/${person.id}`)}>
                  <td className="bold">{person.name}</td>
                  <td className="muted">{person.code}</td>
                  <td className="muted">{person.designation ?? '—'}</td>
                  <td className="muted">{person.department ?? '—'}</td>
                  <td className="muted">{formatDateShort(person.joinedOn)}</td>
                  <td className="muted">{person.user ? person.user.code : 'None'}</td>
                  <td>
                    <Pill
                      label={EMPLOYMENT_STATUS_LABELS[person.status]}
                      color={TONE[person.status]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter people"
        dimensions={[
          {
            key: 'status',
            label: 'Standing',
            options: [
              { id: null, label: 'Everyone still here' },
              { id: 'ACTIVE', label: EMPLOYMENT_STATUS_LABELS.ACTIVE, color: TONE.ACTIVE },
              {
                id: 'ON_LEAVE',
                label: EMPLOYMENT_STATUS_LABELS.ON_LEAVE,
                color: TONE.ON_LEAVE,
              },
              { id: 'LEFT', label: EMPLOYMENT_STATUS_LABELS.LEFT, color: TONE.LEFT },
            ],
          },
        ]}
        value={{ status }}
        onApply={(next) => {
          setStatus((next.status as EmploymentStatus) ?? null);
          setFilterOpen(false);
        }}
      />

      <ListFooter
        loading={feed.loadingMore}
        hasMore={feed.hasMore}
        shown={feed.items.length}
        total={feed.meta?.total ?? feed.items.length}
        noun="people"
        onMore={feed.loadMore}
      />
    </>
  );
}
