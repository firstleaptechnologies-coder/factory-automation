import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { runAsActor } from './audit-context';

/**
 * Puts the signed-in person into context for the whole call.
 *
 * The audit trail is written underneath the services by a Prisma extension,
 * which has no arguments to read a user from — so who is doing this travels the
 * same way the tenant does. Read off the verified token only: a caller must not
 * be able to sign someone else's name to a change.
 */
@Injectable()
export class ActorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request?.user as
      | { id?: string; code?: string; name?: string; isPlatform?: boolean }
      | undefined;

    if (!user) return next.handle();

    return runAsActor(
      {
        // A platform admin has no row in this workspace's user table, so their
        // id would not point at anything here. They are named instead.
        userId: user.isPlatform ? undefined : user.id,
        code: user.code,
        name: user.isPlatform && user.name ? `${user.name} (Decor Bucket support)` : user.name,
        platform: typeof request.headers?.['x-client'] === 'string'
          ? String(request.headers['x-client'])
          : undefined,
      },
      () => next.handle(),
    );
  }
}
