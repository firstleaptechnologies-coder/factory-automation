import { randomUUID } from 'node:crypto';
import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { currentTenant } from '../tenancy/tenant-context';
import { currentActor } from '../audit/audit-context';

/** Where the reference is left for the exception filter to show the caller. */
export const REFERENCE = 'decorErrorReference';

/**
 * How the product is behaving, recorded as it happens.
 *
 * Separate from the audit trail on purpose: that is the shop's business record
 * and lives in their database, this is ours — what is failing, for whom, and
 * how slowly. It goes to the platform database because a pattern across
 * workspaces is the only useful view of it, and a dedicated tenant's database
 * would hide half of them.
 *
 * Successful reads are not recorded. They are most of the traffic and say the
 * least; a log nobody can afford to keep is a log nobody keeps.
 */
@Injectable()
export class ServerLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('ServerLog');

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const started = Date.now();
    const action = `${context.getClass().name}.${context.getHandler().name}`;

    /*
     * Read the context now, while we are inside it.
     *
     * The tenant and the actor live in async local storage, which is in place
     * for the synchronous part of this call — the callbacks below run when the
     * response is on its way out, by which time it may not be.
     */
    const tenant = currentTenant();
    const actor = currentActor();

    const write = (
      status: number,
      outcome: string,
      error?: unknown,
      reference?: string,
    ) => {
      if (outcome === 'ok' && request?.method === 'GET') return;

      this.prisma.platform.serverLog
        .create({
          data: {
            tenantId: tenant?.tenantId ?? null,
            tenantSlug: tenant?.slug ?? null,
            action,
            method: String(request?.method ?? '?'),
            // The route as it is written, not as it was typed: one row per
            // endpoint rather than one per order id.
            path: String(request?.route?.path ?? request?.originalUrl ?? request?.url ?? '?').split('?')[0],
            status,
            outcome,
            durationMs: Date.now() - started,
            userId: actor?.userId ?? null,
            actorLabel: actor?.name ?? actor?.code ?? null,
            client: header(request, 'x-client'),
            error: error ? describe(error) : null,
            reference: reference ?? null,
          },
        })
        .catch((problem: unknown) => {
          // Never at the cost of the request itself.
          this.logger.warn(`Could not record ${action}: ${describe(problem)}`);
        });
    };

    return next.handle().pipe(
      tap(() => write(http.getResponse()?.statusCode ?? 200, 'ok')),
      catchError((error: unknown) => {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        const reference = randomUUID().replace(/-/g, '').slice(0, 8);
        // The filter shows this to the caller, so the code they read out over
        // the phone finds this exact row.
        if (request) request[REFERENCE] = reference;
        // A 4xx is the caller being told no; only a 5xx is us breaking.
        write(status, status >= 500 ? 'failed' : 'refused', error, reference);
        return throwError(() => error);
      }),
    );
  }
}

function header(request: unknown, name: string): string | null {
  const headers = (request as { headers?: Record<string, unknown> } | undefined)?.headers;
  const value = headers?.[name];
  return typeof value === 'string' ? value.slice(0, 40) : null;
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 1000);
  return String(error).slice(0, 1000);
}
