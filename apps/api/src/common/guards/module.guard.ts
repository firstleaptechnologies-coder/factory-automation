import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MODULE_CATALOGUE, type ModuleKey } from '@decor/shared';
import { MODULE_KEY } from '../decorators/module.decorator';

/**
 * Is this part of the product theirs?
 *
 * Runs beside the permission guard rather than instead of it. A tenant admin
 * with every permission in their workspace still cannot open a module their
 * plan does not include, and a shop that has bought everything still cannot let
 * the wrong person into it.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ModuleKey>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | { isPlatform?: boolean; tenant?: { modules?: string[] } }
      | undefined;
    if (!user) return false;

    // The control plane administers the product rather than using it; a
    // platform admin is not inside anybody's plan.
    if (user.isPlatform) return true;

    if ((user.tenant?.modules ?? []).includes(required)) return true;

    const label = MODULE_CATALOGUE.find((module) => module.key === required)?.label ?? required;
    throw new ForbiddenException(
      `${label} is not part of your plan. Ask whoever set your workspace up.`,
    );
  }
}
