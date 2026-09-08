import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

const TENANT = { id: 't1', slug: 'decorbucket', isolation: 'SHARED' };

const byIdOrThrow = jest.fn(async (..._args: unknown[]) => TENANT as unknown);

/** What the role allows now, which is what the strategy reads. */
const findFirst = jest.fn(async (..._args: unknown[]) => ({
  role: 'ADMIN',
  roleRef: { permissions: ['order.view', 'order.move_back'] },
}) as unknown);

/** The platform user behind a control-plane token, read live. */
const platformUser = jest.fn(async (..._args: unknown[]) => ({
  name: 'Nakul',
  role: 'SUPPORT',
  isActive: true,
}) as unknown);

const strategy = () =>
  new JwtStrategy(
    { get: () => 'test-secret' } as never,
    { byIdOrThrow } as never,
    {
      user: { findFirst },
      platform: { platformUser: { findUnique: platformUser } },
    } as never,
  );

beforeEach(() => {
  jest.clearAllMocks();
  byIdOrThrow.mockResolvedValue(TENANT);
  findFirst.mockResolvedValue({
    role: 'ADMIN',
    roleRef: { permissions: ['order.view', 'order.move_back'] },
  });
  platformUser.mockResolvedValue({ name: 'Nakul', role: 'SUPPORT', isActive: true });
});

const payload = (over: Partial<JwtPayload> = {}): JwtPayload => ({
  sub: 'u1',
  tenantId: 't1',
  code: 'ADMIN',
  role: 'ADMIN',
  permissions: ['order.view'],
  ...over,
});

it('resolves the tenant from the signed token, not from the request', async () => {
  const user = await strategy().validate(payload());
  // A caller editing a header must not be able to pick whose data they see.
  expect(byIdOrThrow).toHaveBeenCalledWith('t1');
  expect(user).toMatchObject({ id: 'u1', code: 'ADMIN', role: 'ADMIN', tenant: TENANT });
});

it('carries what the role allows now, not what the token was signed with', async () => {
  const user = await strategy().validate(payload());
  // A permission added in a release reached nobody already signed in: they
  // were refused a screen their role plainly granted them, with nothing to do
  // about it but sign out.
  expect(user.permissions).toEqual(['order.view', 'order.move_back']);
  expect(findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 'u1', isActive: true } }),
  );
});

it('drops a permission the moment the role loses it', async () => {
  findFirst.mockResolvedValue({ role: 'ADMIN', roleRef: { permissions: ['order.view'] } });
  const user = await strategy().validate(payload({ permissions: ['order.view', 'order.delete'] }));
  // Otherwise a permission taken away kept working until the token expired.
  expect(user.permissions).toEqual(['order.view']);
});

it('treats a user on no role as having no permissions', async () => {
  findFirst.mockResolvedValue({ role: 'SALES', roleRef: null });
  const user = await strategy().validate(payload());
  expect(user.permissions).toEqual([]);
});

it('stops a switched-off account working at once, not at expiry', async () => {
  findFirst.mockResolvedValue(null);
  await expect(strategy().validate(payload())).rejects.toThrow(UnauthorizedException);
});

it('reads the role inside the token’s own workspace', async () => {
  await strategy().validate(payload());
  // Scoped by the tenant the token names, never by anything on the request.
  expect(byIdOrThrow).toHaveBeenCalledWith('t1');
});

it('refuses a workspace token that names no workspace', async () => {
  await expect(strategy().validate(payload({ tenantId: undefined }))).rejects.toThrow(
    UnauthorizedException,
  );
});

it('stops working once the tenant is gone or suspended', async () => {
  byIdOrThrow.mockRejectedValue(new UnauthorizedException('Workspace is suspended'));
  await expect(strategy().validate(payload())).rejects.toThrow('Workspace is suspended');
});

describe('a platform administrator', () => {
  it('needs no workspace at all', async () => {
    const user = await strategy().validate({ sub: 'p1', isPlatform: true });
    expect(user).toMatchObject({ id: 'p1', isPlatform: true, name: 'Nakul' });
    expect(byIdOrThrow).not.toHaveBeenCalled();
  });

  it('never carries a tenant, even when the token names one', async () => {
    const user = await strategy().validate({ sub: 'p1', isPlatform: true, tenantId: 't1' });
    // They belong to no workspace; a tenant here would scope the control plane.
    expect(user).not.toHaveProperty('tenant');
    expect(byIdOrThrow).not.toHaveBeenCalled();
  });

  it('is allowed what their job allows now, not what the token said', async () => {
    const user = (await strategy().validate({
      sub: 'p1',
      isPlatform: true,
      // A token signed while they were an owner.
      permissions: ['platform.tenant.manage', 'platform.release.manage'],
    })) as { permissions: string[] };

    // They are support now, and support ships nothing.
    expect(user.permissions).toContain('platform.impersonate');
    expect(user.permissions).not.toContain('platform.release.manage');
  });

  it('stops working the moment the account is switched off', async () => {
    platformUser.mockResolvedValue({ name: 'Nakul', role: 'OWNER', isActive: false });
    await expect(
      strategy().validate({ sub: 'p1', isPlatform: true }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('gives an unknown role the least, not the most', async () => {
    platformUser.mockResolvedValue({ name: 'Nakul', role: 'TYPO', isActive: true });
    const user = (await strategy().validate({ sub: 'p1', isPlatform: true })) as {
      permissions: string[];
    };
    expect(user.permissions).toEqual(['platform.tenant.view']);
  });
});

describe('somebody from the platform inside a workspace', () => {
  it('carries who is really doing it', async () => {
    const user = (await strategy().validate(
      payload({ impersonatedBy: { id: 'p1', name: 'Nakul' } }),
    )) as { impersonatedBy?: { name: string } };

    // The trail, the log and the screen all read off this.
    expect(user.impersonatedBy).toEqual({ id: 'p1', name: 'Nakul' });
  });

  it('is otherwise the account itself, with the account’s permissions', async () => {
    const user = (await strategy().validate(
      payload({ impersonatedBy: { id: 'p1', name: 'Nakul' } }),
    )) as { id: string; permissions: string[] };

    expect(user.id).toBe('u1');
    expect(user.permissions).toEqual(['order.view', 'order.move_back']);
  });
});
