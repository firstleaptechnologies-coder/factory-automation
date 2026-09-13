import { PaymentsService } from './payments.service';
import { prismaMock, notificationsMock, ledgerMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

/** What each of the five questions cashPosition asks the ledger. */
interface Bucket {
  where: Record<string, unknown>;
  amount: number;
  count: number;
}

function build(buckets: Bucket[]) {
  const db = prismaMock() as never as Db;
  db.ledgerEntry.aggregate = jest.fn(async (args: { where: Record<string, unknown> }) => {
    const match = buckets.find(
      (bucket) => JSON.stringify(bucket.where) === JSON.stringify(args.where),
    );
    return {
      _sum: { amount: match?.amount ?? 0 },
      _count: { _all: match?.count ?? 0 },
    };
  });
  return {
    service: new PaymentsService(
      db as never,
      notificationsMock() as never,
      ledgerMock() as never,
    ),
    db,
  };
}

const CASH_IN = { direction: 'IN', account: 'CASH' };
const BANKED = { direction: 'TRANSFER', account: 'CASH' };
const CASH_OUT = { direction: 'OUT', account: 'CASH' };
const ONLINE = { direction: 'IN', account: 'BANK' };
const UNALLOCATED = { direction: 'TRANSFER', account: 'CASH', orderId: null };

const SHOP = [
  { where: CASH_IN, amount: 90000, count: 6 },
  { where: BANKED, amount: 50000, count: 2 },
  { where: CASH_OUT, amount: 15000, count: 1 },
  { where: ONLINE, amount: 40000, count: 3 },
  { where: UNALLOCATED, amount: 20000, count: 1 },
];

const query = (over: Record<string, unknown> = {}) => over as never;

it('counts what is actually in the drawer', async () => {
  const { service } = build(SHOP);
  const position = await service.cashPosition(query());
  // Cash taken, less cash walked to the bank, less cash handed to somebody:
  // a payout leaves the drawer as surely as a deposit does.
  expect(position.cash.inHand).toBe(25000);
});

it('shows a cash payout on its own line rather than hiding it in the total', async () => {
  const { service } = build(SHOP);
  const position = await service.cashPosition(query());
  // Visible beside the drawer, never netted off the order it came from.
  expect(position.cash.paidOut).toBe(15000);
  expect(position.cash.received).toBe(90000);
});

it('keeps cash and bank apart', async () => {
  const { service } = build(SHOP);
  const position = await service.cashPosition(query());
  expect(position.online).toEqual({ received: 40000, receipts: 3 });
  expect(position.cash.deposited).toBe(50000);
  expect(position.deposits).toBe(2);
  expect(position.cash.receipts).toBe(6);
});

it('says how much was banked without an order to name', async () => {
  const { service } = build(SHOP);
  const position = await service.cashPosition(query());
  // One trip to the bank often covers several orders' takings.
  expect(position.cash.depositsUnallocated).toBe(20000);
});

it('windows every side of the question on the same dates', async () => {
  const { service, db } = build([]);
  await service.cashPosition(query({ from: '2026-09-01', to: '2026-09-30' }));
  // Receipts inside the window against deposits from all time would have made
  // "in hand" a figure that belonged to no period at all.
  for (const call of db.ledgerEntry.aggregate.mock.calls) {
    expect(call[0].where.at).toEqual({
      gte: new Date('2026-09-01'),
      lte: new Date('2026-09-30'),
    });
  }
  expect(db.ledgerEntry.aggregate).toHaveBeenCalledTimes(5);
});

it('asks about all time when no dates were given', async () => {
  const { service, db } = build([]);
  await service.cashPosition(query());
  for (const call of db.ledgerEntry.aggregate.mock.calls) {
    expect(call[0].where.at).toBeUndefined();
  }
});

it('answers zero for a shop that has taken nothing', async () => {
  const { service } = build([]);
  const position = await service.cashPosition(query());
  expect(position.cash).toEqual({
    received: 0,
    deposited: 0,
    paidOut: 0,
    notBanked: 0,
    inHand: 0,
    receipts: 0,
    depositsUnallocated: 0,
  });
});

/*
 * The shop's own trial found this: one screen said the drawer held ₹5,000 and
 * minus ₹1,000 at the same time, both labelled "in hand".
 *
 * They are two real and different questions — what is in the drawer, and which
 * receipts have not been walked to the bank — and a payout separates them,
 * because cash handed to a fitter empties the drawer without banking anything.
 * Both are returned now, so a screen can print the subtraction instead of two
 * numbers that look like they should agree and do not.
 */
describe('the drawer and the receipts waiting to be banked', () => {
  const owners = [
    { where: CASH_IN, amount: 20000, count: 1 },
    { where: BANKED, amount: 15000, count: 1 },
    { where: CASH_OUT, amount: 6000, count: 1 },
    { where: ONLINE, amount: 23200, count: 1 },
    { where: UNALLOCATED, amount: 0, count: 0 },
  ];

  it('separates them by exactly what went out in cash', async () => {
    const { service } = build(owners);

    const { cash } = await service.cashPosition(query());

    expect(cash.notBanked).toBe(5000);
    expect(cash.inHand).toBe(-1000);
    expect(cash.notBanked - cash.inHand).toBe(cash.paidOut);
  });

  it('reports a drawer that has gone below nothing rather than flooring it', async () => {
    const { service } = build(owners);

    const { cash } = await service.cashPosition(query());

    // A negative drawer means a receipt was never entered, or the money came
    // from somewhere the app was not told about. Hiding it hides the mistake.
    expect(cash.inHand).toBeLessThan(0);
  });

  it('has them agree when nothing has been paid out in cash', async () => {
    const { service } = build(owners.map((b) => (b.where === CASH_OUT ? { ...b, amount: 0 } : b)));

    const { cash } = await service.cashPosition(query());

    expect(cash.inHand).toBe(cash.notBanked);
  });

  it('never lets a payout reduce what was taken', async () => {
    const { service } = build(owners);

    const { cash } = await service.cashPosition(query());

    // Payouts sit beside orders; they empty the drawer and nothing else.
    expect(cash.received).toBe(20000);
    expect(cash.deposited).toBe(15000);
  });
});
