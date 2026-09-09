import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformBillingService } from './billing.service';

const TIERS = [
  {
    key: 'shop',
    label: 'Shop',
    blurb: '',
    monthlyPrice: 8000,
    includedModules: ['orders', 'clients', 'leads', 'quotes', 'finance'],
    isActive: true,
  },
];

const PRICES = [
  { moduleKey: 'hr', monthlyPrice: 2500, isPriced: true },
  { moduleKey: 'purchasing', monthlyPrice: 2500, isPriced: true },
];

const CLIENT = {
  id: 't1',
  name: 'Decor Bucket',
  plan: 'shop',
  modules: [] as string[],
  billingDay: 7,
  contactName: 'Nakul',
  contactEmail: 'nakul@decorbucket.in',
  contactPhone: null,
};

const unique = () =>
  new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });

type Table = Record<string, jest.Mock>;

function build(tenants: Record<string, unknown>[] = [CLIENT]) {
  const db: Record<string, Table> = {
    tenant: {
      findMany: jest.fn(async () => tenants),
      findUnique: jest.fn(async () => tenants[0] ?? null),
    },
    platformInvoice: {
      create: jest.fn(async ({ data }: never) => ({ id: 'inv_1', ...(data as object) })),
      findUnique: jest.fn(async () => null),
      update: jest.fn(async ({ data }: never) => ({ id: 'inv_1', ...(data as object) })),
      findMany: jest.fn(async () => []),
    },
    platformBillingEvent: {
      create: jest.fn(async () => ({ id: 'ev_1' })),
      update: jest.fn(async () => ({ id: 'ev_1' })),
    },
  };

  const subscriptions = {
    tiers: jest.fn(async () => TIERS),
    modulePrices: jest.fn(async () => PRICES),
  };

  const razorpay = {
    configured: jest.fn(() => true),
    canVerifyWebhooks: jest.fn(() => true),
    createPaymentLink: jest.fn(async () => ({ id: 'plink_1', shortUrl: 'https://rzp.io/i/abc' })),
    cancelPaymentLink: jest.fn(async () => undefined),
  };

  const service = new PlatformBillingService(
    { platform: db } as never,
    subscriptions as never,
    razorpay as never,
  );
  return { service, db, razorpay };
}

/** What a Prisma write was asked to do, as the test wants to read it. */
const wrote = (mock: jest.Mock, call = 0): Record<string, never> =>
  (mock.mock.calls[call]?.[0] as { data: Record<string, never> })?.data;

const SEPTEMBER = new Date(Date.UTC(2026, 8, 20));

