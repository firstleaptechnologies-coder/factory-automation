import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TenantContext } from '../tenancy/tenant-context';

export interface AuthUser {
  id: string;
  code?: string;
  name?: string;
  role?: string;
  permissions: string[];
  tenant?: TenantContext;
  isPlatform?: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest().user,
);
