import { UnauthorizedException } from '@nestjs/common';
import { TenantIsolation } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { prismaMock } from '../../../test/prisma-mock';

const TENANT = {
  tenantId: 'tenant-a',
  slug: 'decorbucket',
  isolation: TenantIsolation.SHARED,
};

const PASSWORD = 'admin123';

async function build(user: unknown, tenant: unknown = TENANT) {
  const db = prismaMock() as never as Record<string, Record<string, jest.Mock>>;
  db.user.findFirst = jest.fn(async () => user);

  const tenants = {
    bySlugOrThrow: jest.fn(async (slug: string) => {
      if (!tenant) throw new UnauthorizedException('No workspace');
      return tenant;
    }),
    byIdOrThrow: jest.fn(async () => tenant),
  };
  const jwt = {
    signAsync: jest.fn(async (..._args: unknown[]) => 'signed-token'),
  };

  return {
    service: new AuthService(db as never, jwt as never, tenants as never),
    db,
    tenants,
    jwt,
  };
}

async function activeUser(over: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    code: 'ADMIN',
    name: 'Administrator',
    role: 'ADMIN',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    roleRef: { name: 'Owner', permissions: ['order.view', 'order.punch'] },
    ...over,
  };
}

describe('login', () => {
  it('returns a token and the user’s permissions', async () => {
    const { service, jwt } = await build(await activeUser());
    const result = await service.login({
      workspace: 'decorbucket',
      identifier: 'ADMIN',
      password: PASSWORD,
    } as never);

    expect(result.accessToken).toBe('signed-token');
    expect(result.user.name).toBe('Administrator');
    expect(result.user.roleName).toBe('Owner');
    expect(result.user.permissions).toContain('order.punch');
    expect(result.workspace).toEqual({ slug: 'decorbucket', tenantId: 'tenant-a' });
    // The token carries the tenant, so a caller cannot choose it by header.
    expect(jwt.signAsync.mock.calls[0][0]).toMatchObject({ tenantId: 'tenant-a' });
  });

  it('resolves the workspace before the user', async () => {
    // Doing it in this order is what stops a wrong workspace matching a user
    // from another one — "ADMIN" exists in every shop.
    const { service, tenants, db } = await build(await activeUser());
    await service.login({
      workspace: 'decorbucket',
      identifier: 'ADMIN',
      password: PASSWORD,
    } as never);
    expect(tenants.bySlugOrThrow).toHaveBeenCalledWith('decorbucket');
    expect(db.user.findFirst).toHaveBeenCalled();
  });

  it('gives one message for a bad code and a bad password', async () => {
    // Telling them which was wrong tells an attacker which codes exist.
    const missing = await build(null);
    await expect(
      missing.service.login({
        workspace: 'decorbucket',
        identifier: 'NOBODY',
        password: PASSWORD,
      } as never),
    ).rejects.toThrow('Wrong workspace, code or password');

    const wrongPassword = await build(await activeUser());
    await expect(
      wrongPassword.service.login({
        workspace: 'decorbucket',
        identifier: 'ADMIN',
        password: 'not-it',
      } as never),
    ).rejects.toThrow('Wrong workspace, code or password');
  });

  it('accepts a code, an email or a phone number', async () => {
    const { service, db } = await build(await activeUser());
    await service.login({
      workspace: 'decorbucket',
      identifier: '  admin@shop.test  ',
      password: PASSWORD,
    } as never);

    const where = db.user.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { code: 'ADMIN@SHOP.TEST' },
      { email: 'admin@shop.test' },
      { phone: 'admin@shop.test' },
    ]);
    // Only active users can sign in.
    expect(where.isActive).toBe(true);
  });

  it('never puts the password hash in the response', async () => {
    const { service } = await build(await activeUser());
    const result = await service.login({
      workspace: 'decorbucket',
      identifier: 'ADMIN',
      password: PASSWORD,
    } as never);
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toContain('$2');
  });

  it('falls back to the role code when a role has no name', async () => {
    const { service } = await build(await activeUser({ roleRef: null }));
    const result = await service.login({
      workspace: 'decorbucket',
      identifier: 'ADMIN',
      password: PASSWORD,
    } as never);
    expect(result.user.roleName).toBe('ADMIN');
    expect(result.user.permissions).toEqual([]);
  });
});