describe('which month a bill is for', () => {
  it('is the first of it, in UTC', () => {
    expect(PlatformBillingService.periodOf(SEPTEMBER).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });

  // A local-time month boundary puts a bill written at 03:45 IST on the 1st
  // into the previous month, and the invoice for the month it was meant for
  // then collides with it.
  it('does not slip a month for a run just after midnight IST', () => {
    const justAfterMidnightIst = new Date('2026-09-01T18:31:00.000Z');

    expect(PlatformBillingService.periodOf(justAfterMidnightIst).toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
  });
});

describe('writing the month’s bills', () => {
  it('bills a workspace whose day has come', async () => {
    const { service, db } = build();
    const result = await service.runBilling(SEPTEMBER);

    expect(result.written).toBe(1);
    expect(Number(wrote(db.platformInvoice.create).amount)).toBe(8000);
  });

  it('adds what they hold on top of the tier', async () => {
    const { service, db } = build([{ ...CLIENT, modules: ['hr', 'purchasing'] }]);
    await service.runBilling(SEPTEMBER);

    expect(Number(wrote(db.platformInvoice.create).amount)).toBe(13000);
  });

  it('leaves it a draft — sending it is a decision somebody takes', async () => {
    const { service, db } = build();
    await service.runBilling(SEPTEMBER);

    expect(wrote(db.platformInvoice.create).status).toBe('DRAFT');
  });

  // The lines are frozen in. Recomputing a March bill from today's price list
  // restates what somebody was charged in March.
  it('freezes what the bill was made of into the row', async () => {
    const { service, db } = build([{ ...CLIENT, modules: ['hr'] }]);
    await service.runBilling(SEPTEMBER);

    const lines = wrote(db.platformInvoice.create).lines as unknown as {
      kind: string;
      label: string;
      amount: number;
    }[];
    expect(lines.map((one) => [one.label, one.amount])).toEqual([
      ['Shop', 8000],
      ['People', 2500],
    ]);
  });

  it('does not bill somebody whose day has not come yet', async () => {
    const { service, db } = build([{ ...CLIENT, billingDay: 28 }]);
    const result = await service.runBilling(SEPTEMBER);

    expect(result.written).toBe(0);
    expect(db.platformInvoice.create).not.toHaveBeenCalled();
  });

  // Catching up is the point of running daily: an instance down on the 7th
  // must still bill on the 8th.
  it('catches up a day that has already passed this month', async () => {
    const { service } = build([{ ...CLIENT, billingDay: 3 }]);

    await expect(service.runBilling(SEPTEMBER)).resolves.toEqual({ written: 1, skipped: 0 });
  });

  /*
   * The whole defence against double billing, and it is the database's, not
   * this code's. Two instances waking on the same morning is the normal case.
   */
  it('treats a month already billed as done, not as a failure', async () => {
    const { service, db } = build();
    db.platformInvoice.create = jest.fn(async () => {
      throw unique();
    });

    await expect(service.runBilling(SEPTEMBER)).resolves.toEqual({ written: 0, skipped: 0 });
  });

  it('still raises anything that is not a duplicate', async () => {
    const { service, db } = build();
    db.platformInvoice.create = jest.fn(async () => {
      throw new Error('the database is on fire');
    });

    await expect(service.runBilling(SEPTEMBER)).rejects.toThrow(/on fire/);
  });

  // A workspace nobody has finished setting up. Billing it on whatever day the
  // job happened to run would set its billing date by accident.
  it('skips a workspace with no billing day rather than guessing one', async () => {
    const { service, db } = build([{ ...CLIENT, billingDay: null }]);

    await expect(service.runBilling(SEPTEMBER)).resolves.toEqual({ written: 0, skipped: 1 });
    expect(db.platformInvoice.create).not.toHaveBeenCalled();
  });

  // A demand for nothing reads to a client as a mistake we made.
  it('writes no invoice for a workspace that owes nothing', async () => {
    const { service, db } = build([{ ...CLIENT, plan: null, modules: [] }]);

    await expect(service.runBilling(SEPTEMBER)).resolves.toEqual({ written: 0, skipped: 1 });
    expect(db.platformInvoice.create).not.toHaveBeenCalled();
  });

  /*
   * Ours is ACTIVE and on every module, which is exactly what a paying client
   * looks like from here. Asked of the database rather than filtered
   * afterwards, so a new caller cannot forget.
   */
  it('never asks the database for a workspace of our own', async () => {
    const { service, db } = build();
    await service.runBilling(SEPTEMBER);

    expect((db.tenant.findMany.mock.calls[0][0] as { where: unknown }).where).toEqual({
      isInternal: false,
      status: 'ACTIVE',
    });
  });
});

describe('sending a bill', () => {
  const issued = (over: Record<string, unknown> = {}) => ({
    id: 'inv_1',
    tenantId: 't1',
    period: new Date(Date.UTC(2026, 8, 1)),
    amount: 8000,
    status: 'DRAFT',
    razorpayLinkId: null,
    ...over,
  });

  it('says so when there is no such invoice', async () => {
    const { service } = build();
    await expect(service.issue('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to send one that is already paid', async () => {
    const { service, db } = build();
    db.platformInvoice.findUnique = jest.fn(async () => issued({ status: 'PAID' }));

    await expect(service.issue('inv_1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to send one that was withdrawn', async () => {
    const { service, db } = build();
    db.platformInvoice.findUnique = jest.fn(async () => issued({ status: 'VOID' }));

    await expect(service.issue('inv_1')).rejects.toThrow(/cancelled/);
  });

  it('records where the client pays', async () => {
    const { service, db } = build();
    db.platformInvoice.findUnique = jest.fn(async () => issued());

    await service.issue('inv_1');

    expect(wrote(db.platformInvoice.update)).toMatchObject({
      status: 'ISSUED',
      razorpayLinkId: 'plink_1',
      paymentUrl: 'https://rzp.io/i/abc',
    });
  });

  /*
   * A live link nobody can reconcile is worse than no link: the client pays,
   * the webhook arrives, and it is about an invoice that never learned it was
   * sent.
   */
  it('cancels the link when it cannot record it', async () => {
    const { service, db, razorpay } = build();
    db.platformInvoice.findUnique = jest.fn(async () => issued());
    db.platformInvoice.update = jest.fn(async () => {
      throw new Error('write failed');
    });

    await expect(service.issue('inv_1')).rejects.toThrow(/write failed/);
    expect(razorpay.cancelPaymentLink).toHaveBeenCalledWith('plink_1');
  });
});

describe('withdrawing a bill', () => {
  it('refuses to un-bill one that was paid', async () => {
    const { service, db } = build();
    db.platformInvoice.findUnique = jest.fn(async () => ({
      id: 'inv_1',
      status: 'PAID',
      razorpayLinkId: null,
    }));

    await expect(service.voidInvoice('inv_1', 'a mistake')).rejects.toThrow(/refunded, not/);
  });

  it('cancels the link so nobody pays a bill we withdrew', async () => {
    const { service, db, razorpay } = build();
    db.platformInvoice.findUnique = jest.fn(async () => ({
      id: 'inv_1',
      status: 'ISSUED',
      razorpayLinkId: 'plink_1',
    }));

    await service.voidInvoice('inv_1', 'billed the wrong tier');

    expect(razorpay.cancelPaymentLink).toHaveBeenCalledWith('plink_1');
    expect(wrote(db.platformInvoice.update).status).toBe('VOID');
  });

  // Somebody has to know the link is still live; the bill is still withdrawn.
  it('still withdraws it when the link will not cancel', async () => {
    const { service, db, razorpay } = build();
    db.platformInvoice.findUnique = jest.fn(async () => ({
      id: 'inv_1',
      status: 'ISSUED',
      razorpayLinkId: 'plink_1',
    }));
    razorpay.cancelPaymentLink = jest.fn(async () => {
      throw new Error('gateway down');
    });

    await service.voidInvoice('inv_1', 'billed the wrong tier');

    expect(wrote(db.platformInvoice.update).status).toBe('VOID');
  });
});

describe('a webhook from Razorpay', () => {
  const paid = (amountPaise: number, reference = 'inv_1') => ({
    payment_link: { entity: { id: 'plink_1', reference_id: reference, amount: amountPaise } },
    payment: { entity: { id: 'pay_1', amount: amountPaise } },
  });

  const owing = (over: Record<string, unknown> = {}) => ({
    id: 'inv_1',
    tenantId: 't1',
    amount: 8000,
    status: 'ISSUED',
    ...over,
  });

  it('records a payment that covers the bill', async () => {
    const { service, db } = build();
    db.platformInvoice.findUnique = jest.fn(async () => owing());

    const result = await service.handleWebhook({
      eventId: 'ev_1',
      event: 'payment_link.paid',
      payload: paid(800000),
    });

    expect(result.handled).toBe(true);
    expect(wrote(db.platformInvoice.update)).toMatchObject({
      status: 'PAID',
      razorpayPaymentId: 'pay_1',
    });
  });

  /*
   * The rule the whole product is built on, applied to our own book. Marking
   * this paid would report an invoice as settled for less than was collected.
   * It is recorded, and it stays owing.
   */
  it('never calls a part payment a paid invoice', async () => {
    const { service, db } = build();
    db.platformInvoice.findUnique = jest.fn(async () => owing());

    const result = await service.handleWebhook({
      eventId: 'ev_1',
      event: 'payment_link.paid',
      payload: paid(500000),
    });

    expect(result.reason).toBe('short payment');
    const written = wrote(db.platformInvoice.update);
    expect(written.status).toBe('FAILED');
    expect(String(written.failureReason)).toMatch(/Paid ₹5000 against ₹8000/);
    expect(String(written.failureReason)).toMatch(/Still owing ₹3000/);
  });

  it('accepts an overpayment as settled rather than refusing it', async () => {
    const { service, db } = build();
    db.platformInvoice.findUnique = jest.fn(async () => owing());

    await service.handleWebhook({
      eventId: 'ev_1',
      event: 'payment_link.paid',
      payload: paid(900000),
    });

    expect(wrote(db.platformInvoice.update).status).toBe('PAID');
  });

  /*
   * Razorpay retries anything it did not get a 2xx for, and will send the same
   * event several times. Acting once is a property of the unique index, not of
   * hoping deliveries arrive in order.
   */
  it('acts on a delivery it has already seen exactly not at all', async () => {
    const { service, db } = build();
    db.platformBillingEvent.create = jest.fn(async () => {
      throw unique();
    });

    const result = await service.handleWebhook({
      eventId: 'ev_1',
      event: 'payment_link.paid',
      payload: paid(800000),
    });

    expect(result).toEqual({ handled: false, reason: 'already seen' });
    expect(db.platformInvoice.update).not.toHaveBeenCalled();
  });

  it('does not pay an invoice twice even if the id is new', async () => {
    const { service, db } = build();
    db.platformInvoice.findUnique = jest.fn(async () => owing({ status: 'PAID' }));

    const result = await service.handleWebhook({
      eventId: 'ev_2',
      event: 'payment_link.paid',
      payload: paid(800000),
    });

    expect(result.reason).toBe('already paid');
    expect(db.platformInvoice.update).not.toHaveBeenCalled();
  });

  it('marks a failed attempt without withdrawing the bill', async () => {
    const { service, db } = build();
    db.platformInvoice.findUnique = jest.fn(async () => owing());

    await service.handleWebhook({
      eventId: 'ev_1',
      event: 'payment.failed',
      payload: {
        payment_link: { entity: { reference_id: 'inv_1' } },
        payment: { entity: { error_description: 'card declined' } },
      },
    });

    expect(wrote(db.platformInvoice.update)).toMatchObject({
      status: 'FAILED',
      failureReason: 'card declined',
    });
  });

  it('leaves a paid invoice alone when a late failure arrives', async () => {
    const { service, db } = build();
    db.platformInvoice.findUnique = jest.fn(async () => owing({ status: 'PAID' }));

    const result = await service.handleWebhook({
      eventId: 'ev_1',
      event: 'payment.failed',
      payload: { payment_link: { entity: { reference_id: 'inv_1' } } },
    });

    expect(result.handled).toBe(false);
    expect(db.platformInvoice.update).not.toHaveBeenCalled();
  });

  it('does nothing with an event about an invoice we do not have', async () => {
    const { service, db } = build();
    db.platformInvoice.findUnique = jest.fn(async () => null);

    const result = await service.handleWebhook({
      eventId: 'ev_1',
      event: 'payment_link.paid',
      payload: paid(800000, 'someone-elses'),
    });

    expect(result).toEqual({ handled: false, reason: 'no such invoice' });
  });

  it('does nothing with an event carrying no reference at all', async () => {
    const { service } = build();

    const result = await service.handleWebhook({
      eventId: 'ev_1',
      event: 'payment_link.paid',
      payload: { payment_link: { entity: {} } },
    });

    expect(result.reason).toBe('no invoice reference');
  });

  it('ignores a kind of event we do not act on', async () => {
    const { service, db } = build();
    db.platformInvoice.findUnique = jest.fn(async () => owing());

    const result = await service.handleWebhook({
      eventId: 'ev_1',
      event: 'refund.created',
      payload: paid(800000),
    });

    expect(result.reason).toBe('not a kind we act on');
    expect(db.platformInvoice.update).not.toHaveBeenCalled();
  });

  /*
   * Re-raising would make Razorpay retry, which for a bug in our own code
   * retries the bug every hour. It is recorded, unhandled, with why.
   */
  it('records a failure to act rather than asking to be sent it again', async () => {
    const { service, db } = build();
    db.platformInvoice.findUnique = jest.fn(async () => {
      throw new Error('the database is on fire');
    });

    const result = await service.handleWebhook({
      eventId: 'ev_1',
      event: 'payment_link.paid',
      payload: paid(800000),
    });

    expect(result).toEqual({ handled: false, reason: 'failed' });
    expect(wrote(db.platformBillingEvent.update)).toMatchObject({
      error: expect.stringContaining('on fire'),
    });
  });

  // When a payment and our record disagree, the only useful evidence is what
  // they actually sent.
  it('keeps the payload whole', async () => {
    const { service, db } = build();
    db.platformInvoice.findUnique = jest.fn(async () => owing());

    await service.handleWebhook({
      eventId: 'ev_1',
      event: 'payment_link.paid',
      payload: paid(800000),
    });

    expect(wrote(db.platformBillingEvent.create).payload).toEqual(paid(800000));
  });
});

describe('whether a gateway is connected', () => {
  it('says so plainly, so a screen need not pretend', () => {
    const { service } = build();

    expect(service.gateway()).toEqual({
      provider: 'razorpay',
      connected: true,
      webhooksVerifiable: true,
    });
  });
});
