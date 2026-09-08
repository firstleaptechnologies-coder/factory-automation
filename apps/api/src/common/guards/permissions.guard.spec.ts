import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

function contextFor(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardRequiring(...permissions: string[]) {
  const reflector = { getAllAndOverride: () => permissions } as unknown as Reflector;
  return new PermissionsGuard(reflector);
}

describe('PermissionsGuard', () => {
  it('lets an unguarded route through', () => {
    const open = new PermissionsGuard({
      getAllAndOverride: () => undefined,
    } as unknown as Reflector);
    expect(open.canActivate(contextFor(undefined))).toBe(true);
  });

  it('allows a user who holds the permission', () => {
    const guard = guardRequiring('order.view');
    expect(guard.canActivate(contextFor({ permissions: ['order.view'] }))).toBe(true);
  });

  it('refuses a user who does not, and names what is missing', () => {
    const guard = guardRequiring('disbursement.manage');
    expect(() =>
      guard.canActivate(contextFor({ permissions: ['order.view'] })),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor({ permissions: [] }))).toThrow(
      /disbursement\.manage/,
    );
  });

  it('requires every permission on a route, not just one', () => {
    const guard = guardRequiring('estimate.manage', 'order.punch');
    expect(() =>
      guard.canActivate(contextFor({ permissions: ['estimate.manage'] })),
    ).toThrow();
    expect(
      guard.canActivate(contextFor({ permissions: ['estimate.manage', 'order.punch'] })),
    ).toBe(true);
  });

  it('refuses an unauthenticated request', () => {
    expect(guardRequiring('order.view').canActivate(contextFor(undefined))).toBe(false);
  });

  it('does not hand a platform admin a shop’s permissions', () => {
    // Running the product is not the same as working in a customer's shop.
    const guard = guardRequiring('order.punch');
    expect(() =>
      guard.canActivate(contextFor({ isPlatform: true, permissions: [] })),
    ).toThrow(ForbiddenException);
  });

  it('treats a user with no permissions list as having none', () => {
    expect(() => guardRequiring('order.view').canActivate(contextFor({}))).toThrow();
  });
});
