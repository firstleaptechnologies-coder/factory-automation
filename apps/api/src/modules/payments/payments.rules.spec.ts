import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentMode } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { inTenant, prismaMock, notificationsMock, ledgerMock } from '../../../test/prisma-mock';

/** The ledger the service posted to, for the tests that care. */
let posted: ReturnType<typeof ledgerMock>;

function serviceWithOrder(order: unknown) {
  const db = prismaMock();
  (db as never as Record<string, Record<string, jest.Mock>>).order.findUnique =
    jest.fn(async () => order);
  // The database hands back the row it made, and the service posts it to the
  // ledger — so the stand-in has to hand one back too.
  (db as never as Record<string, Record<string, jest.Mock>>).payment.create = jest.fn(
    async ({ data }: { data: Record<string, unknown> }) => {
      // Prisma hands back nested creates as the rows they became, not as the
      // instruction that made them.
      const nested = (data.deposits as { create?: unknown } | undefined)?.create;
      const made = nested ? ([] as Record<string, unknown>[]).concat(nested as never) : [];
      return {
        ...data,
        id: 'created',
        receivedAt: new Date('2026-09-08T10:00:00.000Z'),
        deposits: made.map((deposit, index) => ({
          id: `banked-${index}`,
          depositedAt: new Date('2026-09-08T16:00:00.000Z'),
          ...deposit,
        })),
      };
    },
  );
  (db as never as Record<string, Record<string, jest.Mock>>).cashDeposit.create = jest.fn(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'banked',
      depositedAt: new Date('2026-09-08T16:00:00.000Z'),
      payment: null,
      ...data,
    }),
  );
  posted = ledgerMock();
  return { service: new PaymentsService(db, notificationsMock() as never, posted as never), db } as {
    service: PaymentsService;
    db: Record<string, Record<string, jest.Mock>>;
  };
}

const ORDER = {
  id: 'order-1',
  grandTotal: 47200,
  payments: [] as { amount: number }[],
};

describe('recording a payment', () => {
  it('refuses an order that has no value yet', async () => {
    const { service } = serviceWithOrder({ ...ORDER, grandTotal: 0 });
    await expect(
      inTenant(() => service.record('order-1', { amount: 100, mode: PaymentMode.CASH } as never)),
    ).rejects.toThrow(/no value yet/);
  });

  it('refuses an order that does not exist', async () => {
    const { service } = serviceWithOrder(null);
    await expect(
      inTenant(() => service.record('nope', { amount: 100, mode: PaymentMode.CASH } as never)),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses more than is outstanding, and says how much remains', async () => {
    // Overpayment is nearly always a typo or a payment against the wrong order;
    // absorbing it makes the pending figure lie on two orders at once.
    const { service } = serviceWithOrder({ ...ORDER, payments: [{ amount: 40000 }] });
    await expect(
      inTenant(() => service.record('order-1', { amount: 10000, mode: PaymentMode.CASH } as never)),
    ).rejects.toThrow(/7200\.00 remains/);
  });

  it('allows settling the order exactly', async () => {
    const { service } = serviceWithOrder({ ...ORDER, payments: [{ amount: 40000 }] });
    await expect(
      inTenant(() => service.record('order-1', { amount: 7200, mode: PaymentMode.CASH } as never)),
    ).resolves.toBeDefined();
  });

  it('tolerates a paisa of rounding on the final payment', async () => {
    const { service } = serviceWithOrder({ ...ORDER, payments: [{ amount: 40000 }] });
    await expect(
      inTenant(() =>
        service.record('order-1', { amount: 7200.005, mode: PaymentMode.CASH } as never),
      ),
    ).resolves.toBeDefined();
  });

  it('refuses to bank an online payment, which is already in the bank', async () => {
    const { service } = serviceWithOrder(ORDER);
    await expect(
      inTenant(() =>
        service.record('order-1', {
          amount: 1000,
          mode: PaymentMode.ONLINE,
          depositedAmount: 1000,
        } as never),
      ),
    ).rejects.toThrow(/Only cash can be deposited/);
  });

  it('refuses to bank more cash than was received', async () => {
    const { service } = serviceWithOrder(ORDER);
    await expect(
      inTenant(() =>
        service.record('order-1', {
          amount: 1000,
          mode: PaymentMode.CASH,
          depositedAmount: 1500,
        } as never),
      ),
    ).rejects.toThrow(/cannot exceed the cash received/);
  });

  it('re-derives the order status from the new running total', async () => {
    const { service, db } = serviceWithOrder({ ...ORDER, payments: [{ amount: 40000 }] });
    await inTenant(() =>
      service.record('order-1', { amount: 7200, mode: PaymentMode.CASH } as never),
    );
    expect(db.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: 'RECEIVED' } }),
    );
  });

  it('records cash banked at the same moment as a deposit on the receipt', async () => {
    const { service, db } = serviceWithOrder(ORDER);
    await inTenant(() =>
      service.record('order-1', {
        amount: 15000,
        mode: PaymentMode.CASH,
        depositedAmount: 10000,
      } as never),
    );
    const created = db.payment.create.mock.calls[0][0];
    expect(created.data.deposits.create.amount).toBe(10000);
  });
});

