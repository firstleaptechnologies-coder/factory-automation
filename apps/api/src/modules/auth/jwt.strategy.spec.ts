import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

const TENANT = { id: 't1', slug: 'decorbucket', isolation: 'SHARED' };

const byIdOrThrow = jest.fn(async (..._args: unknown[]) => TENANT as unknown);

/** What the role allows now, which is what the strategy reads. */
const findFirst = jest.fn(async (..._args: unknown[]) => ({
  role: 'ADMIN',
  roleRef: { permissions: ['order.view', 'order.move_back'] },
}) as unknown);

const strategy = () =>
  new JwtStrategy(
    { get: () => 'test-secret' } as never,
    { byIdOrThrow } as never,
    { user: { findFirst } } as never,
  );

beforeEach(() => {
  jest.clearAllMocks();
  byIdOrThrow.mockResolvedValue(TENANT);
  findFirst.mockResolvedValue({
    role: 'ADMIN',
    roleRef: { permissions: ['order.view', 'order.move_back'] },
  });
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
    expect(user).toEqual({ id: 'p1', isPlatform: true, permissions: [] });
    expect(byIdOrThrow).not.toHaveBeenCalled();
  });

  it('never carries a tenant, even when the token names one', async () => {
    const user = await strategy().validate({ sub: 'p1', isPlatform: true, tenantId: 't1' });
    // They belong to no workspace; a tenant here would scope the control plane.
    expect(user).not.toHaveProperty('tenant');
    expect(byIdOrThrow).not.toHaveBeenCalled();
  });
});
