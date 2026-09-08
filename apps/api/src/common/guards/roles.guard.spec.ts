import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function contextFor(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardRequiring(roles: UserRole[] | undefined) {
  return new RolesGuard({ getAllAndOverride: () => roles } as unknown as Reflector);
}

it('lets an unguarded route through', () => {
  expect(guardRequiring(undefined).canActivate(contextFor(undefined))).toBe(true);
});

it('treats an empty role list as unguarded', () => {
  expect(guardRequiring([]).canActivate(contextFor(undefined))).toBe(true);
});

it('refuses an unauthenticated caller on a guarded route', () => {
  expect(() =>
    guardRequiring([UserRole.MANAGER]).canActivate(contextFor(undefined)),
  ).toThrow(ForbiddenException);
});

it('allows a user holding one of the listed roles', () => {
  const guard = guardRequiring([UserRole.MANAGER, UserRole.SALES]);
  expect(guard.canActivate(contextFor({ role: UserRole.SALES }))).toBe(true);
});

it('refuses a role that is not listed, and names what is needed', () => {
  const guard = guardRequiring([UserRole.MANAGER]);
  expect(() => guard.canActivate(contextFor({ role: UserRole.VIEWER }))).toThrow(
    /Requires role: MANAGER/,
  );
});

it('lets an admin through anything', () => {
  // ADMIN is deliberately a master key — a four-machine shop should not be
  // locked out of its own ERP at 2am.
  const guard = guardRequiring([UserRole.PRODUCTION]);
  expect(guard.canActivate(contextFor({ role: UserRole.ADMIN }))).toBe(true);
});

it('refuses a user carrying no role at all', () => {
  expect(() => guardRequiring([UserRole.MANAGER]).canActivate(contextFor({ id: 'u1' }))).toThrow(
    ForbiddenException,
  );
});