describe('banking cash later', () => {
  function serviceWithPayment(payment: unknown) {
    const db = prismaMock() as never as Record<string, Record<string, jest.Mock>>;
    db.payment.findUnique = jest.fn(async () => payment);
    // The database hands back the row it made, and the service posts it.
    db.cashDeposit.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'banked',
      depositedAt: new Date('2026-09-08T16:00:00.000Z'),
      payment: null,
      ...data,
    }));
    return { service: new PaymentsService(db as never, notificationsMock() as never, ledgerMock() as never), db };
  }

  it('refuses to deposit against an online payment', async () => {
    const { service } = serviceWithPayment({
      id: 'p1',
      mode: PaymentMode.ONLINE,
      amount: 1000,
      deposits: [],
    });
    await expect(
      inTenant(() => service.deposit({ paymentId: 'p1', amount: 500 } as never)),
    ).rejects.toThrow(/Only a cash payment/);
  });

  it('refuses to deposit more than is still in hand, and says how much is', async () => {
    const { service } = serviceWithPayment({
      id: 'p1',
      mode: PaymentMode.CASH,
      amount: 15000,
      deposits: [{ amount: 10000 }],
    });
    await expect(
      inTenant(() => service.deposit({ paymentId: 'p1', amount: 6000 } as never)),
    ).rejects.toThrow(/5000\.00 of that payment is still in hand/);
  });

  it('allows banking exactly what is left', async () => {
    const { service } = serviceWithPayment({
      id: 'p1',
      mode: PaymentMode.CASH,
      amount: 15000,
      deposits: [{ amount: 10000 }],
    });
    await expect(
      inTenant(() => service.deposit({ paymentId: 'p1', amount: 5000 } as never)),
    ).resolves.toBeDefined();
  });

  it('refuses a deposit against a payment that does not exist', async () => {
    const { service } = serviceWithPayment(null);
    await expect(
      inTenant(() => service.deposit({ paymentId: 'nope', amount: 100 } as never)),
    ).rejects.toThrow(NotFoundException);
  });

  it('allows an unattached deposit, for cash that cannot be traced to one receipt', async () => {
    const db = prismaMock() as never as Record<string, Record<string, jest.Mock>>;
    db.cashDeposit.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'banked',
      depositedAt: new Date('2026-09-08T16:00:00.000Z'),
      payment: null,
      ...data,
    }));
    const service = new PaymentsService(
      db as never,
      notificationsMock() as never,
      ledgerMock() as never,
    );
    await expect(
      inTenant(() => service.deposit({ amount: 2500 } as never)),
    ).resolves.toBeDefined();
  });
});

