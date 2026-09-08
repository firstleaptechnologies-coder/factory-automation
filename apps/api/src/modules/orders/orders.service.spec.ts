import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttachmentKind, PricingMode, TaxTreatment, UserRole } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PERMISSIONS } from '@decor/shared';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  const codes = { next: jest.fn(async (kind: string) => `${kind.toUpperCase()}-1`) };
  const files = { ingest: jest.fn(async () => ({ id: 'file-1' })) };
  const clients = {};

  // Defaults every punch needs: a workflow with an entry point, a material,
  // and an order row shaped enough for withDisplayUnits to walk.
  db.workflow.findFirst = jest.fn(async () => ({
    id: 'w1',
    name: 'Production',
    statuses: [
      { id: 's1', name: 'Lead', isInitial: true, isEntryPoint: true },
      { id: 's2', name: 'Confirmed', isInitial: false, isEntryPoint: true },
      { id: 's3', name: 'Cutting', isInitial: false, isEntryPoint: false },
    ],
  }));
  db.material.findUnique = jest.fn(async () => ({ id: 'm1', name: 'MDF' }));
  db.clientLocation.upsert = jest.fn(async () => ({ id: 'loc-1' }));
  db.order.create = jest.fn(async () => ({ id: 'o1', items: [] }));
  db.order.findUnique = jest.fn(async () => ({ id: 'o1', items: [] }));

  return {
    service: new OrdersService(db as never, codes as never, files as never, clients as never),
    db,
    codes,
    files,
  };
}

/** `list` reads through a $transaction([...]) array rather than a callback. */
function txReturns(db: Db, value: unknown) {
  (db as unknown as Record<string, jest.Mock>).$transaction = jest.fn(async () => value);
}

const ITEM = {
  materialId: 'm1',
  length: { value: 1000, unit: 'MM' },
  width: { value: 500, unit: 'MM' },
  quantity: 2,
  rate: 100,
  rateUnit: 'PER_SQFT',
};

const PUNCH = {
  clientId: 'c1',
  location: 'Site A',
  items: [ITEM],
};

const punch = (over: Record<string, unknown> = {}) => ({ ...PUNCH, ...over }) as never;

