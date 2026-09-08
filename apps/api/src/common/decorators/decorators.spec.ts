import { ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY, Public } from './public.decorator';
import { ROLES_KEY, Roles } from './roles.decorator';
import { PERMISSIONS_KEY, RequirePermissions } from './permissions.decorator';
import { CurrentUser } from './current-user.decorator';

/** SetMetadata returns a decorator; applying it to a class exposes the value. */
function metadataOf(decorator: MethodDecorator & ClassDecorator, key: string) {
  class Target {}
  decorator(Target);
  return Reflect.getMetadata(key, Target);
}

it('Public marks a route as needing no token', () => {
  expect(metadataOf(Public(), IS_PUBLIC_KEY)).toBe(true);
});

it('Roles records every role it was given', () => {
  expect(metadataOf(Roles(UserRole.ADMIN, UserRole.MANAGER), ROLES_KEY)).toEqual([
    UserRole.ADMIN,
    UserRole.MANAGER,
  ]);
});

it('RequirePermissions records permission keys, not role names', () => {
  // Checked against the user's role permissions, so a tenant can rename or
  // recombine roles without the API caring.
  expect(
    metadataOf(RequirePermissions('order.view', 'order.punch') as never, PERMISSIONS_KEY),
  ).toEqual(['order.view', 'order.punch']);
});

it('an empty RequirePermissions leaves the route unguarded', () => {
  expect(metadataOf(RequirePermissions() as never, PERMISSIONS_KEY)).toEqual([]);
});

describe('CurrentUser', () => {
  it('registers itself as a route parameter', () => {
    class Controller {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      handler(@CurrentUser() user: unknown) {
        return user;
      }
    }
    const meta = Reflect.getMetadata(
      '__routeArguments__',
      Controller,
      'handler',
    ) as Record<string, { index: number; factory: unknown }>;
    const entry = Object.values(meta)[0];
    expect(entry.index).toBe(0);
    expect(typeof entry.factory).toBe('function');
  });

  it('hands the handler the user Passport put on the request', () => {
    class Controller {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      handler(@CurrentUser() user: unknown) {
        return user;
      }
    }
    const meta = Reflect.getMetadata('__routeArguments__', Controller, 'handler') as Record<
      string,
      { factory: (data: unknown, ctx: ExecutionContext) => unknown }
    >;
    const factory = Object.values(meta)[0].factory;
    const user = { id: 'u1', permissions: ['order.view'] };
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
    expect(factory(undefined, context)).toBe(user);
  });
});
