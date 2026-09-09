import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlatformStaffService } from './staff.service';

const OWNER_ROLE = {
  key: 'OWNER',
  name: 'Owner',
  blurb: '',
  permissions: ['platform.tenant.view', 'platform.staff.manage'],
  isSystem: true,
};
const SUPPORT_ROLE = {
  key: 'SUPPORT',
  name: 'Support',
  blurb: '',
  permissions: ['platform.tenant.view'],
  isSystem: true,
};

const ME = { id: 'me', role: 'OWNER', isActive: true, name: 'Nakul' };
const DEV = { id: 'dev', role: 'SUPPORT', isActive: true, name: 'Dev' };

/** What a Prisma write was asked to do, as the test wants to read it. */
const wrote = (mock: jest.Mock): Record<string, never> =>
  (mock.mock.calls[0]?.[0] as { data: Record<string, never> })?.data;

function build(roles = [OWNER_ROLE, SUPPORT_ROLE], staff = [ME, DEV]) {
  const byKey = new Map(roles.map((one) => [one.key, one]));
  const byId = new Map(staff.map((one) => [one.id, one]));

  const db = {
    platformRole: {
      findUnique: jest.fn(async ({ where }: never) => byKey.get((where as never as { key: string }).key) ?? null),
      findMany: jest.fn(async () => roles),
      upsert: jest.fn(async () => OWNER_ROLE),
      update: jest.fn(async ({ data }: never) => ({ ...OWNER_ROLE, ...(data as object) })),
      create: jest.fn(async ({ data }: never) => data),
      delete: jest.fn(async () => ({ key: 'gone' })),
    },
    platformUser: {
      findUnique: jest.fn(async ({ where }: never) => {
        const w = where as never as { id?: string; email?: string };
        return w.id ? (byId.get(w.id) ?? null) : null;
      }),
      findMany: jest.fn(async ({ where }: never) => {
        const w = (where ?? {}) as never as { role?: { not?: string }; isActive?: boolean };
        return staff.filter(
          (one) =>
            (w.isActive === undefined || one.isActive === w.isActive) &&
            (w.role?.not === undefined || one.role !== w.role.not),
        );
      }),
      count: jest.fn(async () => 0),
      create: jest.fn(async ({ data }: never) => data),
      update: jest.fn(async ({ data }: never) => data),
    },
  };

  return { service: new PlatformStaffService({ platform: db } as never), db };
}

