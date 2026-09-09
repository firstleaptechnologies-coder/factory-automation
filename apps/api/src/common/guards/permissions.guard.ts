import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@fas/shared';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | { permissions?: string[]; isPlatform?: boolean }
      | undefined;
    if (!user) return false;

    // Platform users administer the product, not a shop's day-to-day work, so
    // they are not silently granted every tenant permission.
    const granted = new Set(user.permissions ?? []);
    const missing = required.filter((permission) => !granted.has(permission));

    if (missing.length) {
      throw new ForbiddenException(
        `Your role does not allow this (${missing.join(', ')})`,
      );
    }
    return true;
  }
}
