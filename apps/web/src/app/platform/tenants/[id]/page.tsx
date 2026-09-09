'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CORE_MODULES, MODULE_CATALOGUE, billFor } from '@fas/shared';
import type { ModuleKey } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { formatInr } from '@/lib/format';
import {
  Button,
  Card,
  Chip,
  Field,
  Loader,
  PageHead,
  Pill,
  SectionHead,
  Sheet,
} from '@/ui';
import type { TenantDetail } from './types';

/**
 * One workspace, all the way down.
 *
 * The list can only say what is true of everybody. This is where a question
 * about one shop gets answered: what they are on, what they can actually
 * reach, who is in it, whether it is working for them, and what it is worth —
 * with the controls beside the facts rather than behind a sheet on another
 * page.
 *
 * Two things are deliberately read-only. Their people and their roles are
 * theirs: changing somebody's role inside a shop is done by opening their
 * workspace, under our own name, in their own audit trail — not by reaching
 * into their tables from out here. And their connection string is never
 * returned by the API at all.
 */
export default function WorkspacePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can, openWorkspace } = useAuth();
  const id = params.id;

  const detail = useApi<TenantDetail>(() => api.tenantDetail(id) as Promise<TenantDetail>, [id]);
  const tiers = useApi<
    { key: string; label: string; monthlyPrice: number; includedModules: string[] }[]
  >(() => api.platformTiers() as never, []);
  const prices = useApi<{ moduleKey: string; monthlyPrice: number; isPriced: boolean }[]>(
    () => api.platformModulePrices() as never,
    [],
  );

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [openFor, setOpenFor] = useState(false);
  const [reason, setReason] = useState('');

  const mayManage = can('platform.tenant.manage');

  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    setFailed(null);
    try {
      await api.updateTenant(id, body as never);
      detail.reload();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  if (!detail.data) return <Loader label="Loading" />;

  const workspace = detail.data;
  const tier = (tiers.data ?? []).find((one) => one.key === workspace.plan);
  const included = new Set(tier?.includedModules ?? []);
  const extras = workspace.modules ?? [];

  const priceOf = (module: string) =>
    (prices.data ?? []).find((one) => one.moduleKey === module)?.monthlyPrice ?? 0;

  const bill = tier
    ? billFor(
        {
          key: tier.key,
          label: tier.label,
          blurb: '',
          monthlyPrice: tier.monthlyPrice,
          includedModules: tier.includedModules as ModuleKey[],
        },
        extras,
        Object.fromEntries((prices.data ?? []).map((one) => [one.moduleKey, one.monthlyPrice])),
      )
    : null;

  const addOnTotal = (bill?.lines ?? [])
    .filter((line) => line.kind !== 'tier')
    .reduce((sum, line) => sum + line.amount, 0);

  /*
   * Grant or take away one module.
   *
   * A module inside the tier is not edited here: that is a decision about
   * everybody on that tier, and it belongs on the tier. What this edits is the
   * exception recorded against this one workspace.
   */
  const toggleExtra = (module: ModuleKey) => {
    const next = extras.includes(module)
      ? extras.filter((one) => one !== module)
      : [...extras, module];
    void save({ modules: next });
  };

  return (
    <div className="shell-page">
      <PageHead
        title={workspace.name}
        subtitle={`${workspace.slug} · ${
          workspace.isolation === 'DEDICATED' ? 'their own database' : 'shared database'
        }`}
        action={
          <div className="row">
            <Button
              title="Workspaces"
              variant="ghost"
              onClick={() => router.push('/platform/tenants')}
            />
            {can('platform.impersonate') ? (
              <Button title="Open their workspace" variant="dark" onClick={() => setOpenFor(true)} />
            ) : null}
          </div>
        }
      />

      {workspace.unreachable ? (
        <Card>
          <span className="t-small danger">
            Their database could not be reached, so their people and roles are not shown. What is
            on this page came from ours.
          </span>
        </Card>
      ) : null}

      <div className="grid-3">
        <Card tone="accent">
          <span className="t-label on-accent" style={{ opacity: 0.75 }}>
            Billed monthly
          </span>
          <div className="t-display on-accent">{formatInr(bill?.monthlyTotal ?? 0)}</div>
          <div className="t-tiny on-accent" style={{ opacity: 0.75 }}>
            {tier ? `${tier.label} ${formatInr(tier.monthlyPrice)}` : 'No tier'}
            {addOnTotal ? ` + add-ons ${formatInr(addOnTotal)}` : ''}
          </div>
        </Card>
        <Card>
          <span className="t-label faint">In the workspace</span>
          <div className="t-h1">{workspace.counts?.users ?? 0}</div>
          <div className="t-tiny faint">
            {workspace.counts?.orders ?? 0} orders · {workspace.counts?.clients ?? 0} clients
          </div>
        </Card>
        <Card>
          <span className="t-label faint">Last fortnight</span>
          <div className="t-h1">{workspace.health?.writes ?? 0}</div>
          <div className="t-tiny faint">
            changes · {workspace.health?.failures ?? 0} failures ·{' '}
            {workspace.health?.clientErrors ?? 0} app errors
          </div>
        </Card>
      </div>

      <SectionHead title="What they are on" />
      <Card>
        <span className="field-label">Tier</span>
        <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
          {(tiers.data ?? []).map((one) => (
            <Chip
              key={one.key}
              label={`${one.label} · ${formatInr(one.monthlyPrice)}`}
              selected={workspace.plan === one.key}
              onClick={mayManage ? () => void save({ plan: one.key }) : undefined}
            />
          ))}
        </div>

        <span className="field-label">Status</span>
        <div className="wrap">
          {(['ACTIVE', 'TRIAL', 'SUSPENDED'] as const).map((status) => (
            <Chip
              key={status}
              label={status.toLowerCase()}
              selected={workspace.status === status}
              onClick={mayManage ? () => void save({ status }) : undefined}
            />
          ))}
        </div>
      </Card>

      <SectionHead title="Modules" />
      <p className="t-tiny faint">What the tier includes, and anything granted on top of it.</p>
      <div className="stack">
        {MODULE_CATALOGUE.map((module) => {
          const core = (CORE_MODULES as readonly string[]).includes(module.key);
          const inTier = included.has(module.key);
          const extra = extras.includes(module.key);
          const on = core || inTier || extra;

          return (
            <Card key={module.key} testId={`module-${module.key}`}>
              <div className="row-between">
                <div style={{ minWidth: 0 }}>
                  <div className="t-small bold">{module.label}</div>
                  <div className="t-tiny faint">{module.blurb}</div>
                </div>
                <div className="row">
                  {core ? (
                    <Pill label="core" color="var(--faint)" />
                  ) : inTier ? (
                    <Pill label="in the tier" color="var(--accent)" />
                  ) : extra ? (
                    <Pill label={`add-on ${formatInr(priceOf(module.key))}`} color="var(--info)" />
                  ) : null}
                  <Chip
                    label={on ? 'on' : 'off'}
                    selected={on}
                    /*
                     * The core and the tier's own modules are not this
                     * workspace's to change: one is in every product, the
                     * other is a decision about everybody on that tier.
                     */
                    onClick={
                      mayManage && !core && !inTier
                        ? () => toggleExtra(module.key as ModuleKey)
                        : undefined
                    }
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <SectionHead title="Their people" />
      <p className="t-tiny faint">
        Read only. Changing somebody&rsquo;s role is done by opening their workspace, under your
        own name, in their own audit trail.
      </p>
      <div className="stack">
        {(workspace.users ?? []).map((person) => (
          <Card key={person.id}>
            <div className="row-between">
              <div style={{ minWidth: 0 }}>
                <div className="t-small bold">{person.name}</div>
                <div className="t-tiny faint">
                  {person.code} · {person.roleRef?.name ?? 'no role'}
                </div>
              </div>
              {person.isActive ? null : <Pill label="switched off" color="var(--faint)" />}
            </div>
          </Card>
        ))}
        {(workspace.users ?? []).length === 0 ? (
          <Card>
            <span className="t-small faint">Nobody has been added to this workspace yet.</span>
          </Card>
        ) : null}
      </div>

      <SectionHead title="Their roles" />
      <div className="stack">
        {(workspace.roles ?? []).map((role) => (
          <Card key={role.id}>
            <div className="row-between">
              <div style={{ minWidth: 0 }}>
                <div className="t-small bold">{role.name}</div>
                <div className="t-tiny faint">
                  {role.permissions.length} permissions · {role._count?.users ?? 0}{' '}
                  {(role._count?.users ?? 0) === 1 ? 'person' : 'people'}
                </div>
              </div>
              {role.isSystem ? <Pill label="seeded" color="var(--faint)" /> : null}
            </div>
          </Card>
        ))}
      </div>

      {failed ? <p className="t-small danger">{failed}</p> : null}
      {busy ? <p className="t-tiny faint">Saving…</p> : null}

      <Sheet
        open={openFor}
        title={`Open ${workspace.name}`}
        subtitle="You will be working as their administrator, under your own name"
        onClose={() => setOpenFor(false)}>
        <Field
          label="Why"
          value={reason}
          onChange={setReason}
          hint="Written into their own audit trail. They can see we were here."
        />
        <Button
          title="Open their workspace"
          block
          disabled={reason.trim().length < 4}
          onClick={async () => {
            await openWorkspace(workspace.id, reason.trim());
            router.push('/');
          }}
        />
      </Sheet>
    </div>
  );
}
