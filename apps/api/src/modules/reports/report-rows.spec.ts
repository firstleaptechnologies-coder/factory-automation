import {
  cashBookRows,
  gstSummaryRows,
  orderRegisterRows,
  payoutRows,
  receivableRows,
  totalsFor,
} from './report-rows';

describe('cash book', () => {
  const entry = (over: Partial<Parameters<typeof cashBookRows>[0][number]>) => ({
    at: '2026-04-01',
    direction: 'IN' as const,
    account: 'CASH' as const,
    amount: 1000,
    voucher: 'Receipt',
    ...over,
  });

  it('runs a balance forward, row by row', () => {
    const rows = cashBookRows([
      entry({ amount: 1000 }),
      entry({ amount: 400, direction: 'OUT' }),
      entry({ amount: 250 }),
    ]);

    expect(rows.map((r) => r.balance)).toEqual([1000, 600, 850]);
  });

  // A quarter that opened with money in the tin is wrong by exactly that much
  // if the book starts at zero.
  it('starts from the opening balance it was given', () => {
    const rows = cashBookRows([entry({ amount: 500 })], 12_000);

    expect(rows[0].balance).toBe(12_500);
  });

  it('puts money in and money out in separate columns', () => {
    const [inRow, outRow] = cashBookRows([entry({}), entry({ direction: 'OUT', amount: 300 })]);

    expect([inRow.moneyIn, inRow.moneyOut]).toEqual([1000, 0]);
    expect([outRow.moneyIn, outRow.moneyOut]).toEqual([0, 300]);
  });

  // A transfer between the shop's own accounts carries its sign on the row.
  it('reads a transfer from its sign rather than its direction', () => {
    const [out, into] = cashBookRows([
      entry({ direction: 'TRANSFER', amount: -5000, account: 'CASH' }),
      entry({ direction: 'TRANSFER', amount: 5000, account: 'BANK' }),
    ]);

    expect(out.moneyOut).toBe(5000);
    expect(into.moneyIn).toBe(5000);
  });
});

describe('receivables', () => {
  const row = (over: Partial<Parameters<typeof receivableRows>[0][number]>) => ({
    clientName: 'Sharma Interiors',
    orderCode: 'ORD-1',
    charged: 118_000,
    credited: 0,
    received: 0,
    ...over,
  });

  it('shows what is still due', () => {
    const [result] = receivableRows([row({ received: 50_000 })]);

    expect(result.due).toBe(68_000);
    expect(result.settled).toBe(false);
  });

  it('settles only when everything charged has been collected', () => {
    const [result] = receivableRows([row({ received: 118_000 })]);

    expect(result.due).toBe(0);
    expect(result.settled).toBe(true);
  });

  // The rule the whole product is built around, checked in the place a lie
  // would be hardest to spot.
  it('does not call an order settled for less than it collected', () => {
    const [result] = receivableRows([row({ received: 117_999.5 })]);

    expect(result.settled).toBe(false);
    expect(result.due).toBe(0.5);
  });

  it('takes a credit note off what is owed', () => {
    const [result] = receivableRows([row({ credited: 11_800, received: 106_200 })]);

    expect(result.due).toBe(0);
    expect(result.settled).toBe(true);
  });
});

describe('payouts', () => {
  it('lists them without subtracting them from anything', () => {
    const rows = payoutRows([
      { at: '2026-04-10', orderCode: 'ORD-1', payee: 'Ravi', amount: 8000, status: 'PAID' },
    ]);

    expect(rows).toEqual([
      {
        date: '2026-04-10',
        orderCode: 'ORD-1',
        clientName: '',
        payee: 'Ravi',
        amount: 8000,
        status: 'PAID',
        reference: '',
      },
    ]);
  });

  // If this ever gained a way to net payouts off an order, it would be here.
  it('takes no option that would net a payout off an order', () => {
    expect(payoutRows.length).toBe(1);
  });
});

