import { ForbiddenException } from '@nestjs/common';
import { MODULES } from '@decor/shared';
import { ModuleGuard } from './module.guard';
import { MODULE_KEY } from '../decorators/module.decorator';

function build(required: string | undefined, user: unknown) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => (key === MODULE_KEY ? required : undefined)),
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  return { guard: new ModuleGuard(reflector as never), context: context as never };
}

describe('what a plan reaches', () => {
  it('lets an unmarked route through', () => {
    const { guard, context } = build(undefined, { tenant: { modules: [] } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('lets the workspace into what they bought', () => {
    const { guard, context } = build(MODULES.HR, { tenant: { modules: ['orders', 'hr'] } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('refuses what they did not, in words that say what to do', () => {
    const { guard, context } = build(MODULES.HR, { tenant: { modules: ['orders'] } });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(/People is not part of your plan/);
  });

  it('refuses a workspace with nothing resolved rather than assuming the best', () => {
    const { guard, context } = build(MODULES.FINANCE, { tenant: {} });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('lets the control plane through, since it is not inside anybody’s plan', () => {
    const { guard, context } = build(MODULES.HR, { isPlatform: true });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('refuses a caller with no identity at all', () => {
    const { guard, context } = build(MODULES.HR, undefined);
    expect(guard.canActivate(context)).toBe(false);
  });
});
