'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Tenant, TenantIsolation } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Icon,
  Loader,
  PageHead,
  Pill,
  Sheet,
} from '@/ui';
import { formatDate } from '@/lib/format';

const STATUS_COLOR: Record<string, string> = {
  TRIAL: 'var(--info)',
  ACTIVE: 'var(--success)',
  SUSPENDED: 'var(--danger)',
};

/**
 * The control plane: every workspace on the platform.
 *
 * A platform admin belongs to no workspace, so this screen sits outside the
 * shop shell entirely — there is no board or order list for them to see.
 */
export default function TenantsPage() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && !user.isPlatform) router.replace('/');
  }, [loading, user, router]);

  const tenants = useApi<Tenant[]>(() => api.tenants(), []);

  const [sheet, setSheet] = useState(false);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [isolation, setIsolation] = useState<TenantIsolation>('SHARED');
  const [databaseUrl, setDatabaseUrl] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerCode, setOwnerCode] = useState('ADMIN');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createTenant({
        slug: slug.trim().toLowerCase(),
        name: name.trim(),
        isolation,
        databaseUrl: isolation === 'DEDICATED' ? databaseUrl.trim() : undefined,
        ownerName: ownerName.trim(),
        ownerCode: ownerCode.trim().toUpperCase(),
        ownerPassword,
      });
      setSheet(false);
      setSlug('');
      setName('');
      setOwnerName('');
      setOwnerPassword('');
      tenants.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the workspace');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) return <Loader />;

  return (
    <div className="shell-main" style={{ margin: '0 auto' }}>
      <PageHead
        title="Workspaces"
        subtitle={`${tenants.data?.length ?? 0} on the platform`}
        action={
          <div className="row">
            <Button title="New workspace" icon="plus" onClick={() => setSheet(true)} />
            <Button title="Sign out" variant="ghost" onClick={signOut} />
          </div>
        }
      />

      {tenants.loading ? (
        <Loader />
      ) : (tenants.data?.length ?? 0) === 0 ? (
        <EmptyState icon="box" title="No workspaces yet" />
      ) : (
        <div className="stack-sm">
          {tenants.data?.map((tenant) => (
            <Card key={tenant.id} size="sm">
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <div className="t-h3 truncate">{tenant.name}</div>
                  <div className="t-tiny muted">
                    {tenant.slug} · created {formatDate(tenant.createdAt)}
                  </div>
                </div>
                <div className="row">
                  <Pill
                    label={tenant.hasDedicatedDatabase ? 'Own database' : 'Shared'}
                    color="var(--surface-lit)"
                  />
                  <Pill label={tenant.status} color={STATUS_COLOR[tenant.status]} />
                </div>
              </div>
              <div className="wrap" style={{ marginTop: 'var(--s-md)' }}>
                <span className="t-tiny faint">
                  {tenant.counts?.unreachable
                    ? 'Database unreachable'
                    : `${tenant.counts?.users ?? 0} users · ${tenant.counts?.orders ?? 0} orders · ${tenant.counts?.clients ?? 0} clients`}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Sheet
        open={sheet}
        title="New workspace"
        subtitle="Seeded with a working shop the owner then edits"
        onClose={() => setSheet(false)}>
        <Field
          label="Workspace name"
          placeholder="Woodcraft Studio"
          value={name}
          onChange={(value) => {
            setName(value);
            // The slug is what people type at sign-in, so it is offered rather
            // than demanded — but it stays editable.
            if (!slug || slug === slugify(name)) setSlug(slugify(value));
          }}
          autoFocus
        />
        <Field
          label="Sign-in slug"
          placeholder="woodcraft"
          value={slug}
          onChange={(value) => setSlug(slugify(value))}
          hint="What their staff type on the sign-in screen."
        />

        <span className="field-label">Where their data lives</span>
        <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
          <Chip
            label="Shared database"
            selected={isolation === 'SHARED'}
            onClick={() => setIsolation('SHARED')}
          />
          <Chip
            label="Their own database"
            selected={isolation === 'DEDICATED'}
            onClick={() => setIsolation('DEDICATED')}
          />
        </div>
        {isolation === 'DEDICATED' ? (
          <Field
            label="Database URL"
            placeholder="postgresql://…"
            value={databaseUrl}
            onChange={setDatabaseUrl}
            hint="Stored encrypted and never returned by the API."
          />
        ) : null}

        <span className="field-label">Their first user</span>
        <Field label="Name" value={ownerName} onChange={setOwnerName} />
        <Field label="Employee code" value={ownerCode} onChange={setOwnerCode} />
        <Field
          label="Password"
          type="password"
          value={ownerPassword}
          onChange={setOwnerPassword}
        />

        {error ? <p className="t-small danger">{error}</p> : null}
        <Button
          title="Create workspace"
          block
          loading={busy}
          disabled={
            !slug.trim() ||
            !name.trim() ||
            !ownerName.trim() ||
            !ownerPassword ||
            (isolation === 'DEDICATED' && !databaseUrl.trim())
          }
          onClick={create}
        />
      </Sheet>
    </div>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40);
}
