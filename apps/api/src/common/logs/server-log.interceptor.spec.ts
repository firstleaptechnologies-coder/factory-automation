import { BadRequestException } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { REFERENCE, ServerLogInterceptor } from './server-log.interceptor';
import { prismaMock, inTenant } from '../../../test/prisma-mock';
import { runAsActor } from '../audit/audit-context';

type Db = Record<string, Record<string, jest.Mock>>;

function build(request: Record<string, unknown> = {}) {
  const db = prismaMock() as never as Db;
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        route: { path: '/orders/:id/payments' },
        url: '/api/orders/o1/payments',
        headers: { 'x-client': 'app' },
        ...request,
      }),
      getResponse: () => ({ statusCode: 201 }),
    }),
    getClass: () => ({ name: 'PaymentsController' }),
    getHandler: () => ({ name: 'record' }),
  };
  return { interceptor: new ServerLogInterceptor(db as never), db, context };
}

/** The row it wrote, once the microtask queue has drained. */
const written = async (db: Db) => {
  await Promise.resolve();
  return db.serverLog.create.mock.calls[0]?.[0]?.data;
};

describe('what gets recorded', () => {
  it('records a write and how long it took', async () => {
    const { interceptor, db, context } = build();
    await lastValueFrom(
      interceptor.intercept(context as never, { handle: () => of('done') } as never),
    );

    const row = await written(db);
    expect(row).toMatchObject({
      action: 'PaymentsController.record',
      method: 'POST',
      // The route as written, so it is one row per endpoint rather than one
      // per order id.
      path: '/orders/:id/payments',
      outcome: 'ok',
      status: 201,
      client: 'app',
    });
    expect(row.durationMs).toEqual(expect.any(Number));
  });

  it('does not record a read that worked', async () => {
    const { interceptor, db, context } = build({ method: 'GET' });
    await lastValueFrom(
      interceptor.intercept(context as never, { handle: () => of([]) } as never),
    );

    // Most of the traffic, and the least worth keeping.
    await Promise.resolve();
    expect(db.serverLog.create).not.toHaveBeenCalled();
  });

  it('records a read that failed', async () => {
    const { interceptor, db, context } = build({ method: 'GET' });
    await lastValueFrom(
      interceptor.intercept(context as never, {
        handle: () => throwError(() => new Error('database is gone')),
      } as never),
    ).catch(() => undefined);

    const row = await written(db);
    expect(row).toMatchObject({ outcome: 'failed', status: 500 });
    expect(row.error).toContain('database is gone');
  });

  it('tells being told no from breaking', async () => {
    const { interceptor, db, context } = build();
    await lastValueFrom(
      interceptor.intercept(context as never, {
        handle: () => throwError(() => new BadRequestException('That order is already delivered')),
      } as never),
    ).catch(() => undefined);

    const row = await written(db);
    expect(row).toMatchObject({ outcome: 'refused', status: 400 });
  });

  it('leaves the caller’s reference on the request, so the two match', async () => {
    const request: Record<string, unknown> = { method: 'POST' };
    const { interceptor, context } = build(request);
    // build() spreads the request into a fresh object each call, so read the
    // one the interceptor actually saw.
    const seen = (context.switchToHttp().getRequest() as Record<string, unknown>);

    await lastValueFrom(
      interceptor.intercept(
        { ...context, switchToHttp: () => ({ getRequest: () => seen, getResponse: () => ({}) }) } as never,
        { handle: () => throwError(() => new Error('boom')) } as never,
      ),
    ).catch(() => undefined);

    expect(seen[REFERENCE]).toMatch(/^[0-9a-f]{8}$/);
  });

  it('names the workspace and the person, read while it is still in context', async () => {
    const { interceptor, db, context } = build();

    await inTenant(() =>
      runAsActor({ userId: 'u1', name: 'Rajat' }, () =>
        lastValueFrom(
          interceptor.intercept(context as never, { handle: () => of('done') } as never),
        ),
      ),
    );

    const row = await written(db);
    expect(row).toMatchObject({ tenantId: 'tenant-test', userId: 'u1', actorLabel: 'Rajat' });
  });

  it('lets the call succeed even when the log cannot be written', async () => {
    const { interceptor, db, context } = build();
    db.serverLog.create = jest.fn(async () => {
      throw new Error('log table is full');
    });
    jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(
      lastValueFrom(
        interceptor.intercept(context as never, { handle: () => of('done') } as never),
      ),
    ).resolves.toBe('done');
    jest.restoreAllMocks();
  });
});
