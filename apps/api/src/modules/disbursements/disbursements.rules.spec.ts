import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DisbursementStatus, PaymentMode } from '@prisma/client';
import { DisbursementsService } from './disbursements.service';
import { inTenant, prismaMock, ledgerMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  // The database hands back the row it updated, and the service posts a
  // settled payout to the ledger.
  db.disbursement.update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'd1',
    orderId: 'o1',
    amount: 12000,
    payeeName: 'Ramesh',
    category: null,
    ...data,
  }));
  db.order.findFirst = jest.fn(async () => ({ id: 'o1', code: 'ORD-1' }));
  // Prisma hands a created row back, and the reversal posts the row it made.
  db.disbursement.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'd2',
    category: null,
    ...data,
  }));
  const ledger = ledgerMock();
  return { service: new DisbursementsService(db as never, ledger as never), db, ledger };
}

describe('label', () => {
  it('falls back to ISC when the tenant has not named these charges', async () => {
    const { service } = build();
    await expect(service.label()).resolves.toBe('ISC');
  });

  it('uses the tenant’s own word for them', async () => {
    const { service, db } = build();
    db.appSetting.findFirst = jest.fn(async () => ({ value: 'Site charges' }));
    await expect(service.label()).resolves.toBe('Site charges');
  });

  it('ignores a setting that is not a string', async () => {
    const { service, db } = build();
    db.appSetting.findFirst = jest.fn(async () => ({ value: { en: 'ISC' } }));
    await expect(service.label()).resolves.toBe('ISC');
  });

  it('stores the label against this tenant only', async () => {
    const { service, db } = build();
    await inTenant(() => service.setLabel('Site charges'));
    expect(db.appSetting.upsert.mock.calls[0][0].where).toEqual({
      tenantId_key: { tenantId: 'tenant-test', key: 'disbursementLabel' },
    });
  });
});

describe('categories', () => {
  it('hides deactivated categories by default', async () => {
    const { service, db } = build();
    await service.listCategories();
    expect(db.disbursementCategory.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
  });

  it('upper-cases the code so the list does not fill with near-duplicates', () => {
    const { service, db } = build();
    inTenant(() => service.createCategory({ code: 'fitting', name: 'Fitting' } as never));
    expect(db.disbursementCategory.create.mock.calls[0][0].data.code).toBe('FITTING');
  });

  it('deactivates rather than deletes', async () => {
    const { service, db } = build();
    await service.deactivateCategory('cat-1');
    expect(db.disbursementCategory.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { isActive: false },
    });
  });
});