/** Keeps the import honest — BadRequestException is what the rules throw. */
it('uses BadRequestException for rule violations', () => {
  expect(new BadRequestException('x')).toBeInstanceOf(BadRequestException);
});

/**
 * Taking a receipt back.
 *
 * A receipt is never edited and never deleted. These are the rules that make
 * that true — and the reason the standing constraint holds: there is no path
 * that removes a collection row, so an order cannot be made to look settled by
 * money nobody collected.
 */
describe('reversing a payment', () => {
  const PAYMENT = {
    id: 'p1',
    orderId: 'order-1',
    amount: 40000,
    mode: PaymentMode.CASH,
    reference: 'UTR-9',
    receivedAt: new Date('2026-09-01T10:00:00Z'),
    reversalOfId: null,
    reversedBy: null,
    deposits: [] as { id: string; amount: number; bankReference: string | null }[],
    order: { id: 'order-1', grandTotal: 47200, payments: [{ amount: 40000 }] },
  };

  function serviceWithPayment(over: Record<string, unknown> = {}) {
    const db = prismaMock() as never as Record<string, Record<string, jest.Mock>>;
    db.payment.findUnique = jest.fn(async () => ({ ...PAYMENT, ...over }));
    db.payment.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const nested = (data.deposits as { create?: unknown } | undefined)?.create;
      const made = nested ? ([] as Record<string, unknown>[]).concat(nested as never) : [];
      return {
        ...data,
        id: 'p2',
        receivedAt: new Date('2026-09-08T10:00:00.000Z'),
        deposits: made.map((deposit, index) => ({
          id: `unbanked-${index}`,
          depositedAt: new Date('2026-09-08T16:00:00.000Z'),
          ...deposit,
        })),
      };
    });
    return { service: new PaymentsService(db as never, notificationsMock() as never, ledgerMock() as never), db };
  }

  const reverse = (service: PaymentsService, reason = 'Entered twice') =>
    inTenant(() => service.reverse('p1', reason, 'u1'));

  it('records the opposite rather than removing the row', async () => {
    const { service, db } = serviceWithPayment();
    await reverse(service);

    expect(db.payment.delete).not.toHaveBeenCalled();
    const created = db.payment.create.mock.calls[0][0].data;
    expect(created.amount).toBe(-40000);
    expect(created.reversalOfId).toBe('p1');
    expect(created.mode).toBe(PaymentMode.CASH);
  });

  it('keeps why it was taken back, and who did it', async () => {
    const { service, db } = serviceWithPayment();
    await reverse(service, 'Client’s cheque bounced');

    const created = db.payment.create.mock.calls[0][0].data;
    expect(created.reason).toBe('Client’s cheque bounced');
    expect(created.receivedById).toBe('u1');
  });

  it('refuses without a reason', async () => {
    const { service } = serviceWithPayment();
    // A row saying money was taken back without saying why is deleting it, one
    // step removed.
    await expect(reverse(service, '   ')).rejects.toThrow(/why/i);
  });

  it('refuses to take the same receipt back twice', async () => {
    const { service } = serviceWithPayment({ reversedBy: { id: 'p9' } });
    await expect(reverse(service)).rejects.toThrow(/already been taken back/);
  });

  it('refuses to reverse a correction', async () => {
    const { service } = serviceWithPayment({ reversalOfId: 'p0' });
    await expect(reverse(service)).rejects.toThrow(/Record the payment again/);
  });

  it('un-banks the cash that had already gone to the bank', async () => {
    const { service, db } = serviceWithPayment({
      deposits: [{ id: 'd1', amount: 25000, bankReference: 'NEFT-2' }],
    });
    await reverse(service);

    // Otherwise the shop's cash position is short by money that never left the
    // drawer.
    const created = db.payment.create.mock.calls[0][0].data;
    expect(created.deposits.create).toEqual([
      expect.objectContaining({ amount: -25000, reversalOfId: 'd1', bankReference: 'NEFT-2' }),
    ]);
  });

  it('puts the order back to part-paid', async () => {
    const { service, db } = serviceWithPayment();
    await reverse(service);

    // ₹40,000 was the whole of what had been collected on a ₹47,200 order.
    expect(db.order.update.mock.calls[0][0].data.paymentStatus).toBe('PENDING');
  });

  it('leaves an order that was over-collected settled by what remains', async () => {
    const { service, db } = serviceWithPayment({
      order: { id: 'order-1', grandTotal: 47200, payments: [{ amount: 40000 }, { amount: 47200 }] },
    });
    await reverse(service);
    expect(db.order.update.mock.calls[0][0].data.paymentStatus).toBe('RECEIVED');
  });

  it('says so when the receipt is not there', async () => {
    const db = prismaMock() as never as Record<string, Record<string, jest.Mock>>;
    db.payment.findUnique = jest.fn(async () => null);
    const service = new PaymentsService(db as never, notificationsMock() as never, ledgerMock() as never);
    await expect(inTenant(() => service.reverse('nope', 'x', 'u1'))).rejects.toThrow(
      NotFoundException,
    );
  });
});


