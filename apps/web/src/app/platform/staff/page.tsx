'use client';

import { useState } from 'react';
import { PLATFORM_PERMISSION_TREE } from '@fas/shared';
import { api } from '@/lib/api';
import { useApi } from '@/lib/useApi';
import { useAuth } from '@/lib/auth';
import { PermissionTree } from '@/app/admin/roles/PermissionTree';
import { Button, Card, Chip, Field, Loader, PageHead, Pill, SectionHead, Sheet } from '@/ui';

interface PlatformRole {
  id: string;
  key: string;
  name: string;
  blurb: string;
  permissions: string[];
  isSystem: boolean;
  people: number;
}

interface Staff {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
}

/**
 * Who at FirstLeap may do what.
 *
 * The four roles used to be constants in shared code, which made the shape of
 * the company a release. They are rows now, edited here, on the same tree the
 * shops use for their own — one screen, not two that drift.
 *
 * The API refuses two things whatever this screen allows, because no amount of
 * care in a browser prevents them: a save that would leave nobody able to
 * manage staff, and somebody stripping their own ability to undo what they
 * just did. There is no support desk above us.
 */
export default function StaffPage() {
  const { can, user } = useAuth();
  const roles = useApi<PlatformRole[]>(() => api.platformRoles() as Promise<PlatformRole[]>, []);
  const staff = useApi<Staff[]>(() => api.platformStaff() as Promise<Staff[]>, []);

  const mayManage = can('platform.staff.manage');

  const [editing, setEditing] = useState<PlatformRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [granted, setGranted] = useState<string[]>([]);

  const [person, setPerson] = useState<Staff | null>(null);
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState({ name: '', email: '', role: '', password: '' });

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailed(null);
    try {
      await work();
      roles.reload();
      staff.reload();
      return true;
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'Could not save');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openRole = (role: PlatformRole | null) => {
    setEditing(role);
    setCreating(role === null);
    setName(role?.name ?? '');
    setKey('');
    setGranted(role?.permissions ?? []);
    setFailed(null);
  };

  const closeRole = () => {
    setEditing(null);
    setCreating(false);
  };

  const saveRole = async () => {
    const done = await run(async () => {
      if (creating) {
        await api.createPlatformRole({ key, name: name.trim(), permissions: granted });
      } else {
        await api.savePlatformRole(editing!.key, { name: name.trim(), permissions: granted });
      }
    });
    if (done) closeRole();
  };

  if (!roles.data) return <Loader label="Loading" />;

  const roleNamed = (roleKey: string) =>
    roles.data?.find((one) => one.key === roleKey)?.name ?? roleKey;

  return (
    <div className="shell-page">
      <PageHead
        title="Staff and roles"
        subtitle="Who at FirstLeap may do what, across every workspace we host"
        action={
          mayManage ? (
            <div className="row">
              <Button title="Invite" variant="dark" onClick={() => setInviting(true)} />
              <Button title="New role" onClick={() => openRole(null)} />
            </div>
          ) : null
        }
      />

      <SectionHead title="Roles" />
      <div className="stack">
        {roles.data.map((role) => (
          <Card key={role.id} onClick={mayManage ? () => openRole(role) : undefined}>
            <div className="row-between">
              <div style={{ minWidth: 0 }}>
                <div className="t-small bold">{role.name}</div>
                <div className="t-tiny faint">
                  {role.blurb || `${role.permissions.length} permissions`} · {role.people}{' '}
                  {role.people === 1 ? 'person' : 'people'}
                </div>
              </div>
              {role.isSystem ? <Pill label="seeded" color="var(--faint)" /> : null}
            </div>
          </Card>
        ))}
      </div>

      <SectionHead title="People" />
      <div className="stack">
        {(staff.data ?? []).map((one) => (
          <Card key={one.id} onClick={mayManage ? () => setPerson(one) : undefined}>
            <div className="row-between">
              <div style={{ minWidth: 0 }}>
                <div className="t-small bold">{one.name}</div>
                <div className="t-tiny faint">
                  {one.email} · {roleNamed(one.role)}
                </div>
              </div>
              <div className="row">
                {one.id === user?.id ? <Pill label="you" color="var(--accent)" /> : null}
                {one.isActive ? null : <Pill label="switched off" color="var(--faint)" />}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {failed ? <p className="t-small danger">{failed}</p> : null}

      <Sheet
        open={Boolean(editing) || creating}
        title={creating ? 'New role' : (editing?.name ?? '')}
        subtitle="Tick what this kind of colleague may do"
        onClose={closeRole}>
        <Field label="Called" value={name} onChange={setName} />
        {creating ? (
          <Field
            label="Key"
            value={key}
            onChange={setKey}
            hint="Stable. Sessions point at it by name, so it does not change afterwards."
          />
        ) : null}

        <PermissionTree
          granted={granted}
          sections={PLATFORM_PERMISSION_TREE}
          onChange={setGranted}
        />

        <Button
          title="Save"
          block
          loading={busy}
          disabled={name.trim().length < 2 || (creating && key.trim().length < 2)}
          onClick={saveRole}
        />
        {editing && !editing.isSystem ? (
          <Button
            title="Remove this role"
            variant="danger"
            loading={busy}
            onClick={async () => {
              const done = await run(() => api.deletePlatformRole(editing.key));
              if (done) closeRole();
            }}
          />
        ) : null}
      </Sheet>

      <Sheet
        open={Boolean(person)}
        title={person?.name ?? ''}
        subtitle={person?.email}
        onClose={() => setPerson(null)}>
        <span className="field-label">Role</span>
        <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
          {roles.data.map((role) => (
            <Chip
              key={role.key}
              label={role.name}
              selected={person?.role === role.key}
              onClick={() =>
                void run(async () => {
                  await api.savePlatformStaff(person!.id, { role: role.key });
                  setPerson(null);
                })
              }
            />
          ))}
        </div>

        <Button
          title={person?.isActive ? 'Switch this person off' : 'Switch this person back on'}
          variant={person?.isActive ? 'danger' : 'dark'}
          block
          loading={busy}
          onClick={() =>
            void run(async () => {
              await api.savePlatformStaff(person!.id, { isActive: !person!.isActive });
              setPerson(null);
            })
          }
        />
      </Sheet>

      <Sheet
        open={inviting}
        title="Invite a colleague"
        subtitle="They sign in above every workspace, not inside one"
        onClose={() => setInviting(false)}>
        <Field
          label="Name"
          value={invite.name}
          onChange={(value) => setInvite({ ...invite, name: value })}
        />
        <Field
          label="Email"
          value={invite.email}
          onChange={(value) => setInvite({ ...invite, email: value })}
        />
        <span className="field-label">Role</span>
        <div className="wrap" style={{ marginBottom: 'var(--s-lg)' }}>
          {roles.data.map((role) => (
            <Chip
              key={role.key}
              label={role.name}
              selected={invite.role === role.key}
              onClick={() => setInvite({ ...invite, role: role.key })}
            />
          ))}
        </div>
        <Field
          label="First password"
          type="password"
          value={invite.password}
          onChange={(value) => setInvite({ ...invite, password: value })}
          hint="At least eight characters. They change it once they are in."
        />
        <Button
          title="Add them"
          block
          loading={busy}
          disabled={
            invite.name.trim().length < 2 ||
            !invite.email.includes('@') ||
            !invite.role ||
            invite.password.length < 8
          }
          onClick={async () => {
            const done = await run(() => api.createPlatformStaff(invite));
            if (done) {
              setInviting(false);
              setInvite({ name: '', email: '', role: '', password: '' });
            }
          }}
        />
      </Sheet>
    </div>
  );
}
