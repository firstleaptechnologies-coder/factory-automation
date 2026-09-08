import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** Passport reads the request off the context, so it has to be there. */
const context = {
  getHandler: () => undefined,
  getClass: () => undefined,
  switchToHttp: () => ({
    getRequest: () => ({ headers: {} }),
    getResponse: () => ({}),
  }),
  getType: () => 'http',
} as unknown as ExecutionContext;

function guard(isPublic: boolean | undefined, seen: string[] = []) {
  const reflector = {
    getAllAndOverride: (key: string) => {
      seen.push(key);
      return isPublic;
    },
  } as unknown as Reflector;
  return new JwtAuthGuard(reflector);
}

it('lets a route marked public through without a token', () => {
  expect(guard(true).canActivate(context)).toBe(true);
});

it('reads the flag that the Public decorator sets', () => {
  const seen: string[] = [];
  guard(true, seen).canActivate(context);
  expect(seen).toContain(IS_PUBLIC_KEY);
});

it('refuses an unmarked route with no token', async () => {
  // Reaching Passport is the point: a route is never allowed through on our
  // own say-so unless it was explicitly marked public.
  await expect(guard(undefined).canActivate(context)).rejects.toBeDefined();
});

it('refuses when the flag is explicitly false', async () => {
  await expect(guard(false).canActivate(context)).rejects.toBeDefined();
});
