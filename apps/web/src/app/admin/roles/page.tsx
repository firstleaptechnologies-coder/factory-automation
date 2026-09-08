'use client';

import { useState } from 'react';
import type { WorkspaceRole, WorkspaceUser } from '@decor/shared';
import { PERMISSIONS, PERMISSION_GROUPS, PERMISSION_LABELS } from '@decor/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { Button, Card, Chip, Field, Loader, PageHead, Pill, SectionHead, Sheet } from '@/ui';
import { Select } from '@/ui/Select';

export default function RolesPage() {
  return (
    <Shell>
      <Roles />
    </Shell>
  );
}

/**
 * Who may do what here.
 *
 * The seeded roles are a starting point, not a fixed set: a shop with a
 * separate accountant, or one where the same person does sales and dispatch,
 * should be able to say so without asking us. The permissions are grouped the
 * way the product is, so the list reads as a description of the shop rather
 * than as a list of strings.
 */
function Roles() {
  const { can } = useAuth();
  const roles = useApi<WorkspaceRole[]>(() => api.roles(), []);
  const users = useApi<WorkspaceUser[]>(() => api.users(), []);

  const [editing, setEditing] = useState<WorkspaceRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [granted, setGranted] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = can(PERMISSIONS.ROLE_MANAGE);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      roles.reload();
      users.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const openRole = (role: WorkspaceRole | null) => {
    setEditing(role);
    setCreating(role === null);
    setName(role?.name ?? '');
    setGranted(role?.permissions ?? []);
    setError(null);
  };

  const closeRole = () => {
    setEditing(null);
    setCreating(false);
  };

  const toggle = (permission: string) =>
    setGranted((current) =>
      current.includes(permission)
        ? current.filter((one) => one !== permission)
        : [...current, permission],
    );

  if (roles.loading) return <Loader />;

  return (
    <>
      <PageHead
        title="Roles and people"
        subtitle="Who may do what here"
        action={
          canManage ? (
            <Button title="New role" icon="plus" onClick={() => openRole(null)} />
          ) : null
        }
      />

      <Card size="sm" className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Role</th>
              <th className="num">Permissions</th>
              <th className="num">People</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(roles.data ?? []).map((role) => (
              <tr
                key={role.id}
                style={{ cursor: canManage ? 'pointer' : 'default' }}
                onClick={canManage ? () => openRole(role) : undefined}>
                <td className="bold">
                  {role.name}
                  {role.description ? (
                    <div className="t-tiny faint">{role.description}</div>
                  ) : null}
                </td>
                <td className="num muted">{role.permissions.length}</td>
                <td className="num muted">{role._count?.users ?? 0}</td>
                <td>{role.isSystem ? <Pill label="Seeded" color="var(--text-faint)" /> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <SectionHead title="People" />
      <Card size="sm" className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Role</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(users.data ?? []).map((user) => (
              <tr key={user.id}>
                <td className="bold">{user.name}</td>
                <td className="muted">{user.code}</td>
                <td style={{ minWidth: 200 }}>
                  {canManage ? (
                    <Select
                      value={user.roleId ?? ''}
                      options={[
                        { value: '', label: 'No role' },
                        ...(roles.data ?? []).map((role) => ({
                          value: role.id,
                          label: role.name,
                        })),
                      ]}
                      onChange={(value) =>
                        run(() => api.assignRole(user.id, value || null))
                      }
                    />
                  ) : (
                    <span className="muted">{user.roleRef?.name ?? 'No role'}</span>
                  )}
                </td>
                <td>
                  {user.isActive ? null : (
                    <Pill label="Switched off" color="var(--text-faint)" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Sheet
        open={Boolean(editing) || creating}
        title={creating ? 'New role' : (editing?.name ?? '')}
        subtitle="Tick what this kind of person may do"
        onClose={closeRole}>
        <Field label="Called" value={name} onChange={setName} />
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: 'var(--s-md)' }}>
            <div className="t-label muted">{group.label}</div>
            <div className="row" style={{ marginTop: 'var(--s-sm)' }}>
              {group.permissions.map((permission) => (
                <Chip
                  key={permission}
                  label={PERMISSION_LABELS[permission] ?? permission}
                  selected={granted.includes(permission)}
                  onClick={() => toggle(permission)}
                />
              ))}
            </div>
          </div>
        ))}
        {error ? (
          <div className="t-small" style={{ color: 'var(--danger)', marginBottom: 'var(--s-md)' }}>
            {error}
          </div>
        ) : null}
        <Button
          title="Save"
          block
          loading={busy}
          disabled={name.trim().length < 2}
          onClick={() =>
            run(async () => {
              const body = { name: name.trim(), permissions: granted };
              if (editing) await api.updateRole(editing.id, body);
              else await api.createRole(body);
              closeRole();
            })
          }
        />
        {editing && !editing.isSystem ? (
          <Button
            title="Remove this role"
            block
            variant="danger"
            loading={busy}
            onClick={() =>
              run(async () => {
                await api.deleteRole(editing.id);
                closeRole();
              })
            }
          />
        ) : null}
      </Sheet>
    </>
  );
}