describe('GST summary', () => {
  const line = (over: Partial<Parameters<typeof gstSummaryRows>[0][number]>) => ({
    ratePct: 18,
    taxableValue: 100_000,
    cgst: 9000,
    sgst: 9000,
    igst: 0,
    ...over,
  });

  it('groups by slab, supply and HSN', () => {
    const rows = gstSummaryRows([
      line({ hsn: '4412', buyerGstin: '09ABCDE1234F1Z5' }),
      line({ hsn: '4412', buyerGstin: '09ABCDE1234F1Z5' }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].taxableValue).toBe(200_000);
    expect(rows[0].tax).toBe(36_000);
  });

  // Decided by the GSTIN the document recorded, so the return matches the
  // invoices behind it.
  it('splits B2B from B2C on whether the buyer had a GSTIN', () => {
    const rows = gstSummaryRows([
      line({ buyerGstin: '09ABCDE1234F1Z5', hsn: '4412' }),
      line({ buyerGstin: null, hsn: '4412' }),
    ]);

    expect(rows.map((r) => r.supply).sort()).toEqual(['B2B', 'B2C']);
  });

  it('treats an empty GSTIN as B2C', () => {
    expect(gstSummaryRows([line({ buyerGstin: '   ' })])[0].supply).toBe('B2C');
  });

  it('keeps interstate tax in its own column', () => {
    const [row] = gstSummaryRows([line({ cgst: 0, sgst: 0, igst: 18_000 })]);

    expect([row.cgst, row.sgst, row.igst]).toEqual([0, 0, 18_000]);
    expect(row.tax).toBe(18_000);
  });

  it('orders the highest slab first', () => {
    const rows = gstSummaryRows([line({ ratePct: 5 }), line({ ratePct: 18 }), line({ ratePct: 12 })]);

    expect(rows.map((r) => r.slab)).toEqual(['18%', '12%', '5%']);
  });
});

describe('order register', () => {
  it('counts days in the current stage, not age', () => {
    const [row] = orderRegisterRows(
      [
        {
          code: 'ORD-1',
          clientName: 'Sharma Interiors',
          status: 'CUTTING',
          statusSince: '2026-04-01',
          createdAt: '2026-01-01',
          total: 118_000,
          received: 50_000,
        },
      ],
      new Date('2026-04-11T00:00:00'),
    );

    expect(row.daysInStage).toBe(10);
    expect(row.age).toBe(100);
    expect(row.due).toBe(68_000);
  });

  // A bare date string is parsed as UTC and a dated one as local, so counting
  // in milliseconds is out by the offset — in IST, enough to lose a day.
  it('counts calendar days, whichever way the dates were written', () => {
    const [bare] = orderRegisterRows(
      [{ code: 'A', clientName: 'C', status: 'CUTTING', statusSince: '2026-04-01',
         createdAt: '2026-04-01', total: 0, received: 0 }],
      new Date('2026-04-11T00:00:00'),
    );
    const [dated] = orderRegisterRows(
      [{ code: 'A', clientName: 'C', status: 'CUTTING', statusSince: new Date(2026, 3, 1),
         createdAt: new Date(2026, 3, 1), total: 0, received: 0 }],
      new Date('2026-04-11T00:00:00'),
    );

    expect(bare.daysInStage).toBe(10);
    expect(dated.daysInStage).toBe(10);
  });

  // Late in the evening, IST is already the next day in UTC.
  it('does not gain a day from an evening timestamp', () => {
    const [row] = orderRegisterRows(
      [{ code: 'A', clientName: 'C', status: 'CUTTING', statusSince: new Date(2026, 3, 1, 21, 30),
         createdAt: new Date(2026, 3, 1), total: 0, received: 0 }],
      new Date(2026, 3, 2, 9, 0),
    );

    expect(row.daysInStage).toBe(1);
  });
});

describe('totals', () => {
  it('sums the money columns it is given', () => {
    const totals = totalsFor(
      [
        { amount: 100.1, tax: 18.02 },
        { amount: 200.2, tax: 36.04 },
      ],
      ['amount', 'tax'],
    );

    expect(totals).toEqual({ amount: 300.3, tax: 54.06 });
  });
});
