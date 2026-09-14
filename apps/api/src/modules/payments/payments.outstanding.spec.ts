import { PaymentsService } from './payments.service';
import { prismaMock, notificationsMock, ledgerMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  return {
    service: new PaymentsService(
      db as never,
      notificationsMock() as never,
      ledgerMock() as never,
    ),
    db,
  };
}

/*
 * What the shop is owed.
 *
 * It appeared on no screen. The owner who trialled this added it up on paper
 * — 43,200 + 16,200 + 25,000 — which is the number a shop checks before it
 * decides whether to trust a book at all.
 */
describe('outstanding', () => {
  const order = (over: Record<string, unknown> = {}) => ({
    id: 'o1',
    code: 'ORD-1',
    grandTotal: 43200,
    client: { id: 'c1', code: 'CL-1', name: 'Priya Mehta' },
    payments: [],
    ...over,
  });

  function withOrders(rows: unknown[]) {
    const { service, db } = build();
    db.order.findMany = jest.fn(async () => rows);
    return { service, db };
  }

  it('adds up what every order is short by', async () => {
    const { service } = withOrders([
      order({ grandTotal: 43200 }),
      order({ id: 'o2', grandTotal: 16200 }),
      order({ id: 'o3', grandTotal: 25000 }),
    ]);

    const result = await service.outstanding();

    expect(result.owed).toBe(84400);
    expect(result.orders).toBe(3);
  });

  it('counts what has been paid, so a part payment leaves the rest', async () => {
    const { service } = withOrders([
      order({ grandTotal: 43200, payments: [{ amount: 20000 }, { amount: 3200 }] }),
    ]);

    expect((await service.outstanding()).owed).toBe(20000);
  });

  /*
   * A receipt that was taken back is its own negative row, so the sum is the
   * net. Counting the original alone would say a debt had been settled when
   * the money went straight back out.
   */
  it('treats a receipt that was taken back as never received', async () => {
    const { service } = withOrders([
      order({ grandTotal: 43200, payments: [{ amount: 20000 }, { amount: -20000 }] }),
    ]);

    expect((await service.outstanding()).owed).toBe(43200);
  });

  it('says nothing is owed on an order paid in full', async () => {
    const { service } = withOrders([order({ payments: [{ amount: 43200 }] })]);

    const result = await service.outstanding();

    expect(result.owed).toBe(0);
    expect(result.orders).toBe(0);
    expect(result.clients).toEqual([]);
  });

  /*
   * The netting that must not happen. A shop short ₹1,000 on one order and
   * holding ₹500 too much on another is owed a thousand rupees and separately
   * holds five hundred that is not its own. One figure of ₹500 would report a
   * debt as smaller than it is.
   */
  it('keeps money held apart from money owed, rather than netting them', async () => {
    const { service } = withOrders([
      order({ grandTotal: 1000, payments: [] }),
      order({ id: 'o2', grandTotal: 1000, payments: [{ amount: 1500 }] }),
    ]);

    const result = await service.outstanding();

    expect(result.owed).toBe(1000);
    expect(result.held).toBe(500);
    expect(result.orders).toBe(1);
  });

  it('leaves a cancelled order out — the work is not happening', async () => {
    const { service, db } = withOrders([order()]);

    await service.outstanding();

    expect(db.order.findMany.mock.calls[0][0].where).toMatchObject({
      status: { category: { not: 'CANCELLED' } },
    });
  });

  /*
   * The owner's actual complaint: three orders split over two client records
   * and no screen anywhere saying what one person owed.
   */
  describe('by client', () => {
    it('adds a client’s orders together', async () => {
      const { service } = withOrders([
        order({ grandTotal: 43200 }),
        order({ id: 'o2', grandTotal: 25000 }),
      ]);

      const [priya] = (await service.outstanding()).clients;

      expect(priya).toMatchObject({ name: 'Priya Mehta', owed: 68200, orders: 2 });
    });

    it('puts whoever owes most first', async () => {
      const { service } = withOrders([
        order({ grandTotal: 1000 }),
        order({
          id: 'o2',
          grandTotal: 90000,
          client: { id: 'c2', code: 'CL-2', name: 'Sunil Kadam' },
        }),
      ]);

      expect((await service.outstanding()).clients.map((row: { name: string }) => row.name)).toEqual([
        'Sunil Kadam',
        'Priya Mehta',
      ]);
    });

    it('leaves out a client who owes nothing', async () => {
      const { service } = withOrders([
        order({ payments: [{ amount: 43200 }] }),
        order({
          id: 'o2',
          grandTotal: 5000,
          client: { id: 'c2', code: 'CL-2', name: 'Sunil Kadam' },
        }),
      ]);

      expect((await service.outstanding()).clients.map((row: { name: string }) => row.name)).toEqual([
        'Sunil Kadam',
      ]);
    });
  });

  it('answers zero for a shop that has invoiced nothing', async () => {
    const { service } = withOrders([]);

    expect(await service.outstanding()).toEqual({ owed: 0, orders: 0, held: 0, clients: [] });
  });

  it('reads a Decimal that arrives as a string', async () => {
    const { service } = withOrders([
      order({ grandTotal: '43200.00', payments: [{ amount: '20000.00' }] }),
    ]);

    expect((await service.outstanding()).owed).toBe(23200);
  });
});
