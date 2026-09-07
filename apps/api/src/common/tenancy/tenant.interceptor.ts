import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { runInTenant, runAsPlatform, TenantContext } from './tenant-context';

/**
 * Puts the request's tenant into async local storage for the whole call.
 *
 * The tenant comes from the verified JWT, never from a header or a query
 * parameter — a caller must not be able to name the tenant they want to read.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as
      | { tenant?: TenantContext; isPlatform?: boolean }
      | undefined;

    if (user?.isPlatform) return runAsPlatform(() => next.handle());
    if (user?.tenant) return runInTenant(user.tenant, () => next.handle());

    // Unauthenticated routes (login) resolve their own tenant.
    return next.handle();
  }
}
