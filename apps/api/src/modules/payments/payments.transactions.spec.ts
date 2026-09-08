import { PaymentsService, kindOf, transactionFilter } from './payments.service';
import { TRANSACTION_KINDS } from './dto/payment.dto';
import { prismaMock, notificationsMock, ledgerMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const at = (iso: string) => new Date(iso);

/** Ledger rows, which is what this screen has read since the books arrived. */
const ROWS = [
  {
    id: 'l3',
    sourceType: 'Payment',
    sourceId: 'p2',
    account: 'BANK',
    direction: 'IN',
    at: at('2026-09-08T10:00:00Z'),
    amount: 18000,
    reference: 'UTR9988',
    note: null,
    recordedBy: { id: 'u1', name: 'Ravi' },
    order: { id: 'o2', code: 'ORD-2', client: { name: 'Bhatia' } },
  },
  {
    id: 'l2',
    sourceType: 'CashDeposit',
    sourceId: 'd1',
    account: 'CASH',
    direction: 'TRANSFER',
    at: at('2026-09-07T10:00:00Z'),
    amount: 20000,
    reference: 'HDFC-771',
    note: null,
    recordedBy: { id: 'u2', name: 'Nakul' },
    order: { id: 'o1', code: 'ORD-1', client: { name: 'Verma Interiors' } },
  },
  {
    id: 'l1',
    sourceType: 'Payment',
    sourceId: 'p1',
    account: 'CASH',
    direction: 'IN',
    at: at('2026-09-06T10:00:00Z'),
    amount: 25000,
    reference: null,
    note: 'Advance',
    recordedBy: { id: 'u1', name: 'Ravi' },
    order: { id: 'o1', code: 'ORD-1', client: { name: 'Verma Interiors' } },
  },
];

function build(rows: unknown[] = ROWS) {
  const db = prismaMock() as never as Db;
  db.ledgerEntry.findMany = jest.fn(async () => rows);
  db.ledgerEntry.count = jest.fn(async () => rows.length);
  return {
    service: new PaymentsService(
      db as never,
      notificationsMock() as never,
      ledgerMock() as never,
    ),
    db,
  };
}

const query = (over: Record<string, unknown> = {}) =>
  ({ page: 1, limit: 20, skip: 0, ...over }) as never;

/** The clauses a filter is made of: kinds, then dates, then any search. */
const parts = (where: { AND?: unknown }) => where.AND as unknown[];

/** The kind clauses a filter ended up asking for. */
const kindsIn = (where: { AND?: unknown }) => JSON.stringify(parts(where)[0]);

it('puts every kind of movement in one list, newest first', async () => {
  const { service, db } = build();
  const page = await service.transactions(query());
  // "What happened to the money" is a single question, whatever the source.
  expect(page.data.map((row) => row.id)).toEqual(['l3', 'l2', 'l1']);
  expect(db.ledgerEntry.findMany.mock.calls[0][0].orderBy).toEqual({ at: 'desc' });
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

it('reads the payer and the payee off the row itself', () => {
  // A ledger row knows which account it moved, so nothing here has to open the
  // payment table to find out whether it was cash.
  expect(kindOf({ sourceType: 'Payment', account: 'CASH' as never })).toBe('PAYMENT_CASH');
  expect(kindOf({ sourceType: 'Payment', account: 'BANK' as never })).toBe('PAYMENT_ONLINE');
  expect(kindOf({ sourceType: 'CashDeposit', account: 'CASH' as never })).toBe('BANK_DEPOSIT');
});

describe('what this screen may show', () => {
  it('names the kinds it wants rather than the ones it does not', () => {
    const where = transactionFilter({}, TRANSACTION_KINDS);
    const asked = kindsIn(where);
    expect(asked).toContain('Payment');
    expect(asked).toContain('CashDeposit');
  });

  it('leaves payouts out, because they sit beside orders and not inside them', () => {
    // Folding a payout in here would net it off the money the order collected.
    // The filter lists what it wants, so a payout cannot arrive by being
    // forgotten about — not even one posted to the ledger long after this.
    const where = transactionFilter({}, TRANSACTION_KINDS);
    expect(kindsIn(where)).not.toContain('Disbursement');
  });

  it('asks only for cash when cash is what was asked for', async () => {
    const { service, db } = build();
    await service.transactions(query({ kind: 'PAYMENT_CASH' }));
    expect(kindsIn(db.ledgerEntry.findMany.mock.calls[0][0].where)).toEqual(
      JSON.stringify({ OR: [{ sourceType: 'Payment', account: 'CASH' }] }),
    );
  });

  it('asks only for online when online is what was asked for', async () => {
    const { service, db } = build();
    await service.transactions(query({ kind: 'PAYMENT_ONLINE' }));
    expect(kindsIn(db.ledgerEntry.findMany.mock.calls[0][0].where)).toContain('BANK');
  });

  it('asks only for trips to the bank', async () => {
    const { service, db } = build();
    await service.transactions(query({ kind: 'BANK_DEPOSIT' }));
    expect(kindsIn(db.ledgerEntry.findMany.mock.calls[0][0].where)).toEqual(
      JSON.stringify({ OR: [{ sourceType: 'CashDeposit' }] }),
    );
  });

  it('windows on the day the money moved', () => {
    const where = transactionFilter(
      { from: '2026-09-01', to: '2026-09-30' },
      TRANSACTION_KINDS,
    );
    expect(JSON.stringify(where.AND)).toContain('"at"');
  });

  it('leaves the dates alone when none were given', () => {
    const where = transactionFilter({}, TRANSACTION_KINDS);
    expect(JSON.stringify(parts(where)[1])).toBe('{}');
  });

  it('searches an order, a client, a reference and whoever was paid', () => {
    const where = transactionFilter({ search: 'UTR99' }, TRANSACTION_KINDS);
    const asked = JSON.stringify(parts(where)[2]);
    for (const field of ['reference', 'note', 'party', 'code', 'name']) {
      expect(asked).toContain(field);
    }
    expect(asked).toContain('UTR99');
  });

  it('trims a search that is only spaces rather than looking for them', () => {
    const where = transactionFilter({ search: '   ' }, TRANSACTION_KINDS);
    expect(parts(where).length).toBe(2);
  });
});

describe('paging', () => {
  it('leaves the paging to the database', async () => {
    const { service, db } = build();
    await service.transactions(query({ page: 3, limit: 10, skip: 20 }));
    // One ordered table, so the work grows with the page rather than with the
    // ledger — which is what merging two sources in memory could not promise.
    const call = db.ledgerEntry.findMany.mock.calls[0][0];
    expect(call.skip).toBe(20);
    expect(call.take).toBe(10);
  });

  it('counts every movement the filter covers, not the page in hand', async () => {
    const { service, db } = build();
    db.ledgerEntry.count = jest.fn(async () => 149);
    const page = await service.transactions(query());
    expect(page.meta.total).toBe(149);
    // Counted through the same filter the rows came from, or the two disagree.
    expect(db.ledgerEntry.count.mock.calls[0][0].where).toEqual(
      db.ledgerEntry.findMany.mock.calls[0][0].where,
    );
  });
});

it('says nothing rather than breaking on a shop that has taken nothing', async () => {
  const { service } = build([]);
  const page = await service.transactions(query());
  expect(page.data).toEqual([]);
  expect(page.meta.total).toBe(0);
});
