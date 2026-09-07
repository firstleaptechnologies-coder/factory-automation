import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthUser } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new ForbiddenException('Not authenticated');
    // ADMIN is deliberately a master key — a four-machine shop should not be
    // locked out of its own ERP at 2am.
    if (user.role === UserRole.ADMIN) return true;
    if (!user.role || !required.includes(user.role as UserRole)) {
      throw new ForbiddenException(`Requires role: ${required.join(', ')}`);
    }
    return true;
  }
}
