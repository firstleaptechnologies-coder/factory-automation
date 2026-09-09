import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PERMISSIONS } from '@fas/shared';
import { RolesService, codeFor } from './roles.service';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  db.role.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'r9',
    ...data,
  }));
  db.role.update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'r1',
    ...data,
  }));
  // Somebody else can still manage roles, unless a test says otherwise.
  db.role.count = jest.fn(async () => 1);
  return { service: new RolesService(db as never), db };
}

const role = (over: Record<string, unknown> = {}) => ({
  name: 'Accountant',
  permissions: [PERMISSIONS.PAYMENT_VIEW],
  ...over,
}) as never;

describe('writing a role', () => {
  it('derives a stable code from the name people read', () => {
    // The name may be changed; the code is what a seed or an import matches on.
    expect(codeFor('Shop accountant')).toBe('SHOP_ACCOUNTANT');
    expect(codeFor('  Site / dispatch  ')).toBe('SITE_DISPATCH');
  });

  it('refuses a second role with the same name', async () => {
    const { service, db } = build();
    db.role.findFirst = jest.fn(async () => ({ id: 'r1' }));
    await expect(inTenant(() => service.create(role()))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('saves the permissions it was given', async () => {
    const { service, db } = build();
    db.role.findFirst = jest.fn(async () => null);
    await inTenant(() => service.create(role()));
    expect(db.role.create.mock.calls[0][0].data).toMatchObject({
      code: 'ACCOUNTANT',
      permissions: [PERMISSIONS.PAYMENT_VIEW],
    });
  });
});

describe('not locking everybody out', () => {
  it('refuses to take role management off the last role that has it', async () => {
    const { service, db } = build();
    db.role.findFirst = jest.fn(async () => ({ id: 'r1', isSystem: true }));
    db.role.count = jest.fn(async () => 0);
    // A shop tidying its Owner role and unticking one box would lock every one
    // of them out, and the way back is somebody with database access.
    await expect(
      service.update('r1', role({ permissions: [PERMISSIONS.ORDER_VIEW] })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows it when another role can still manage them', async () => {
    const { service, db } = build();
    db.role.findFirst = jest.fn(async () => ({ id: 'r1', isSystem: false }));
    db.role.count = jest.fn(async () => 1);
    await expect(
      service.update('r1', role({ permissions: [PERMISSIONS.ORDER_VIEW] })),
    ).resolves.toMatchObject({ id: 'r1' });
  });

  it('counts only roles somebody active is actually on', async () => {
    const { service, db } = build();
    db.role.findFirst = jest.fn(async () => ({ id: 'r1' }));
    await service.update('r1', role({ permissions: [] }));
    // A role with the permission and nobody on it locks the shop out just the
    // same.
    expect(db.role.count.mock.calls[0][0].where).toMatchObject({
      users: { some: { isActive: true } },
    });
  });

  it('does not ask at all when the role keeps the permission', async () => {
    const { service, db } = build();
    db.role.findFirst = jest.fn(async () => ({ id: 'r1' }));
    await service.update('r1', role({ permissions: [PERMISSIONS.ROLE_MANAGE] }));
    expect(db.role.count).not.toHaveBeenCalled();
  });
});

describe('removing one', () => {
  it('will not remove a role the workspace was set up with', async () => {
    const { service, db } = build();
    db.role.findFirst = jest.fn(async () => ({
      id: 'r1',
      isSystem: true,
      _count: { users: 0 },
    }));
    // Editable, because a shop may want its Sales to see payouts. Not
    // removable, because provisioning expects it.
    await expect(service.remove('r1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('will not remove one people are still on', async () => {
    const { service, db } = build();
    db.role.findFirst = jest.fn(async () => ({
      id: 'r1',
      isSystem: false,
      _count: { users: 3 },
    }));
    await expect(service.remove('r1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes an empty one the shop wrote itself', async () => {
    const { service, db } = build();
    db.role.findFirst = jest.fn(async () => ({
      id: 'r1',
      isSystem: false,
      _count: { users: 0 },
    }));
    await expect(service.remove('r1')).resolves.toEqual({ id: 'r1' });
    expect(db.role.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });
});

describe('putting somebody on a role', () => {
  it('assigns it', async () => {
    const { service, db } = build();
    db.user.findFirst = jest.fn(async () => ({ id: 'u1' }));
    db.role.findFirst = jest.fn(async () => ({ id: 'r1' }));
    await service.assign('u1', { roleId: 'r1' });
    expect(db.user.update.mock.calls[0][0].data).toEqual({ roleId: 'r1' });
  });

  it('takes it away when none is given', async () => {
    const { service, db } = build();
    db.user.findFirst = jest.fn(async () => ({ id: 'u1' }));
    await service.assign('u1', {});
    expect(db.user.update.mock.calls[0][0].data).toEqual({ roleId: null });
  });

  it('refuses a role that does not exist', async () => {
    const { service, db } = build();
    db.user.findFirst = jest.fn(async () => ({ id: 'u1' }));
    db.role.findFirst = jest.fn(async () => null);
    await expect(service.assign('u1', { roleId: 'ghost' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses a person who does not exist', async () => {
    const { service, db } = build();
    db.user.findFirst = jest.fn(async () => null);
    await expect(service.assign('ghost', { roleId: 'r1' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
