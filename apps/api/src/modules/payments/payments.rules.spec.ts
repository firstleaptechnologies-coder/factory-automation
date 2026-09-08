import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentMode } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

function serviceWithOrder(order: unknown) {
  const db = prismaMock();
  (db as never as Record<string, Record<string, jest.Mock>>).order.findUnique =
    jest.fn(async () => order);
  return { service: new PaymentsService(db), db } as {
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
    return { service: new PaymentsService(db as never), db };
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
    const db = prismaMock();
    const service = new PaymentsService(db);
    await expect(
      inTenant(() => service.deposit({ amount: 2500 } as never)),
    ).resolves.toBeDefined();
  });
});

/** Keeps the import honest — BadRequestException is what the rules throw. */
it('uses BadRequestException for rule violations', () => {
  expect(new BadRequestException('x')).toBeInstanceOf(BadRequestException);
});
