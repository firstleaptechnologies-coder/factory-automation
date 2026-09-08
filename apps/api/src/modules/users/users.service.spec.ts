import { NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  return { service: new UsersService(db as never), db };
}

/** Every read must project — a password hash must never leave this service. */
function selectedFields(call: { select: Record<string, boolean> }) {
  return Object.keys(call.select);
}

describe('list', () => {
  it('never selects the password hash', async () => {
    const { service, db } = build();
    await service.list();
    expect(selectedFields(db.user.findMany.mock.calls[0][0])).not.toContain('passwordHash');
  });

  it('puts active users first, then alphabetically', async () => {
    const { service, db } = build();
    await service.list();
    expect(db.user.findMany.mock.calls[0][0].orderBy).toEqual([
      { isActive: 'desc' },
      { name: 'asc' },
    ]);
  });
});

describe('findOne', () => {
  it('reports a missing user', async () => {
    const { service } = build();
    await expect(service.findOne('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('projects away the hash', async () => {
    const { service, db } = build();
    db.user.findUnique = jest.fn(async () => ({ id: 'u1' }));
    await service.findOne('u1');
    expect(selectedFields(db.user.findUnique.mock.calls[0][0])).not.toContain('passwordHash');
  });
});

describe('create', () => {
  it('hashes the password and never stores the plaintext', async () => {
    const { service, db } = build();
    await inTenant(() =>
      service.create({ name: 'Ravi', code: 'RAVI', password: 'secret123' } as never),
    );
    const data = db.user.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('password');
    expect(data.passwordHash).not.toBe('secret123');
    await expect(bcrypt.compare('secret123', data.passwordHash)).resolves.toBe(true);
  });

  it('stamps the tenant', async () => {
    const { service, db } = build();
    await inTenant(() => service.create({ name: 'Ravi', password: 'x' } as never));
    expect(db.user.create.mock.calls[0][0].data.tenantId).toBe('tenant-test');
  });

  it('returns the projected user, not the row', async () => {
    const { service, db } = build();
    await inTenant(() => service.create({ name: 'Ravi', password: 'x' } as never));
    expect(selectedFields(db.user.create.mock.calls[0][0])).not.toContain('passwordHash');
  });
});

describe('update', () => {
  it('refuses an unknown user before writing', async () => {
    const { service, db } = build();
    await expect(service.update('ghost', {} as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe('changePassword', () => {
  it('refuses an unknown user', async () => {
    const { service } = build();
    await expect(
      service.changePassword('ghost', { password: 'x' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('replaces the hash and nothing else', async () => {
    const { service, db } = build();
    db.user.findUnique = jest.fn(async () => ({ id: 'u1' }));
    await service.changePassword('u1', { password: 'newpass' } as never);
    const data = db.user.update.mock.calls[0][0].data;
    expect(Object.keys(data)).toEqual(['passwordHash']);
    await expect(bcrypt.compare('newpass', data.passwordHash)).resolves.toBe(true);
  });

  it('produces a different hash each time, so the salt is real', async () => {
    const { service, db } = build();
    db.user.findUnique = jest.fn(async () => ({ id: 'u1' }));
    await service.changePassword('u1', { password: 'same' } as never);
    await service.changePassword('u1', { password: 'same' } as never);
    const [a, b] = db.user.update.mock.calls.map((c) => c[0].data.passwordHash);
    expect(a).not.toBe(b);
  });
});
