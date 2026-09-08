import { PaymentsService } from './payments.service';
import { prismaMock, notificationsMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const at = (iso: string) => new Date(iso);

const PAYMENTS = [
  {
    id: 'p1',
    amount: 25000,
    mode: 'CASH',
    reference: null,
    note: 'Advance',
    receivedAt: at('2026-09-06T10:00:00Z'),
    receivedBy: { id: 'u1', name: 'Ravi' },
    order: { id: 'o1', code: 'ORD-1', client: { name: 'Verma Interiors' } },
  },
  {
    id: 'p2',
    amount: 18000,
    mode: 'ONLINE',
    reference: 'UTR9988',
    note: null,
    receivedAt: at('2026-09-08T10:00:00Z'),
    receivedBy: { id: 'u1', name: 'Ravi' },
    order: { id: 'o2', code: 'ORD-2', client: { name: 'Bhatia' } },
  },
];

const DEPOSITS = [
  {
    id: 'd1',
    amount: 20000,
    bankReference: 'HDFC-771',
    note: null,
    depositedAt: at('2026-09-07T10:00:00Z'),
    depositedBy: { id: 'u2', name: 'Nakul' },
    payment: { order: { id: 'o1', code: 'ORD-1', client: { name: 'Verma Interiors' } } },
  },
];

function build(payments = PAYMENTS, deposits = DEPOSITS) {
  const db = prismaMock() as never as Db;
  db.payment.findMany = jest.fn(async () => payments);
  db.cashDeposit.findMany = jest.fn(async () => deposits);
  db.payment.count = jest.fn(async () => payments.length);
  db.cashDeposit.count = jest.fn(async () => deposits.length);
  return { service: new PaymentsService(db as never, notificationsMock() as never), db };
}

const query = (over: Record<string, unknown> = {}) =>
  ({ page: 1, limit: 20, skip: 0, ...over }) as never;

it('puts every kind of movement in one list, newest first', async () => {
  const { service } = build();
  const page = await service.transactions(query());
  // "What happened to the money" is a single question, whatever the source.
  expect(page.data.map((row) => row.id)).toEqual([
    'payment:p2',
    'deposit:d1',
    'payment:p1',
  ]);
});

it('names each row for what it actually was', async () => {
  const { service } = build();
  const page = await service.transactions(query());
  expect(page.data.map((row) => row.kind)).toEqual([
    'PAYMENT_ONLINE',
    'BANK_DEPOSIT',
    'PAYMENT_CASH',
  ]);
});

it('keeps money arriving apart from money moving', async () => {
  const { service } = build();
  const page = await service.transactions(query());
  const deposit = page.data.find((row) => row.kind === 'BANK_DEPOSIT')!;
  // Banking cash changes where the money is, not how much there is; adding
  // the two together would count the same rupees twice.
  expect(deposit.direction).toBe('TRANSFER');
  expect(page.data.filter((row) => row.direction === 'IN')).toHaveLength(2);
});

it('carries the order and the person, so a row can be accounted for', async () => {
  const { service } = build();
  const page = await service.transactions(query());
  expect(page.data[2]).toMatchObject({
    amount: 25000,
    reference: null,
    note: 'Advance',
    order: { code: 'ORD-1', client: { name: 'Verma Interiors' } },
    by: { name: 'Ravi' },
  });
});

it('says how many movements there are altogether', async () => {
  const { service } = build();
  const page = await service.transactions(query());
  expect(page.meta.total).toBe(3);
});

describe('filtering', () => {
  it('asks only for cash when cash is what was asked for', async () => {
    const { service, db } = build();
    await service.transactions(query({ kind: 'PAYMENT_CASH' }));
    expect(db.payment.findMany.mock.calls[0][0].where.mode).toBe('CASH');
    // Deposits are a different kind; they must not be fetched at all.
    expect(db.cashDeposit.findMany).not.toHaveBeenCalled();
  });

  it('asks only for online when online is what was asked for', async () => {
    const { service, db } = build();
    await service.transactions(query({ kind: 'PAYMENT_ONLINE' }));
    expect(db.payment.findMany.mock.calls[0][0].where.mode).toBe('ONLINE');
  });

  it('asks only for trips to the bank', async () => {
    const { service, db } = build();
    const page = await service.transactions(query({ kind: 'BANK_DEPOSIT' }));
    expect(db.payment.findMany).not.toHaveBeenCalled();
    expect(page.data.every((row) => row.kind === 'BANK_DEPOSIT')).toBe(true);
    expect(page.meta.total).toBe(1);
  });

  it('does not narrow by mode when both kinds of payment are wanted', async () => {
    const { service, db } = build();
    await service.transactions(query());
    expect(db.payment.findMany.mock.calls[0][0].where.mode).toBeUndefined();
  });

  it('windows each source on its own date column', async () => {
    const { service, db } = build();
    await service.transactions(query({ from: '2026-09-01', to: '2026-09-30' }));
    expect(db.payment.findMany.mock.calls[0][0].where.receivedAt).toBeDefined();
    expect(db.cashDeposit.findMany.mock.calls[0][0].where.depositedAt).toBeDefined();
  });

  it('leaves the dates alone when none were given', async () => {
    const { service, db } = build();
    await service.transactions(query());
    expect(db.payment.findMany.mock.calls[0][0].where.receivedAt).toBeUndefined();
  });

  it('searches an order, a client and a reference', async () => {
    const { service, db } = build();
    await service.transactions(query({ search: 'UTR99' }));
    const where = db.payment.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where.OR)).toContain('UTR99');
    // A trip to the bank has a bank reference rather than an order of its own.
    expect(JSON.stringify(db.cashDeposit.findMany.mock.calls[0][0].where.OR)).toContain(
      'bankReference',
    );
  });
});

describe('paging', () => {
  it('asks each source only for the rows that could reach this page', async () => {
    const { service, db } = build();
    await service.transactions(query({ page: 3, limit: 10, skip: 20 }));
    // Otherwise the work grows with the ledger rather than with the page.
    expect(db.payment.findMany.mock.calls[0][0].take).toBe(30);
    expect(db.cashDeposit.findMany.mock.calls[0][0].take).toBe(30);
  });

  it('cuts the merged list to the page that was asked for', async () => {
    const { service } = build();
    const page = await service.transactions(query({ page: 2, limit: 2, skip: 2 }));
    expect(page.data.map((row) => row.id)).toEqual(['payment:p1']);
  });

  it('counts both sources towards the total', async () => {
    const { service, db } = build();
    db.payment.count = jest.fn(async () => 140);
    db.cashDeposit.count = jest.fn(async () => 9);
    const page = await service.transactions(query());
    expect(page.meta.total).toBe(149);
  });
});

it('says nothing rather than breaking on a shop that has taken nothing', async () => {
  const { service } = build([], []);
  const page = await service.transactions(query());
  expect(page.data).toEqual([]);
  expect(page.meta.total).toBe(0);
});
