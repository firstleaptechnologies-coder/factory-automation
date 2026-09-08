import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PurchasesService, purchaseFilter, statusFor } from './purchases.service';
import { inTenant, prismaMock, ledgerMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const ITEM = {
  id: 'pi1',
  materialId: 'm1',
  thicknessId: 't1',
  unit: 'sheet',
  quantity: 10,
  rate: 900,
  taxAmount: 1620,
  receivedQuantity: 0,
  material: { id: 'm1', code: 'PLY', name: 'Plywood', stockUnit: 'sheet' },
};

const PURCHASE = {
  id: 'p1',
  code: 'PO-2627-0001',
  status: 'ORDERED',
  vendorId: 'v1',
  vendor: { id: 'v1', code: 'VEN-0001', name: 'Verma Boards', gstin: '08AAACH7409R1ZS' },
  items: [ITEM],
  total: 10620,
  taxTotal: 1620,
  otherCharges: 0,
  billNumber: null,
  paidOn: null,
};

function build(purchase: Record<string, unknown> = PURCHASE) {
  const db = prismaMock() as never as Db;
  const ledger = ledgerMock();
  const codes = { next: jest.fn(async () => 'PO-2627-0001') };

  db.purchase.findFirst = jest.fn(async () => purchase);
  db.vendor.findFirst = jest.fn(async () => ({ id: 'v1' }));
  db.material.findMany = jest.fn(async () => [{ id: 'm1' }]);
  db.purchase.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'p1',
    ...data,
    items: [],
    vendor: PURCHASE.vendor,
  }));

  return {
    service: new PurchasesService(db as never, ledger as never, codes as never),
    db,
    ledger,
  };
}

const dto = (over: Record<string, unknown> = {}) =>
  ({
    vendorId: 'v1',
    items: [{ materialId: 'm1', quantity: 10, rate: 900, taxAmount: 1620 }],
    ...over,
  }) as never;

describe('writing an order', () => {
  it('starts as a draft, because a list on the phone is still being changed', async () => {
    const { service, db } = build();
    await inTenant(() => service.create(dto()));
    expect(db.purchase.create.mock.calls[0][0].data.status).toBeUndefined();
  });

  it('totals the lines and whatever else is on the bill', async () => {
    const { service, db } = build();
    await inTenant(() => service.create(dto({ otherCharges: 350 })));
    expect(db.purchase.create.mock.calls[0][0].data).toMatchObject({
      subtotal: 9000,
      taxTotal: 1620,
      total: 10970,
    });
  });

  it('refuses an order with no lines on it', async () => {
    const { service } = build();
    await expect(inTenant(() => service.create(dto({ items: [] })))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a material this shop does not have', async () => {
    const { service, db } = build();
    db.material.findMany = jest.fn(async () => []);
    await expect(inTenant(() => service.create(dto()))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('will not rewrite one that has been sent', async () => {
    const { service } = build({ ...PURCHASE, status: 'ORDERED' });
    // Receive against it rather than changing what was asked for.
    await expect(inTenant(() => service.update('p1', dto()))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('a delivery', () => {
  it('puts stock on the rack at what the line cost', async () => {
    const { service, db } = build();
    await inTenant(() =>
      service.receive('p1', { lines: [{ purchaseItemId: 'pi1', quantity: 4 }] }, 'u9'),
    );
    expect(db.stockMove.create.mock.calls[0][0].data).toMatchObject({
      materialId: 'm1',
      kind: 'RECEIPT',
      quantity: 4,
      rate: 900,
      purchaseId: 'p1',
      purchaseItemId: 'pi1',
      recordedById: 'u9',
    });
  });

  it('counts what has arrived on the line itself', async () => {
    const { service, db } = build();
    await inTenant(() =>
      service.receive('p1', { lines: [{ purchaseItemId: 'pi1', quantity: 4 }] }),
    );
    // Inferring it from the status could not tell four from ten.
    expect(db.purchaseItem.update.mock.calls[0][0].data).toEqual({
      receivedQuantity: { increment: 4 },
    });
  });

  it('refuses more than was ordered', async () => {
    const { service } = build();
    await expect(
      inTenant(() =>
        service.receive('p1', { lines: [{ purchaseItemId: 'pi1', quantity: 12 }] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to receive against a draft', async () => {
    const { service } = build({ ...PURCHASE, status: 'DRAFT' });
    await expect(
      inTenant(() =>
        service.receive('p1', { lines: [{ purchaseItemId: 'pi1', quantity: 1 }] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a line that is not on the order', async () => {
    const { service } = build();
    await expect(
      inTenant(() =>
        service.receive('p1', { lines: [{ purchaseItemId: 'ghost', quantity: 1 }] }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('where an order has got to', () => {
  it('is ordered while nothing has come', () => {
    expect(statusFor([{ quantity: 10, receivedQuantity: 0 }])).toBe('ORDERED');
  });

  it('is part received while something is outstanding', () => {
    // The state a shop chases a supplier from.
    expect(statusFor([{ quantity: 10, receivedQuantity: 4 }])).toBe('PART_RECEIVED');
    expect(
      statusFor([
        { quantity: 10, receivedQuantity: 10 },
        { quantity: 5, receivedQuantity: 0 },
      ]),
    ).toBe('PART_RECEIVED');
  });

  it('is received only when every line is', () => {
    expect(
      statusFor([
        { quantity: 10, receivedQuantity: 10 },
        { quantity: 5, receivedQuantity: 5 },
      ]),
    ).toBe('RECEIVED');
  });
});

describe('paying for it', () => {
  it('insists on the vendor’s bill first', async () => {
    const { service } = build();
    // Paying against nothing is how a shop ends up with a payment nobody can
    // match to a document.
    await expect(
      inTenant(() => service.pay('p1', { mode: 'ONLINE' as never })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('posts it against the vendor and the bill', async () => {
    const { service, ledger } = build({ ...PURCHASE, billNumber: 'VB/2026/114' });
    await inTenant(() => service.pay('p1', { mode: 'ONLINE' as never }, 'u9'));
    expect(ledger.post.mock.calls[0][0]).toMatchObject({
      sourceType: 'Purchase',
      direction: 'OUT',
      account: 'BANK',
      amount: 10620,
      accountHead: 'Purchases',
      party: 'Verma Boards',
      taxAmount: 1620,
      gstin: '08AAACH7409R1ZS',
      reference: 'VB/2026/114',
    });
  });

  it('will not pay the same purchase twice', async () => {
    const { service } = build({
      ...PURCHASE,
      billNumber: 'VB/2026/114',
      paidOn: new Date('2026-09-01'),
    });
    await expect(
      inTenant(() => service.pay('p1', { mode: 'CASH' as never })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('cancelling one', () => {
  it('refuses once something has arrived, because it is on the rack', async () => {
    const { service } = build({
      ...PURCHASE,
      items: [{ ...ITEM, receivedQuantity: 4 }],
    });
    await expect(inTenant(() => service.cancel('p1'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('cancels one nothing has come against', async () => {
    const { service, db } = build();
    await inTenant(() => service.cancel('p1'));
    expect(db.purchase.update.mock.calls[0][0].data).toEqual({ status: 'CANCELLED' });
  });
});

describe('which purchases a view covers', () => {
  it('searches the number, the vendor and the vendor’s own bill number', () => {
    const asked = JSON.stringify(purchaseFilter({ search: 'VB/2026' }).OR);
    expect(asked).toContain('code');
    expect(asked).toContain('billNumber');
    expect(asked).toContain('vendor');
  });
});