describe('punch — what it refuses', () => {
  it('needs a client', async () => {
    const { service } = build();
    await expect(inTenant(() => service.punch(punch({ clientId: undefined })))).rejects.toThrow(
      /Pick an existing client/,
    );
  });

  it('needs at least one item', async () => {
    const { service } = build();
    await expect(inTenant(() => service.punch(punch({ items: [] })))).rejects.toThrow(
      /at least one item/,
    );
  });

  it('says an admin must configure a workflow when there is none', async () => {
    const { service, db } = build();
    db.workflow.findFirst = jest.fn(async () => null);
    await expect(inTenant(() => service.punch(punch()))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses a workflow with no stage an order can start at', async () => {
    const { service, db } = build();
    db.workflow.findFirst = jest.fn(async () => ({ id: 'w1', name: 'Empty', statuses: [] }));
    await expect(inTenant(() => service.punch(punch()))).rejects.toThrow(/no stage/);
  });

  it('refuses a start stage the admin did not mark as an entry point', async () => {
    const { service } = build();
    await expect(
      inTenant(() => service.punch(punch({ startStatusId: 's3' }))),
    ).rejects.toThrow(/not a stage an order may start at/);
  });

  it('refuses an item with no size and no preset', async () => {
    const { service } = build();
    await expect(
      inTenant(() => service.punch(punch({ items: [{ materialId: 'm1' }] }))),
    ).rejects.toThrow(/needs a length and width/);
  });

  it('refuses a zero-sized item', async () => {
    const { service } = build();
    await expect(
      inTenant(() =>
        service.punch(punch({ items: [{ ...ITEM, width: { value: 0, unit: 'MM' } }] })),
      ),
    ).rejects.toThrow(/greater than zero/);
  });

  it('takes a sizeless line on an order priced as one agreed figure', async () => {
    const { service, db } = build();
    // A quotation is written before anything is measured; the order it becomes
    // carries the agreed figure and the real lines are specified on the floor.
    await inTenant(() =>
      service.punch(
        punch({
          pricingMode: 'LUMP_SUM',
          total: 59000,
          items: [
            {
              ...ITEM,
              length: { value: 0, unit: 'MM' },
              width: { value: 0, unit: 'MM' },
            },
          ],
        }),
      ),
    );
    expect(db.order.create).toHaveBeenCalled();
  });

  it('refuses an unknown material', async () => {
    const { service, db } = build();
    db.material.findUnique = jest.fn(async () => null);
    await expect(inTenant(() => service.punch(punch()))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses an unknown size preset rather than silently ignoring it', async () => {
    const { service, db } = build();
    db.sizePreset.findUnique = jest.fn(async () => null);
    await expect(
      inTenant(() => service.punch(punch({ items: [{ ...ITEM, sizePresetId: 'sp-x' }] }))),
    ).rejects.toThrow(/Size preset/);
  });

  it('refuses a thickness that belongs to a different material', async () => {
    const { service, db } = build();
    db.materialThickness.findUnique = jest.fn(async () => ({
      id: 't1',
      materialId: 'other',
      valueMm: 18,
    }));
    await expect(
      inTenant(() => service.punch(punch({ items: [{ ...ITEM, materialThicknessId: 't1' }] }))),
    ).rejects.toThrow(/does not belong to the chosen material/);
  });

  it('refuses an unknown thickness option', async () => {
    const { service, db } = build();
    db.materialThickness.findUnique = jest.fn(async () => null);
    await expect(
      inTenant(() => service.punch(punch({ items: [{ ...ITEM, materialThicknessId: 't1' }] }))),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('punch — what it writes', () => {
  const created = (db: Db) => db.order.create.mock.calls[0][0].data;

  it('starts at the entry point that is not the lead stage', async () => {
    const { service, db } = build();
    await inTenant(() => service.punch(punch()));
    // A punched order was never an enquiry, so it skips "Lead".
    expect(created(db).statusId).toBe('s2');
  });

  it('honours an explicit start stage', async () => {
    const { service, db } = build();
    await inTenant(() => service.punch(punch({ startStatusId: 's1' })));
    expect(created(db).statusId).toBe('s1');
  });

  it('falls back to the initial stage when nothing else is an entry point', async () => {
    const { service, db } = build();
    db.workflow.findFirst = jest.fn(async () => ({
      id: 'w1',
      name: 'Production',
      statuses: [{ id: 's1', name: 'Lead', isInitial: true, isEntryPoint: false }],
    }));
    await inTenant(() => service.punch(punch()));
    expect(created(db).statusId).toBe('s1');
  });

  it('writes the opening history row in the same transaction', async () => {
    const { service, db } = build();
    await inTenant(() => service.punch(punch()));
    expect(created(db).statusHistory.create).toMatchObject({
      toStatusId: 's2',
      note: 'Order punched',
    });
  });

  it('stamps the tenant on the order, its items and its history', async () => {
    const { service, db } = build();
    await inTenant(() => service.punch(punch()));
    const data = created(db);
    expect(data.tenantId).toBe('tenant-test');
    expect(data.items.create[0].tenantId).toBe('tenant-test');
    expect(data.statusHistory.create.tenantId).toBe('tenant-test');
  });

  it('numbers the lines from one', async () => {
    const { service, db } = build();
    await inTenant(() => service.punch(punch({ items: [ITEM, ITEM] })));
    expect(created(db).items.create.map((i: { lineNo: number }) => i.lineNo)).toEqual([1, 2]);
  });

  it('keeps the rolled-up figures off the line', async () => {
    const { service, db } = build();
    await inTenant(() => service.punch(punch()));
    // quotedAmount and concession are the order's, not the item's — a stray
    // key here is a Prisma unknown-argument error at runtime.
    expect(created(db).items.create[0]).not.toHaveProperty('quotedAmount');
    expect(created(db).items.create[0]).not.toHaveProperty('concession');
  });

  it('snapshots sizes in millimetres whatever unit they were typed in', async () => {
    const { service, db } = build();
    await inTenant(() =>
      service.punch(
        punch({
          items: [{ ...ITEM, length: { value: 1, unit: 'M' }, width: { value: 100, unit: 'CM' } }],
        }),
      ),
    );
    expect(created(db).items.create[0]).toMatchObject({ lengthMm: 1000, widthMm: 1000 });
  });

  it('copies a preset onto the line so editing the preset later cannot rewrite it', async () => {
    const { service, db } = build();
    db.sizePreset.findUnique = jest.fn(async () => ({
      id: 'sp1',
      lengthMm: 2440,
      widthMm: 1220,
      thicknessMm: 18,
    }));
    await inTenant(() =>
      service.punch(punch({ items: [{ materialId: 'm1', sizePresetId: 'sp1', quantity: 1 }] })),
    );
    expect(created(db).items.create[0]).toMatchObject({
      lengthMm: 2440,
      widthMm: 1220,
      thicknessMm: 18,
    });
  });

  it('lets explicit dimensions override the preset', async () => {
    const { service, db } = build();
    db.sizePreset.findUnique = jest.fn(async () => ({
      id: 'sp1',
      lengthMm: 2440,
      widthMm: 1220,
      thicknessMm: 18,
    }));
    await inTenant(() =>
      service.punch(
        punch({
          items: [{ ...ITEM, sizePresetId: 'sp1', length: { value: 500, unit: 'MM' } }],
        }),
      ),
    );
    expect(created(db).items.create[0].lengthMm).toBe(500);
    expect(created(db).items.create[0].widthMm).toBe(500);
  });

  it('adds GST on top under EXCLUSIVE', async () => {
    const { service, db } = build();
    db.gstSlab.findFirst = jest.fn(async () => ({ id: 'g18', ratePct: 18, isDefault: true }));
    await inTenant(() => service.punch(punch()));
    const item = created(db).items.create[0];
    // 1000mm x 500mm = 5.38 sqft, x100 x2 = 1076.4 -> quoted stays taxable.
    expect(item.amount).toBeCloseTo(1076.4, 1);
    expect(item.taxAmount).toBeCloseTo(193.75, 1);
    expect(created(db).grandTotal).toBeCloseTo(1270.15, 1);
  });

  it('takes GST out of the quote under INCLUSIVE', async () => {
    const { service, db } = build();
    db.gstSlab.findFirst = jest.fn(async () => ({ id: 'g18', ratePct: 18, isDefault: true }));
    await inTenant(() => service.punch(punch({ taxTreatment: TaxTreatment.INCLUSIVE })));
    const data = created(db);
    // The client pays the quoted figure either way; the split just moves.
    expect(data.grandTotal).toBeCloseTo(1076.4, 1);
    expect(data.items.create[0].amount).toBeCloseTo(912.2, 1);
  });

  it('records the concession under ABSORBED', async () => {
    const { service, db } = build();
    db.gstSlab.findFirst = jest.fn(async () => ({ id: 'g18', ratePct: 18, isDefault: true }));
    await inTenant(() => service.punch(punch({ taxTreatment: TaxTreatment.ABSORBED })));
    const data = created(db);
    expect(data.taxTreatment).toBe(TaxTreatment.ABSORBED);
    expect(Number(data.taxDiscount)).toBeGreaterThan(0);
  });

  it('prices a lump sum off the quoted total and ignores the lines', async () => {
    const { service, db } = build();
    db.gstSlab.findFirst = jest.fn(async () => ({ id: 'g18', ratePct: 18, isDefault: true }));
    await inTenant(() =>
      service.punch(punch({ pricingMode: PricingMode.LUMP_SUM, total: 50000 })),
    );
    const data = created(db);
    expect(data.pricingMode).toBe(PricingMode.LUMP_SUM);
    expect(Number(data.quotedAmount)).toBe(50000);
    expect(Number(data.grandTotal)).toBe(59000);
    expect(data.gstSlabId).toBe('g18');
  });

  it('does not look up a slab at all when pricing itemised', async () => {
    const { service, db } = build();
    await inTenant(() => service.punch(punch()));
    // The per-line slab lookup happens, but no lump-sum slab resolution.
    expect(db.order.create).toHaveBeenCalled();
    expect(created(db).gstSlabId).toBeNull();
  });

  it('remembers the site so the next order to it is a pick', async () => {
    const { service, db } = build();
    await inTenant(() => service.punch(punch()));
    expect(db.clientLocation.upsert.mock.calls[0][0]).toMatchObject({
      where: { clientId_name: { clientId: 'c1', name: 'Site A' } },
      update: { useCount: { increment: 1 } },
    });
  });
});

describe('punch — the inline client', () => {
  const newClient = { name: 'Verma Interiors', phone: '98200 12345' };

  it('reuses an existing client matching on the last ten digits of the phone', async () => {
    const { service, db } = build();
    db.client.findFirst = jest.fn(async () => ({ id: 'existing' }));
    await inTenant(() =>
      service.punch(punch({ clientId: undefined, newClient })),
    );
    expect(db.client.create).not.toHaveBeenCalled();
    expect(db.order.create.mock.calls[0][0].data.clientId).toBe('existing');
    expect(db.client.findFirst.mock.calls[0][0].where.phone).toEqual({ contains: '9820012345' });
  });

  it('creates the client when no phone matches', async () => {
    const { service, db } = build();
    db.client.create = jest.fn(async () => ({ id: 'new-client' }));
    await inTenant(() => service.punch(punch({ clientId: undefined, newClient })));
    expect(db.order.create.mock.calls[0][0].data.clientId).toBe('new-client');
    expect(db.client.create.mock.calls[0][0].data).toMatchObject({
      name: 'Verma Interiors',
      tenantId: 'tenant-test',
    });
  });

  it('does not match on a phone too short to identify anyone', async () => {
    const { service, db } = build();
    db.client.create = jest.fn(async () => ({ id: 'new-client' }));
    await inTenant(() =>
      service.punch(punch({ clientId: undefined, newClient: { name: 'X', phone: '123' } })),
    );
    expect(db.client.findFirst).not.toHaveBeenCalled();
    expect(db.client.create).toHaveBeenCalled();
  });

  it('leaves a name collision alone — two clients can share a name', async () => {
    const { service, db } = build();
    db.client.create = jest.fn(async () => ({ id: 'new-client' }));
    await inTenant(() =>
      service.punch(punch({ clientId: undefined, newClient: { name: 'Verma Interiors' } })),
    );
    expect(db.client.findFirst).not.toHaveBeenCalled();
    expect(db.client.create).toHaveBeenCalled();
  });
});

describe('findOne', () => {
  it('reports a missing order', async () => {
    const { service, db } = build();
    db.order.findUnique = jest.fn(async () => null);
    await expect(service.findOne('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('renders sizes in the requested unit while keeping the millimetres', async () => {
    const { service, db } = build();
    db.order.findUnique = jest.fn(async () => ({
      id: 'o1',
      items: [{ id: 'i1', lengthMm: 304.8, widthMm: 304.8, thicknessMm: 18 }],
    }));
    const order = (await service.findOne('o1', 'FT')) as never as {
      items: { lengthMm: number; display: Record<string, unknown> }[];
    };
    expect(order.items[0].lengthMm).toBe(304.8);
    expect(order.items[0].display).toMatchObject({ unit: 'FT', length: 1, width: 1 });
  });

  it('always renders thickness in millimetres, whatever the sheet unit is', async () => {
    const { service, db } = build();
    db.order.findUnique = jest.fn(async () => ({
      id: 'o1',
      items: [{ id: 'i1', lengthMm: 304.8, widthMm: 304.8, thicknessMm: 18 }],
    }));
    const order = (await service.findOne('o1', 'FT')) as never as {
      items: { display: Record<string, unknown> }[];
    };
    // "0.059 ft" is arithmetically right and useless on a shop floor.
    expect(order.items[0].display).toMatchObject({ thicknessUnit: 'MM', thickness: 18 });
  });

  it('leaves a missing thickness null rather than converting it to zero', async () => {
    const { service, db } = build();
    db.order.findUnique = jest.fn(async () => ({
      id: 'o1',
      items: [{ id: 'i1', lengthMm: 100, widthMm: 100, thicknessMm: null }],
    }));
    const order = (await service.findOne('o1')) as never as {
      items: { display: { thickness: number | null } }[];
    };
    expect(order.items[0].display.thickness).toBeNull();
  });
});

describe('list', () => {
  const query = (over: Record<string, unknown> = {}) =>
    ({ skip: 0, limit: 20, page: 1, ...over }) as never;

  it('searches code, location and client name together', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    await service.list(query({ search: 'kitchen' }));
    const where = db.order.findMany.mock.calls[0]?.[0]?.where;
    expect(where.OR).toHaveLength(3);
  });

  it('filters by material through the items relation', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    await service.list(query({ materialId: 'm1' }));
    expect(db.order.findMany.mock.calls[0][0].where).toMatchObject({
      items: { some: { materialId: 'm1' } },
    });
  });

  it('builds a half-open date range from either end alone', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    await service.list(query({ from: '2026-01-01' }));
    const where = db.order.findMany.mock.calls[0][0].where;
    expect(where.createdAt.gte).toEqual(new Date('2026-01-01'));
    expect(where.createdAt.lte).toBeUndefined();
  });

  it('counts against the same filter it lists with', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    await service.list(query({ statusId: 's2' }));
    expect(db.order.count.mock.calls[0][0].where).toEqual(
      db.order.findMany.mock.calls[0][0].where,
    );
  });

  it('echoes the unit it rendered in', async () => {
    const { service, db } = build();
    txReturns(db, [[], 0]);
    const page = await service.list(query({ unit: 'FT' }));
    expect(page.unit).toBe('FT');
  });
});

describe('update', () => {
  it('reports a missing order before writing anything', async () => {
    const { service, db } = build();
    db.order.findUnique = jest.fn(async () => null);
    await expect(service.update('ghost', {} as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it('does not reprice when only the notes changed', async () => {
    const { service, db } = build();
    db.order.findUnique = jest.fn(async () => ({
      id: 'o1',
      items: [],
      pricingMode: PricingMode.ITEMISED,
      taxTreatment: TaxTreatment.EXCLUSIVE,
      discount: 0,
      total: 100,
    }));
    await service.update('o1', { notes: 'Rush job' } as never);
    // One update, for the notes — no second write of the money columns.
    expect(db.order.update).toHaveBeenCalledTimes(1);
  });

  it('reprices when the treatment changes', async () => {
    const { service, db } = build();
    db.order.findUnique = jest.fn(async () => ({
      id: 'o1',
      items: [],
      pricingMode: PricingMode.ITEMISED,
      taxTreatment: TaxTreatment.EXCLUSIVE,
      discount: 0,
      total: 100,
      quotedAmount: 100,
    }));
    await service.update('o1', { taxTreatment: TaxTreatment.ABSORBED } as never);
    expect(db.order.update.mock.calls.length).toBeGreaterThan(1);
  });

  it('reprices when a discount of zero is set — zero is a real value', async () => {
    const { service, db } = build();
    db.order.findUnique = jest.fn(async () => ({
      id: 'o1',
      items: [],
      pricingMode: PricingMode.ITEMISED,
      taxTreatment: TaxTreatment.EXCLUSIVE,
      discount: 500,
      total: 100,
      quotedAmount: 100,
    }));
    await service.update('o1', { discount: 0 } as never);
    expect(db.order.update.mock.calls.length).toBeGreaterThan(1);
  });
});

describe('reprice', () => {
  const lumpSum = (over: Record<string, unknown> = {}) => ({
    id: 'o1',
    items: [],
    pricingMode: PricingMode.LUMP_SUM,
    taxTreatment: TaxTreatment.EXCLUSIVE,
    gstSlabId: 'g18',
    discount: 0,
    total: 40000,
    quotedAmount: 40000,
    ...over,
  });

  it('does not wipe a lump-sum order whose quotedAmount is a legacy zero', async () => {
    const { service, db } = build();
    db.order.findUnique = jest.fn(async () => lumpSum({ quotedAmount: 0, total: 40000 }));
    db.gstSlab.findFirst = jest.fn(async () => ({ id: 'g18', ratePct: 18 }));
    await service.reprice('o1', {});
    // `??` would take the stored 0 as the quote and zero the order out.
    const data = db.order.update.mock.calls[0][0].data;
    expect(Number(data.quotedAmount)).toBe(40000);
    expect(Number(data.grandTotal)).toBe(47200);
  });

  it('forces the discount to zero on a lump sum', async () => {
    const { service, db } = build();
    db.order.findUnique = jest.fn(async () => lumpSum({ discount: 500 }));
    db.gstSlab.findFirst = jest.fn(async () => ({ id: 'g18', ratePct: 18 }));
    await service.reprice('o1', {});
    expect(Number(db.order.update.mock.calls[0][0].data.discount)).toBe(0);
  });

  it('re-prices lines from the rate, not from the stored taxable amount', async () => {
    const { service, db } = build();
    db.order.findUnique = jest.fn(async () => ({
      id: 'o1',
      pricingMode: PricingMode.ITEMISED,
      taxTreatment: TaxTreatment.EXCLUSIVE,
      discount: 0,
      total: 0,
      quotedAmount: 0,
      items: [
        {
          id: 'i1',
          rate: 100,
          rateUnit: 'PER_SQFT',
          lengthMm: 304.8,
          widthMm: 304.8,
          quantity: 1,
          gstRatePct: 18,
          // A stale amount left over from an INCLUSIVE quote.
          amount: 84.75,
        },
      ],
    }));
    await service.reprice('o1', { taxTreatment: TaxTreatment.EXCLUSIVE });
    // 1ft x 1ft x ₹100 = ₹100 taxable, not ₹84.75 re-split.
    expect(Number(db.orderItem.update.mock.calls[0][0].data.amount)).toBe(100);
  });

  it('re-derives the payment status when the value drops below what was paid', async () => {
    const { service, db } = build();
    db.order.findUnique = jest.fn(async () => lumpSum({ quotedAmount: 40000 }));
    db.gstSlab.findFirst = jest.fn(async () => null);
    db.payment.aggregate = jest.fn(async () => ({ _sum: { amount: 40000 } }));
    await service.reprice('o1', {});
    // Dropping the GST makes ₹40,000 the whole of it — they are paid in full
    // and must not be chased.
    const last = db.order.update.mock.calls.at(-1)[0].data;
    expect(last.paymentStatus).toBe('RECEIVED');
  });

  it('reports a missing order', async () => {
    const { service, db } = build();
    db.order.findUnique = jest.fn(async () => null);
    await expect(service.reprice('ghost', {})).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('changeStatus', () => {
  const order = {
    id: 'o1',
    workflowId: 'w1',
    statusId: 's1',
    status: { id: 's1', name: 'Lead' },
    items: [],
  };

  function withOrder(db: Db, over: Record<string, unknown> = {}) {
    db.order.findUnique = jest.fn(async () => ({ ...order, ...over }));
  }

  it('is a no-op when the order is already there', async () => {
    const { service, db } = build();
    withOrder(db);
    await service.changeStatus('o1', { toStatusId: 's1' } as never);
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it('refuses a move the canvas has no edge for, naming both stages', async () => {
    const { service, db } = build();
    withOrder(db);
    db.workflowTransition.findUnique = jest.fn(async () => null);
    db.workflowStatus.findUnique = jest.fn(async () => ({ name: 'Delivered' }));
    await expect(service.changeStatus('o1', { toStatusId: 's9' } as never)).rejects.toThrow(
      /from Lead to Delivered/,
    );
  });

  it('refuses a role that is not on the edge', async () => {
    const { service, db } = build();
    withOrder(db);
    db.workflowTransition.findUnique = jest.fn(async () => ({
      allowedRoles: [UserRole.ADMIN],
      requiresNote: false,
      toStatus: { name: 'Cutting' },
    }));
    await expect(
      service.changeStatus('o1', { toStatusId: 's2' } as never, {
        id: 'u1',
        role: UserRole.PRODUCTION,
      }),
    ).rejects.toThrow(/role cannot make this move/);
  });

  it('lets an admin through an edge they are not listed on', async () => {
    const { service, db } = build();
    withOrder(db);
    db.workflowTransition.findUnique = jest.fn(async () => ({
      allowedRoles: [UserRole.PRODUCTION],
      requiresNote: false,
      toStatus: { name: 'Cutting' },
    }));
    await inTenant(() =>
      service.changeStatus('o1', { toStatusId: 's2' } as never, {
        id: 'u1',
        role: UserRole.ADMIN,
      }),
    );
    expect(db.order.update).toHaveBeenCalled();
  });

  it('allows any role when the edge lists none', async () => {
    const { service, db } = build();
    withOrder(db);
    db.workflowTransition.findUnique = jest.fn(async () => ({
      allowedRoles: [],
      requiresNote: false,
      toStatus: { name: 'Cutting' },
    }));
    await inTenant(() =>
      service.changeStatus('o1', { toStatusId: 's2' } as never, {
        id: 'u1',
        role: UserRole.PRODUCTION,
      }),
    );
    expect(db.order.update).toHaveBeenCalled();
  });

  it('demands a note when the edge requires one', async () => {
    const { service, db } = build();
    withOrder(db);
    db.workflowTransition.findUnique = jest.fn(async () => ({
      allowedRoles: [],
      requiresNote: true,
      toStatus: { name: 'On hold' },
    }));
    await expect(service.changeStatus('o1', { toStatusId: 's2' } as never)).rejects.toThrow(
      /requires a note/,
    );
  });

  it('does not accept whitespace as a note', async () => {
    const { service, db } = build();
    withOrder(db);
    db.workflowTransition.findUnique = jest.fn(async () => ({
      allowedRoles: [],
      requiresNote: true,
      toStatus: { name: 'On hold' },
    }));
    await expect(
      service.changeStatus('o1', { toStatusId: 's2', note: '   ' } as never),
    ).rejects.toThrow(/requires a note/);
  });

  it('records where it came from, where it went, and who moved it', async () => {
    const { service, db } = build();
    withOrder(db);
    db.workflowTransition.findUnique = jest.fn(async () => ({
      allowedRoles: [],
      requiresNote: false,
      toStatus: { name: 'Cutting' },
    }));
    await inTenant(() =>
      service.changeStatus('o1', { toStatusId: 's2', note: 'Started' } as never, { id: 'u1' }),
    );
    expect(db.orderStatusHistory.create.mock.calls[0][0].data).toMatchObject({
      orderId: 'o1',
      fromStatusId: 's1',
      toStatusId: 's2',
      note: 'Started',
      changedById: 'u1',
      tenantId: 'tenant-test',
    });
  });

  describe('going back', () => {
    /** No edge forwards, one edge the other way round. */
    function onlyBackwards(db: Db) {
      db.workflowTransition.findUnique = jest.fn(async (args: any) =>
        args.where.workflowId_fromStatusId_toStatusId.fromStatusId === 's0'
          ? { id: 't0', allowedRoles: [], requiresNote: false }
          : null,
      );
      db.workflowStatus.findUnique = jest.fn(async () => ({ id: 's0', name: 'Design' }));
    }

    const mover = {
      id: 'u1',
      role: UserRole.ADMIN,
      permissions: [PERMISSIONS.ORDER_MOVE_BACK],
    };

    it('refuses somebody who is not allowed to send an order back', async () => {
      const { service, db } = build();
      withOrder(db, { statusId: 's1', status: { id: 's1', name: 'Production' } });
      onlyBackwards(db);
      await expect(
        service.changeStatus('o1', { toStatusId: 's0', reverse: true } as never, {
          id: 'u2',
          role: UserRole.PRODUCTION,
          permissions: [PERMISSIONS.ORDER_MOVE_STATUS],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.order.update).not.toHaveBeenCalled();
    });

    it('refuses a move back that was never acknowledged', async () => {
      const { service, db } = build();
      withOrder(db, { statusId: 's1', status: { id: 's1', name: 'Production' } });
      onlyBackwards(db);
      // The machine half of the question the screen asks: an older client or a
      // stray script cannot walk an order backwards without meaning to.
      await expect(
        service.changeStatus('o1', { toStatusId: 's0' } as never, mover),
      ).rejects.toThrow(/move back, not part of the usual journey/);
      expect(db.order.update).not.toHaveBeenCalled();
    });

    it('makes the move once it is acknowledged by somebody allowed to', async () => {
      const { service, db } = build();
      withOrder(db, { statusId: 's1', status: { id: 's1', name: 'Production' } });
      onlyBackwards(db);
      await inTenant(() =>
        service.changeStatus(
          'o1',
          { toStatusId: 's0', reverse: true, note: 'Client changed the design' } as never,
          mover,
        ),
      );
      expect(db.order.update).toHaveBeenCalled();
      expect(db.orderStatusHistory.create.mock.calls[0][0].data).toMatchObject({
        fromStatusId: 's1',
        toStatusId: 's0',
        note: 'Client changed the design',
        reversed: true,
      });
    });

    it('will not invent a step the order never took', async () => {
      const { service, db } = build();
      withOrder(db, { statusId: 's1', status: { id: 's1', name: 'Production' } });
      db.workflowTransition.findUnique = jest.fn(async () => null);
      db.workflowStatus.findUnique = jest.fn(async () => ({ name: 'Delivered' }));
      // Going back is retracing an arrow that exists, not a hole in the flow.
      await expect(
        service.changeStatus('o1', { toStatusId: 's9', reverse: true } as never, mover),
      ).rejects.toThrow(/does not allow moving from Production to Delivered/);
    });

    it('leaves an ordinary forward move unmarked', async () => {
      const { service, db } = build();
      withOrder(db);
      db.workflowTransition.findUnique = jest.fn(async () => ({
        allowedRoles: [],
        requiresNote: false,
        toStatus: { name: 'Cutting' },
      }));
      await inTenant(() =>
        service.changeStatus('o1', { toStatusId: 's2' } as never, { id: 'u1' }),
      );
      expect(db.orderStatusHistory.create.mock.calls[0][0].data.reversed).toBe(false);
    });
  });

  it('reports a missing order', async () => {
    const { service, db } = build();
    db.order.findUnique = jest.fn(async () => null);
    await expect(
      service.changeStatus('ghost', { toStatusId: 's2' } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('attachments', () => {
  it('demands a description for a reference image', async () => {
    const { service } = build();
    await expect(
      service.addAttachments('o1', [{} as never], {
        kind: AttachmentKind.REFERENCE_IMAGE,
      } as never),
    ).rejects.toThrow(/needs a description/);
  });

  it('refuses an upload with no files', async () => {
    const { service } = build();
    await expect(
      service.addAttachments('o1', [], { kind: AttachmentKind.DOCUMENT } as never),
    ).rejects.toThrow(/No files were received/);
  });

  it('continues the sort order after the attachments already there', async () => {
    const { service, db } = build();
    db.orderAttachment.count = jest.fn(async () => 2);
    await inTenant(() =>
      service.addAttachments('o1', [{} as never, {} as never], {
        kind: AttachmentKind.DOCUMENT,
      } as never),
    );
    expect(
      db.orderAttachment.create.mock.calls.map((c) => c[0].data.sortOrder),
    ).toEqual([2, 3]);
  });

  it('reports a missing attachment on removal', async () => {
    const { service, db } = build();
    db.orderAttachment.findUnique = jest.fn(async () => null);
    await expect(service.removeAttachment('ghost')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('board', () => {
  it('gives every column its own cap so a busy stage cannot starve the rest', async () => {
    const { service, db } = build();
    db.workflow.findFirst = jest.fn(async () => ({
      id: 'w1',
      code: 'PROD',
      name: 'Production',
      statuses: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
    }));
    const board = await service.board();
    expect(board.columns).toHaveLength(3);
    expect(db.order.findMany).toHaveBeenCalledTimes(3);
    for (const call of db.order.findMany.mock.calls) {
      expect(call[0].take).toBe(20);
    }
  });

  it('counts the whole stage, not just the page it returned', async () => {
    const { service, db } = build();
    db.workflow.findFirst = jest.fn(async () => ({
      id: 'w1',
      code: 'PROD',
      name: 'Production',
      statuses: [{ id: 's1' }],
    }));
    db.order.count = jest.fn(async () => 137);
    const board = await service.board();
    expect(board.columns[0].total).toBe(137);
  });

  it('reports when no workflow is configured', async () => {
    const { service, db } = build();
    db.workflow.findFirst = jest.fn(async () => null);
    await expect(service.board()).rejects.toBeInstanceOf(NotFoundException);
  });
});