describe('editing a role', () => {
  it('says so when there is no such role', async () => {
    const { service } = build();
    await expect(
      service.saveRole('GHOST', { permissions: [] }, 'me'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /*
   * A tenant permission on a platform role grants nothing — a platform user is
   * inside nobody's workspace — but it would read on the screen as if it did.
   */
  it('keeps only the platform permissions', async () => {
    const { service, db } = build();
    await service.saveRole(
      'SUPPORT',
      { permissions: ['platform.tenant.view', 'order.view', 'payment.record'] },
      'me',
    );

    expect(wrote(db.platformRole.update).permissions).toEqual([
      'platform.tenant.view',
    ]);
  });

  it('drops a permission listed twice', async () => {
    const { service, db } = build();
    await service.saveRole(
      'SUPPORT',
      { permissions: ['platform.tenant.view', 'platform.tenant.view'] },
      'me',
    );

    expect(wrote(db.platformRole.update).permissions).toEqual([
      'platform.tenant.view',
    ]);
  });
});

/*
 * The rails. There is no support desk above us: a save that locks everybody
 * out of the platform cannot be undone by anybody, and no amount of care in a
 * browser prevents it.
 */
describe('refusing to lock us out', () => {
  it('refuses to take staff management off the role you are on', async () => {
    const { service } = build();

    await expect(
      service.saveRole('OWNER', { permissions: ['platform.tenant.view'] }, 'me'),
    ).rejects.toThrow(/would lock you out/);
  });

  it('refuses to take it off the last role that has it', async () => {
    // Nobody is on OWNER; the only person left is on SUPPORT, which does not
    // have it either.
    const { service } = build(
      [OWNER_ROLE, SUPPORT_ROLE],
      [{ id: 'dev', role: 'OWNER', isActive: true, name: 'Dev' }],
    );

    await expect(
      service.saveRole('OWNER', { permissions: ['platform.tenant.view'] }, 'nobody'),
    ).rejects.toThrow(/nobody able to manage staff/);
  });

  it('allows it while somebody else can still do it', async () => {
    const { service, db } = build(
      [OWNER_ROLE, { ...SUPPORT_ROLE, permissions: ['platform.staff.manage'] }],
      [ME, DEV],
    );

    await service.saveRole('OWNER', { permissions: ['platform.tenant.view'] }, 'nobody');

    expect(db.platformRole.update).toHaveBeenCalled();
  });

  it('refuses to let you switch yourself off', async () => {
    const { service } = build();

    await expect(service.saveStaff('me', { isActive: false }, 'me')).rejects.toThrow(
      /cannot switch yourself off/,
    );
  });

  it('refuses to let you move yourself onto a role that cannot manage staff', async () => {
    const { service } = build();

    await expect(service.saveStaff('me', { role: 'SUPPORT' }, 'me')).rejects.toThrow(
      /would lock you out/,
    );
  });

  // The check runs before the write. One that throws after the row is saved
  // has described the lock-out rather than prevented it.
  it('refuses to switch off the last person who can manage staff', async () => {
    const { service, db } = build([OWNER_ROLE, SUPPORT_ROLE], [ME]);

    await expect(service.saveStaff('me', { isActive: false }, 'somebody')).rejects.toThrow(
      /nobody able to manage staff/,
    );
    expect(db.platformUser.update).not.toHaveBeenCalled();
  });

  it('lets somebody else be switched off', async () => {
    const { service, db } = build();

    await service.saveStaff('dev', { isActive: false }, 'me');

    expect(db.platformUser.update).toHaveBeenCalled();
  });
});

describe('a role we wrote ourselves', () => {
  it('settles the key rather than taking it as typed', async () => {
    const { service, db } = build();
    await service.createRole({ key: ' on call ', name: 'On call', permissions: [] });

    expect(wrote(db.platformRole.create).key).toBe('ON_CALL');
  });

  it('refuses a key already in use', async () => {
    const { service } = build();
    await expect(
      service.createRole({ key: 'OWNER', name: 'Owner two', permissions: [] }),
    ).rejects.toThrow(/already exists/);
  });

  // The seeded roles are what a session falls back to when a row has gone.
  // Removing one turns a missing row into a guess.
  it('refuses to remove a seeded role', async () => {
    const { service } = build();
    await expect(service.deleteRole('OWNER')).rejects.toThrow(/seeded role cannot be removed/);
  });

  it('refuses to remove one somebody is still on', async () => {
    const { service, db } = build([{ ...SUPPORT_ROLE, key: 'ONCALL', isSystem: false }], []);
    db.platformUser.count = jest.fn(async () => 1);

    await expect(service.deleteRole('ONCALL')).rejects.toThrow(/still on this role/);
  });
});

describe('what a role holds', () => {
  it('reads it from the row', async () => {
    const { service } = build();

    await expect(service.permissionsFor('SUPPORT')).resolves.toEqual([
      'platform.tenant.view',
    ]);
  });

  // Never nothing, and never everything.
  it('falls back to the seeded definition when the row has gone', async () => {
    const { service } = build([]);

    await expect(service.permissionsFor('SUPPORT')).resolves.toContain('platform.impersonate');
  });

  it('gives an unknown role the least', async () => {
    const { service } = build([]);

    await expect(service.permissionsFor('WHO')).resolves.toEqual(['platform.tenant.view']);
  });
});

describe('adding a colleague', () => {
  it('refuses a role that does not exist', async () => {
    const { service } = build();
    await expect(
      service.createStaff({ email: 'a@b.in', name: 'A', role: 'GHOST', password: 'longenough' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('settles the address so two people cannot differ by case alone', async () => {
    const { service, db } = build();
    await service.createStaff({
      email: '  Asha@FirstLeap.IN ',
      name: 'Asha',
      role: 'SUPPORT',
      password: 'longenough',
    });

    expect(wrote(db.platformUser.create).email).toBe('asha@firstleap.in');
  });

  it('never stores the password as it was typed', async () => {
    const { service, db } = build();
    await service.createStaff({
      email: 'asha@firstleap.in',
      name: 'Asha',
      role: 'SUPPORT',
      password: 'longenough',
    });

    const written = wrote(db.platformUser.create);
    expect(written.passwordHash).not.toBe('longenough');
    expect(written.passwordHash).toMatch(/^\$2[aby]\$/);
  });
});
