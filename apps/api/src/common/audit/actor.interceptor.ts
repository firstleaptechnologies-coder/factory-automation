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
      | {
          id?: string;
          code?: string;
          name?: string;
          isPlatform?: boolean;
          impersonatedBy?: { id: string; name: string };
        }
      | undefined;

    if (!user) return next.handle();

    return runAsActor(
      {
        // A platform admin has no row in this workspace's user table, so their
        // id would not point at anything here. They are named instead.
        userId: user.isPlatform ? undefined : user.id,
        code: user.code,
        /*
         * Whose name goes on the change.
         *
         * Somebody from the platform inside a workspace is using a borrowed
         * account, and the shop's history must say so — otherwise their own
         * admin appears to have done things they never did.
         */
        name: actorName(user),
        platform: typeof request.headers?.['x-client'] === 'string'
          ? String(request.headers['x-client'])
          : undefined,
      },
      () => next.handle(),
    );
  }
}

/** Who to name in the trail: the person, not the account they are using. */
function actorName(user: {
  name?: string;
  isPlatform?: boolean;
  impersonatedBy?: { name: string };
}): string | undefined {
  if (user.impersonatedBy) {
    return `${user.impersonatedBy.name} (FirstLeap support, as ${user.name ?? 'an admin'})`;
  }
  if (user.isPlatform && user.name) return `${user.name} (FirstLeap support)`;
  return user.name;
}