/**
 * Everything that moves money posts to the ledger.
 *
 * Not tidiness: a module that does not post is missing from Transactions and
 * from the reports, and the point of one posting layer is that it is missing
 * *visibly* rather than quietly.
 */
describe('what reaches the books', () => {
  it('posts a receipt as money in', async () => {
    const { service } = serviceWithOrder({ ...ORDER, client: { gstin: '27AAAPV1234C1ZV' } });
    await inTenant(() =>
      service.record('order-1', { amount: 7200, mode: PaymentMode.CASH } as never, 'u1'),
    );

    expect(posted.post.mock.calls[0][0]).toMatchObject({
      sourceType: 'Payment',
      direction: 'IN',
      account: 'CASH',
      amount: 7200,
      voucher: 'RECEIPT',
      orderId: 'order-1',
    });
  });

  it('posts cash banked with it as a transfer, not as an outflow', async () => {
    const { service } = serviceWithOrder(ORDER);
    await inTenant(() =>
      service.record(
        'order-1',
        { amount: 7200, mode: PaymentMode.CASH, depositedAmount: 5000 } as never,
        'u1',
      ),
    );

    // The shop has not spent it; it has only moved it.
    expect(posted.post.mock.calls[1][0]).toMatchObject({
      sourceType: 'CashDeposit',
      direction: 'TRANSFER',
      account: 'CASH',
      amount: 5000,
    });
  });

  it('posts the correction when a receipt is taken back', async () => {
    const db = prismaMock() as never as Record<string, Record<string, jest.Mock>>;
    db.payment.findUnique = jest.fn(async () => ({
      id: 'p1',
      orderId: 'order-1',
      amount: 40000,
      mode: PaymentMode.CASH,
      receivedAt: new Date('2026-09-01T10:00:00Z'),
      reversalOfId: null,
      reversedBy: null,
      deposits: [],
      order: { id: 'order-1', grandTotal: 47200, payments: [{ amount: 40000 }] },
    }));
    db.payment.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: 'p2',
      receivedAt: new Date('2026-09-08T10:00:00.000Z'),
      deposits: [],
    }));
    const ledger = ledgerMock();
    const service = new PaymentsService(
      db as never,
      notificationsMock() as never,
      ledger as never,
    );

    await inTenant(() => service.reverse('p1', 'Entered twice', 'u1'));

    // Same direction, negative amount — so every total stays a plain sum.
    expect(ledger.post.mock.calls[0][0]).toMatchObject({
      sourceType: 'Payment',
      direction: 'IN',
      amount: -40000,
      note: 'Entered twice',
    });
  });
});