describe('lookupWorkspace', () => {
  it('confirms a workspace before a password is asked for', async () => {
    const { service } = await build(null);
    await expect(service.lookupWorkspace('  decorbucket ')).resolves.toEqual({
      slug: 'decorbucket',
      exists: true,
    });
  });

  it('refuses a workspace that does not exist', async () => {
    const { service } = await build(null, null);
    await expect(service.lookupWorkspace('nope')).rejects.toThrow();
  });
});

describe('me', () => {
  it('reads the name fresh from the database, not from the token', async () => {
    // A rename must show up without the user signing in again — and the token
    // deliberately carries only an id, a role and permissions.
    const { service, db } = await build(null);
    db.user.findFirst = jest.fn(async () => ({
      id: 'user-1',
      code: 'ADMIN',
      name: 'Renamed Person',
      role: 'ADMIN',
      roleRef: { name: 'Owner' },
    }));

    const result = (await service.me({
      id: 'user-1',
      code: 'ADMIN',
      role: 'ADMIN',
      permissions: ['order.view'],
    } as never)) as Record<string, unknown>;

    expect(result.name).toBe('Renamed Person');
    expect(result.roleName).toBe('Owner');
    // Permissions still come from the token, which is what authorises the call.
    expect(result.permissions).toEqual(['order.view']);
  });

  it('reads a platform admin from the control plane instead', async () => {
    const { service, db } = await build(null);
    db.platformUser.findUnique = jest.fn(async () => ({
      id: 'p1',
      name: 'Platform Admin',
      email: 'ops@example.com',
    }));

    const result = (await service.me({ id: 'p1', isPlatform: true } as never)) as Record<
      string,
      unknown
    >;
    expect(result.name).toBe('Platform Admin');
    expect(result.email).toBe('ops@example.com');
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });
});

/**
 * What signing in hands back.
 *
 * The identity the guard builds carries the whole tenant context, and that
 * context carries a dedicated workspace's decrypted database connection string.
 * Anything that spreads it leaks the keys to a business's entire database to
 * every person signed into it.
 */
describe('what /auth/me returns', () => {
  const identity = {
    id: 'u1',
    code: 'ADMIN',
    role: 'ADMIN',
    permissions: ['order.view'],
    tenant: {
      tenantId: 't1',
      slug: 'decorbucket',
      isolation: 'SHARED',
      databaseUrl: 'postgresql://user:secret@elsewhere/db',
      modules: ['orders', 'clients'],
    },
  };

  function build() {
    const db = prismaMock() as never as Record<string, Record<string, jest.Mock>>;
    db.user.findFirst = jest.fn(async () => ({
      id: 'u1',
      code: 'ADMIN',
      name: 'Administrator',
      role: 'ADMIN',
      roleRef: { name: 'Owner' },
    }));
    return new AuthService(db as never, {} as never, {} as never);
  }

  it('never hands out the workspace’s connection string', async () => {
    const me = (await build().me(identity as never)) as Record<string, unknown>;
    expect(JSON.stringify(me)).not.toContain('secret@elsewhere');
    expect(me).not.toHaveProperty('tenant');
  });

  it('says which workspace it is, and what they have bought', async () => {
    const me = (await build().me(identity as never)) as Record<string, unknown>;
    expect(me.workspace).toEqual({
      slug: 'decorbucket',
      tenantId: 't1',
      modules: ['orders', 'clients'],
    });
  });

  it('reads the name fresh, so renaming somebody shows up at once', async () => {
    const me = (await build().me(identity as never)) as Record<string, unknown>;
    expect(me.name).toBe('Administrator');
    expect(me.roleName).toBe('Owner');
  });
});
