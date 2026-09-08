import { LedgerReconcileJob } from './ledger-reconcile.job';
import { ALL_MODULES } from '@decor/shared';
import { prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const CONTEXT = {
  tenantId: 't1',
  slug: 'decorbucket',
  isolation: 'SHARED',
  databaseUrl: null,
  modules: ALL_MODULES,
};

function build(options: { entries?: unknown[] } = {}) {
  const db = prismaMock() as never as Db;
  (db as unknown as Record<string, unknown>).platform = db;
  db.tenant.findMany = jest.fn(async () => [{ id: 't1', slug: 'decorbucket' }]);
  db.ledgerEntry.findMany = jest.fn(async () => options.entries ?? []);
  db.payment.findMany = jest.fn(async () => [
    {
      id: 'p1',
      orderId: 'o1',
      amount: 40000,
      mode: 'CASH',
      receivedAt: new Date('2026-09-01T10:00:00.000Z'),
      order: { clientId: 'c1', code: 'ORD-1', client: { gstin: null } },
    },
  ]);
  db.cashDeposit.findMany = jest.fn(async () => [
    {
      id: 'd1',
      amount: 25000,
      depositedAt: new Date('2026-09-02T10:00:00.000Z'),
      payment: { orderId: 'o1' },
    },
  ]);
  db.disbursement.findMany = jest.fn(async () => [
    {
      id: 'x1',
      orderId: 'o1',
      amount: 12000,
      payeeName: 'Ramesh',
      paidAt: new Date('2026-09-03T10:00:00.000Z'),
      paidMode: 'CASH',
      category: null,
    },
  ]);

  const registry = { byIdOrThrow: jest.fn(async () => CONTEXT) };
  const ledger = { write: jest.fn(async () => undefined) };
  const runner = { run: jest.fn(async (_n: string, work: () => Promise<unknown>) => work()) };

  return {
    job: new LedgerReconcileJob(
      runner as never,
      db as never,
      registry as never,
      ledger as never,
    ),
    db,
    ledger,
    runner,
  };
}

describe('bringing the ledger up to date', () => {
  it('posts everything that moved money before there was a ledger', async () => {
    const { job, ledger } = build();
    const detail = (await job.reconcile()) as Record<string, unknown>;

    // A receipt, a trip to the bank and a settled payout.
    expect(ledger.write).toHaveBeenCalledTimes(3);
    expect(detail).toMatchObject({ posted: 3, byWorkspace: { decorbucket: 3 } });
  });

  it('finds nothing on a night when everything posted as it happened', async () => {
    const { job, ledger } = build({
      entries: [
        { sourceType: 'Payment', sourceId: 'p1' },
        { sourceType: 'CashDeposit', sourceId: 'd1' },
        { sourceType: 'Disbursement', sourceId: 'x1' },
      ],
    });

    expect(await job.reconcile()).toEqual({ posted: 0, byWorkspace: {} });
    expect(ledger.write).not.toHaveBeenCalled();
  });

  it('leaves a planned payout alone, because an intention is not money moving', async () => {
    const { job, db } = build();
    await job.reconcile();
    expect(db.disbursement.findMany.mock.calls[0][0].where).toEqual({ status: 'PAID' });
  });

  it('says which workspace was behind, so a recurring gap can be found', async () => {
    const { job } = build();
    const detail = (await job.reconcile()) as { byWorkspace: Record<string, number> };
    expect(detail.byWorkspace).toEqual({ decorbucket: 3 });
  });

  it('runs through the runner, so it takes a lease like everything else', async () => {
    const { job, runner } = build();
    await job.nightly();
    expect(runner.run.mock.calls[0][0]).toBe('ledger.reconcile');
  });

  it('skips a suspended workspace', async () => {
    const { job, db } = build();
    await job.reconcile();
    expect(db.tenant.findMany.mock.calls[0][0].where).toEqual({
      status: { not: 'SUSPENDED' },
    });
  });
});
