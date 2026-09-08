'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Tenant, TenantIsolation } from '@decor/shared';
import { MODULE_CATALOGUE, PERMISSIONS, PLANS, planFor } from '@decor/shared';
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
  const { user, loading, signOut, can, openWorkspace } = useAuth();

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

  /* Which workspace is being opened to help, if any, and why. */
  const [openFor, setOpenFor] = useState<Tenant | null>(null);
  const [reason, setReason] = useState('');

  const open = async () => {
    if (!openFor) return;
    setBusy(true);
    setError(null);
    try {
      await openWorkspace(openFor.id, reason.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that workspace');
      setBusy(false);
    }
  };

  /* Which workspace's plan is being changed, if any. */
  const [planFor_, setPlanFor] = useState<Tenant | null>(null);
  const [plan, setPlan] = useState('shop');
  const [extras, setExtras] = useState<string[]>([]);

  const openPlan = (tenant: Tenant) => {
    setPlanFor(tenant);
    setPlan(tenant.plan ?? 'shop');
    setExtras(tenant.modules ?? []);
    setError(null);
  };

  const savePlan = async () => {
    if (!planFor_) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateTenant(planFor_.id, { plan, modules: extras });
      setPlanFor(null);
      tenants.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the plan');
    } finally {
      setBusy(false);
    }
  };

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
              {/*
                Is anybody using it, and is it working for them?

                A workspace full of orders that nobody has opened for three
                weeks is a different problem from a quiet one, and only the log
                knows the difference.
              */}
              <div className="row" style={{ marginTop: 'var(--s-md)' }}>
                <Pill
                  label={activityLabel(tenant)}
                  color={activityColour(tenant)}
                />
                {tenant.health?.failures ? (
                  <span className="t-tiny danger">
                    {tenant.health.failures} failed {tenant.health.failures === 1 ? 'call' : 'calls'}
                  </span>
                ) : null}
                {tenant.health?.clientErrors ? (
                  <span className="t-tiny warning">
                    {tenant.health.clientErrors} app {tenant.health.clientErrors === 1 ? 'error' : 'errors'}
                  </span>
                ) : null}
              </div>

              <div className="row-between" style={{ marginTop: 'var(--s-md)' }}>
                <span className="t-tiny faint">
                  {tenant.counts?.unreachable
                    ? 'Database unreachable'
                    : `${tenant.counts?.users ?? 0} users · ${tenant.counts?.orders ?? 0} orders · ${tenant.counts?.clients ?? 0} clients`}
                </span>
                <div className="row">
                  <span className="t-tiny muted" data-testid="tenant-plan">
                    {planFor(tenant.plan).label} · {tenant.effectiveModules?.length ?? 0} modules
                  </span>
                  <Chip label="Plan" onClick={() => openPlan(tenant)} />
                  {can(PERMISSIONS.PLATFORM_IMPERSONATE) ? (
                    <Chip
                      label="Open"
                      onClick={() => {
                        setOpenFor(tenant);
                        setReason('');
                        setError(null);
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Sheet
        open={Boolean(openFor)}
        title={`Open ${openFor?.name ?? ''}`}
        subtitle="You will be working as their administrator, under your own name"
        onClose={() => setOpenFor(null)}>
        <p className="t-small muted">
          This is written into {openFor?.name}&rsquo;s own history, and the session ends by
          itself after half an hour. Everything you do there is recorded under your name, not
          theirs.
        </p>
        <Field
          label="Why are you going in?"
          placeholder="Their board is not loading and they are on the phone"
          value={reason}
          onChange={setReason}
          autoFocus
        />
        {error ? <p className="t-small danger">{error}</p> : null}
        <Button
          title="Open their workspace"
          block
          loading={busy}
          // The shop reads this sentence months later; a word is not a reason.
          disabled={reason.trim().length < 8}
          onClick={open}
        />
      </Sheet>

      <Sheet
        open={Boolean(planFor_)}
        title={`What ${planFor_?.name ?? ''} has`}
        subtitle="A plan, plus anything granted on top of it"
        onClose={() => setPlanFor(null)}>
        <span className="field-label">Plan</span>
        <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
          {PLANS.map((one) => (
            <Chip
              key={one.key}
              label={one.label}
              selected={plan === one.key}
              onClick={() => setPlan(one.key)}
            />
          ))}
        </div>
        <p className="t-tiny muted">{planFor(plan).blurb}</p>

        <span className="field-label">On top of it</span>
        <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
          {MODULE_CATALOGUE.filter((module) => !planFor(plan).modules.includes(module.key)).map(
            (module) => (
              <Chip
                key={module.key}
                label={module.comingSoon ? `${module.label} (soon)` : module.label}
                selected={extras.includes(module.key)}
                onClick={() =>
                  setExtras((current) =>
                    current.includes(module.key)
                      ? current.filter((one) => one !== module.key)
                      : [...current, module.key],
                  )
                }
              />
            ),
          )}
        </div>

        {error ? <p className="t-small danger">{error}</p> : null}
        <Button title="Save the plan" block loading={busy} onClick={savePlan} />
      </Sheet>

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

/** How long since anybody in there changed anything. */
function activityLabel(tenant: Tenant): string {
  const last = tenant.health?.lastSeenAt;
  if (!last) return 'Not used in a fortnight';

  const days = Math.floor((Date.now() - new Date(last).getTime()) / (24 * 60 * 60 * 1000));
  if (days === 0) return `Active today · ${tenant.health?.writes ?? 0} changes`;
  if (days === 1) return 'Last used yesterday';
  return `Last used ${days} days ago`;
}

/** Quiet is amber rather than red: it is a question, not a fault. */
function activityColour(tenant: Tenant): string {
  const last = tenant.health?.lastSeenAt;
  if (!last) return 'var(--warning)';
  const days = (Date.now() - new Date(last).getTime()) / (24 * 60 * 60 * 1000);
  if (days < 2) return 'var(--success)';
  if (days < 7) return 'var(--info)';
  return 'var(--warning)';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40);
}