describe('create', () => {
  const dto = (over: Record<string, unknown> = {}) =>
    ({ payeeName: 'Ramesh', amount: 2500, ...over }) as never;

  it('refuses an unknown order', async () => {
    const { service, db } = build();
    db.order.findFirst = jest.fn(async () => null);
    await expect(inTenant(() => service.create('ghost', dto()))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('starts as planned when no status is given', async () => {
    const { service, db } = build();
    await inTenant(() => service.create('o1', dto()));
    const data = db.disbursement.create.mock.calls[0][0].data;
    expect(data.status).toBe(DisbursementStatus.PLANNED);
    expect(data.paidAt).toBeNull();
  });

  it('refuses to record a payout as paid without saying how', async () => {
    const { service } = build();
    await expect(
      inTenant(() => service.create('o1', dto({ status: DisbursementStatus.PAID }))),
    ).rejects.toThrow(/cash or online/);
  });

  it('stamps the payment time when one is not supplied', async () => {
    const { service, db } = build();
    await inTenant(() =>
      service.create(
        'o1',
        dto({ status: DisbursementStatus.PAID, paidMode: PaymentMode.CASH }),
      ),
    );
    expect(db.disbursement.create.mock.calls[0][0].data.paidAt).toBeInstanceOf(Date);
  });

  it('honours a back-dated payment', async () => {
    const { service, db } = build();
    await inTenant(() =>
      service.create(
        'o1',
        dto({
          status: DisbursementStatus.PAID,
          paidMode: PaymentMode.CASH,
          paidAt: '2026-08-01',
        }),
      ),
    );
    expect(db.disbursement.create.mock.calls[0][0].data.paidAt).toEqual(new Date('2026-08-01'));
  });

  it('never touches the order it hangs off', async () => {
    const { service, db } = build();
    await inTenant(() => service.create('o1', dto()));
    // An order quoted at ₹X is worth ₹X and is settled when ₹X is collected;
    // what the shop then owes a fitter is a separate obligation.
    expect(db.order.update).not.toHaveBeenCalled();
  });
});

describe('settle', () => {
  it('refuses a payout that is already settled', async () => {
    const { service, db } = build();
    db.disbursement.findFirst = jest.fn(async () => ({
      id: 'd1',
      status: DisbursementStatus.PAID,
    }));
    await expect(
      service.settle('d1', { paidMode: PaymentMode.CASH } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports a missing payout', async () => {
    const { service } = build();
    await expect(
      service.settle('ghost', { paidMode: PaymentMode.CASH } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks it paid and stamps the time', async () => {
    const { service, db } = build();
    db.disbursement.findFirst = jest.fn(async () => ({
      id: 'd1',
      status: DisbursementStatus.PLANNED,
      note: 'Fitting',
      recordedById: 'u1',
    }));
    await service.settle('d1', { paidMode: PaymentMode.ONLINE, reference: 'UTR1' } as never);
    expect(db.disbursement.update.mock.calls[0][0].data).toMatchObject({
      status: DisbursementStatus.PAID,
      paidMode: PaymentMode.ONLINE,
      reference: 'UTR1',
    });
  });

  it('keeps the existing note and recorder when settling adds neither', async () => {
    const { service, db } = build();
    db.disbursement.findFirst = jest.fn(async () => ({
      id: 'd1',
      status: DisbursementStatus.PLANNED,
      note: 'Fitting at site',
      recordedById: 'u1',
    }));
    await service.settle('d1', { paidMode: PaymentMode.CASH } as never);
    expect(db.disbursement.update.mock.calls[0][0].data).toMatchObject({
      note: 'Fitting at site',
      recordedById: 'u1',
    });
  });

  it('leaves the order alone', async () => {
    const { service, db } = build();
    db.disbursement.findFirst = jest.fn(async () => ({
      id: 'd1',
      status: DisbursementStatus.PLANNED,
    }));
    await service.settle('d1', { paidMode: PaymentMode.CASH } as never);
    expect(db.order.update).not.toHaveBeenCalled();
  });
});

describe('update and remove', () => {
  it('refuses to edit a missing payout', async () => {
    const { service } = build();
    await expect(service.update('ghost', {} as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancels rather than deletes', async () => {
    const { service, db } = build();
    db.disbursement.findFirst = jest.fn(async () => ({ id: 'd1' }));
    await service.remove('d1');
    // A payout the shop decided against is still something it decided.
    expect(db.disbursement.update.mock.calls[0][0].data).toEqual({
      status: DisbursementStatus.CANCELLED,
    });
    expect(db.disbursement.delete).not.toHaveBeenCalled();
  });

  it('will not cancel a payout that has already been paid', async () => {
    const { service, db } = build();
    db.disbursement.findFirst = jest.fn(async () => ({
      id: 'd1',
      status: DisbursementStatus.PAID,
    }));
    // The money left the drawer and the ledger says so. Cancelling here would
    // take it off this screen while the books went on counting it as spent.
    await expect(service.remove('d1')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.disbursement.update).not.toHaveBeenCalled();
  });

  it('refuses to remove a missing payout', async () => {
    const { service } = build();
    await expect(service.remove('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('forOrder', () => {
  const rows = [
    { id: 'd1', amount: 2500, status: DisbursementStatus.PAID },
    { id: 'd2', amount: 1800, status: DisbursementStatus.PLANNED },
  ];

  it('excludes cancelled payouts from the list it returns', async () => {
    const { service, db } = build();
    await inTenant(() => service.forOrder('o1'));
    expect(db.disbursement.findMany.mock.calls[0][0].where.status).toEqual({
      not: DisbursementStatus.CANCELLED,
    });
  });

  it('splits the committed figure into paid and pending', async () => {
    const { service, db } = build();
    db.disbursement.findMany = jest.fn(async () => rows);
    const summary = await inTenant(() => service.forOrder('o1'));
    expect(summary).toMatchObject({ total: 4300, paid: 2500, pending: 1800, count: 2 });
  });

  it('carries the tenant’s label so the screen can name the section', async () => {
    const { service, db } = build();
    db.appSetting.findFirst = jest.fn(async () => ({ value: 'Site charges' }));
    const summary = await inTenant(() => service.forOrder('o1'));
    expect(summary.label).toBe('Site charges');
  });

  it('reports an unknown order', async () => {
    const { service, db } = build();
    db.order.findFirst = jest.fn(async () => null);
    await expect(inTenant(() => service.forOrder('ghost'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ledger totals', () => {
  const query = (over: Record<string, unknown> = {}) =>
    ({ skip: 0, limit: 20, page: 1, ...over }) as never;

  it('describes the whole filtered ledger, not the page in hand', async () => {
    const { service, db } = build();
    db.disbursement.aggregate = jest.fn(async () => ({
      _sum: { amount: 12000 },
      _count: 7,
    }));
    db.disbursement.count = jest.fn(async () => 7);
    const page = await inTenant(() => service.ledger(query()));
    // A per-page sum would silently change as the accountant scrolled.
    expect(page.totals).toMatchObject({ count: 7 });
  });

  it('never reports a negative pending figure from a mismatched filter', async () => {
    const { service, db } = build();
    let call = 0;
    db.disbursement.aggregate = jest.fn(async () => {
      call += 1;
      return call === 1
        ? { _sum: { amount: 4300 }, _count: 2 }
        : { _sum: { amount: 2500 } };
    });
    const page = await inTenant(() => service.ledger(query({ status: 'CANCELLED' })));
    expect(page.totals).toMatchObject({ total: 4300, paid: 2500, pending: 1800 });
  });

  it('asks for the paid subset as an intersection of the same view', async () => {
    const { service, db } = build();
    await inTenant(() => service.ledger(query({ categoryId: 'cat-1' })));
    const paidWhere = db.disbursement.aggregate.mock.calls[1][0].where;
    expect(paidWhere.AND[1]).toEqual({ status: DisbursementStatus.PAID });
    expect(paidWhere.AND[0].categoryId).toBe('cat-1');
  });

  it('reports zeroes rather than NaN for an empty ledger', async () => {
    const { service } = build();
    const page = await inTenant(() => service.ledger(query()));
    expect(page.totals).toMatchObject({ total: 0, paid: 0, pending: 0 });
  });

  it('counts against the same filter it lists with', async () => {
    const { service, db } = build();
    await inTenant(() => service.ledger(query({ search: 'Ramesh' })));
    expect(db.disbursement.count.mock.calls[0][0].where).toEqual(
      db.disbursement.findMany.mock.calls[0][0].where,
    );
  });
});

describe('taking a settled payout back', () => {
  const PAID = {
    id: 'd1',
    orderId: 'o1',
    categoryId: 'c1',
    payeeName: 'Ramesh',
    payeeContact: null,
    amount: 4500,
    status: DisbursementStatus.PAID,
    paidMode: 'CASH',
    paidAt: new Date('2026-09-02'),
    reference: null,
    reversalOfId: null,
    reversedBy: null,
  };

  it('records the opposite row rather than editing the first', async () => {
    const { service, db } = build();
    db.disbursement.findFirst = jest.fn(async () => PAID);
    await inTenant(() => service.reverse('d1', 'Paid the wrong fitter', 'u1'));
    expect(db.disbursement.create.mock.calls[0][0].data).toMatchObject({
      amount: -4500,
      reversalOfId: 'd1',
      reason: 'Paid the wrong fitter',
      recordedById: 'u1',
    });
  });

  it('marks the correction paid, not planned', async () => {
    const { service, db } = build();
    db.disbursement.findFirst = jest.fn(async () => PAID);
    await inTenant(() => service.reverse('d1', 'Paid the wrong fitter'));
    // A planned one would sit in the "still owed" column claiming the shop
    // owes somebody a negative amount.
    expect(db.disbursement.create.mock.calls[0][0].data.status).toBe(DisbursementStatus.PAID);
  });

  it('posts it, so the money comes back to the drawer it left', async () => {
    const { service, db, ledger } = build();
    db.disbursement.findFirst = jest.fn(async () => PAID);
    await inTenant(() => service.reverse('d1', 'Paid the wrong fitter'));
    expect(ledger.post.mock.calls[0][0]).toMatchObject({ amount: -4500, direction: 'OUT' });
  });

  it('refuses one that was only ever planned', async () => {
    const { service, db } = build();
    db.disbursement.findFirst = jest.fn(async () => ({
      ...PAID,
      status: DisbursementStatus.PLANNED,
    }));
    // An intention is not a movement of money; there is nothing to take back.
    await expect(
      inTenant(() => service.reverse('d1', 'Changed our mind')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('will not take the same payout back twice', async () => {
    const { service, db } = build();
    db.disbursement.findFirst = jest.fn(async () => ({ ...PAID, reversedBy: { id: 'd2' } }));
    await expect(
      inTenant(() => service.reverse('d1', 'Paid the wrong fitter')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('will not reverse a correction, because that is paying it again', async () => {
    const { service, db } = build();
    db.disbursement.findFirst = jest.fn(async () => ({ ...PAID, reversalOfId: 'd0' }));
    await expect(
      inTenant(() => service.reverse('d1', 'Paid the wrong fitter')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('insists on a reason', async () => {
    const { service, db } = build();
    db.disbursement.findFirst = jest.fn(async () => PAID);
    await expect(inTenant(() => service.reverse('d1', '  '))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses one that is not there', async () => {
    const { service, db } = build();
    db.disbursement.findFirst = jest.fn(async () => null);
    await expect(
      inTenant(() => service.reverse('ghost', 'Paid the wrong fitter')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
