import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { currentTenant } from '../tenancy/tenant-context';

/**
 * What the caller is told, and what we keep.
 *
 * Every error answer carries a short `reference`. A shop rings up saying "it
 * says something went wrong" and reads out six characters; that finds the exact
 * stack in the log. Without it the only thing to go on is a time and a screen.
 *
 * The two halves are deliberate. An HttpException is a decision this API made —
 * "that order is already delivered" — and its message is meant for the person
 * reading it, so it goes through untouched. Anything else is a bug: the caller
 * gets a plain sentence and the reference, and the details stay in the log
 * rather than being handed to whoever asked.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Api');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse();
    const request = http.getRequest();
    const reference = randomUUID().replace(/-/g, '').slice(0, 8);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === 'string'
          ? { statusCode: status, message: body }
          : { ...(body as Record<string, unknown>) };

      // A 4xx is the caller being told no, which is not a fault to investigate.
      // A 5xx dressed as an HttpException still is.
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.report(reference, request, exception);
      }

      response.status(status).json({ ...payload, reference });
      return;
    }

    this.report(reference, request, exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      // Nothing about the failure: an unhandled error's message is as likely to
      // be a connection string as it is to be useful.
      message: 'Something went wrong at our end. Quote this reference if it keeps happening.',
      reference,
    });
  }

  private report(reference: string, request: unknown, exception: unknown): void {
    const { method, url, user } = (request ?? {}) as {
      method?: string;
      url?: string;
      user?: { id?: string };
    };
    const tenant = currentTenant()?.slug ?? '—';
    const where = `${method ?? '?'} ${url ?? '?'} · workspace ${tenant} · user ${user?.id ?? '—'}`;

    // The request body is never logged: it holds passwords on one route and a
    // client's private business on most of the others.
    this.logger.error(
      `[${reference}] ${where} — ${describe(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );
  }
}

function describe(exception: unknown): string {
  if (exception instanceof Error) return `${exception.name}: ${exception.message}`;
  return String(exception);
}
