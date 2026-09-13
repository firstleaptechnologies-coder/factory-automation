import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EstimateStatus, PricingMode, TaxTreatment } from '@prisma/client';
import { EstimatesService } from './estimates.service';
import { ClientsService } from '../clients/clients.service';
import { inTenant, prismaMock, notificationsMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

function build() {
  const db = prismaMock() as never as Db;
  const codes = { next: jest.fn(async () => 'EST-1') };
  const orders = {
    punch: jest.fn(async (..._args: unknown[]) => ({ id: 'o1', code: 'ORD-1' })),
  };
  db.firmProfile.findFirst = jest.fn(async () => ({
    tenantId: 'tenant-test',
    name: 'Decor Bucket',
    stateCode: '27',
    termsAndConditions: 'Firm terms',
  }));
  // The real ClientsService, so a client added while quoting goes through the
  // same rule punching an order does.
  const clients = new ClientsService(db as never, codes as never);
  return {
    service: new EstimatesService(
      db as never,
      codes as never,
      orders as never,
      clients as never,
      notificationsMock() as never,
    ),
    db,
    orders,
    codes,
  };
}

const line = (over: Record<string, unknown> = {}) => ({
  name: 'CNC jali',
  quantity: 10,
  ratePerUnit: 500,
  ...over,
});

describe('firmProfile', () => {
  it('creates the row on first read so a new tenant can still print', async () => {
    const { service, db } = build();
    db.firmProfile.findFirst = jest.fn(async () => null);
    await inTenant(() => service.firmProfile());
    expect(db.firmProfile.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 'tenant-test',
      name: 'Your firm',
    });
  });

  it('returns the existing row without creating another', async () => {
    const { service, db } = build();
    await inTenant(() => service.firmProfile());
    expect(db.firmProfile.create).not.toHaveBeenCalled();
  });

  it('falls back to our own accent when the tenant has not picked one', async () => {
    const { service, db } = build();
    db.firmProfile.findFirst = jest.fn(async () => ({ themeAccent: null }));
    await expect(service.theme()).resolves.toEqual({ accent: '#FF6B1A' });
  });

  it('returns the tenant’s accent when they have', async () => {
    const { service, db } = build();
    db.firmProfile.findFirst = jest.fn(async () => ({ themeAccent: '#2563EB' }));
    await expect(service.theme()).resolves.toEqual({ accent: '#2563EB' });
  });

  it('has an accent for a tenant with no profile row at all', async () => {
    const { service, db } = build();
    db.firmProfile.findFirst = jest.fn(async () => null);
    await expect(service.theme()).resolves.toEqual({ accent: '#FF6B1A' });
  });

  it('updates on the tenant key, not a row id', async () => {
    const { service, db } = build();
    await inTenant(() => service.saveFirmProfile({ name: 'New name' } as never));
    expect(db.firmProfile.update.mock.calls[0][0].where).toEqual({ tenantId: 'tenant-test' });
  });

  it('sets the letterhead and the logo on different columns', async () => {
    const { service, db } = build();
    await inTenant(() => service.setLetterhead('f1', 'letterhead'));
    await inTenant(() => service.setLetterhead('f2', 'logo'));
    expect(db.firmProfile.update.mock.calls[0][0].data).toEqual({ letterheadFileId: 'f1' });
    expect(db.firmProfile.update.mock.calls[1][0].data).toEqual({ logoFileId: 'f2' });
  });

  it('can clear a letterhead', async () => {
    const { service, db } = build();
    await inTenant(() => service.setLetterhead(null, 'letterhead'));
    expect(db.firmProfile.update.mock.calls[0][0].data).toEqual({ letterheadFileId: null });
  });
});

describe('priceLines, through create', () => {
  const created = (db: Db) => db.estimate.create.mock.calls[0][0].data;

  it('defaults the unit to square feet, the trade’s unit', async () => {
    const { service, db } = build();
    await inTenant(() => service.create({ items: [line()] } as never));
    expect(created(db).items.create[0].unit).toBe('Sqf');
  });

  it('numbers the lines from one', async () => {
    const { service, db } = build();
    await inTenant(() => service.create({ items: [line(), line()] } as never));
    expect(created(db).items.create.map((l: { lineNo: number }) => l.lineNo)).toEqual([1, 2]);
  });

  it('takes the line discount off before splitting the tax', async () => {
    const { service, db } = build();
    db.gstSlab.findFirst = jest.fn(async () => ({ id: 'g18', ratePct: 18 }));
    await inTenant(() =>
      service.create({ items: [line({ discountPct: 10 })] } as never),
    );
    const item = created(db).items.create[0];
    // ₹5,000 less 10% = ₹4,500 taxable; the client is taxed on what they pay.
    expect(item.discountAmount).toBe(500);
    expect(item.netAmount).toBe(4500);
    expect(item.taxAmount).toBe(810);
    expect(item.amount).toBe(5310);
  });

  it('taxes at zero when no slab is configured', async () => {
    const { service, db } = build();
    await inTenant(() => service.create({ items: [line()] } as never));
    const item = created(db).items.create[0];
    expect(item.gstRatePct).toBe(0);
    expect(item.taxAmount).toBe(0);
    expect(item.amount).toBe(5000);
  });

  it('lets a line pick its own slab', async () => {
    const { service, db } = build();
    db.gstSlab.findFirst = jest.fn(async (args: never) => {
      const where = (args as unknown as { where: Record<string, unknown> }).where;
      return where.id === 'g5' ? { id: 'g5', ratePct: 5 } : { id: 'g18', ratePct: 18 };
    });
    await inTenant(() => service.create({ items: [line({ gstSlabId: 'g5' })] } as never));
    expect(created(db).items.create[0].gstRatePct).toBe(5);
  });

  it('takes the tax out of the quote under INCLUSIVE', async () => {
    const { service, db } = build();
    db.gstSlab.findFirst = jest.fn(async () => ({ id: 'g18', ratePct: 18 }));
    await inTenant(() =>
      service.create({ items: [line()], taxTreatment: TaxTreatment.INCLUSIVE } as never),
    );
    const item = created(db).items.create[0];
    expect(item.amount).toBe(5000);
    expect(item.netAmount).toBe(4237.29);
  });
});

describe('create', () => {
  const created = (db: Db) => db.estimate.create.mock.calls[0][0].data;

  it('snapshots the client’s address rather than referencing it', async () => {
    const { service, db } = build();
    db.client.findFirst = jest.fn(async () => ({
      id: 'c1',
      name: 'Verma Interiors',
      billingAddress: 'Andheri',
      shippingAddress: 'Site A',
      gstin: '27AAAAA0000A1Z5',
      stateCode: '27',
    }));
    await inTenant(() => service.create({ clientId: 'c1', items: [line()] } as never));
    // A reprint next year must show the address it was actually sent to.
    expect(created(db)).toMatchObject({
      clientName: 'Verma Interiors',
      billingAddress: 'Andheri',
      shippingAddress: 'Site A',
      clientGstin: '27AAAAA0000A1Z5',
    });
  });

  /*
   * A client added while quoting.
   *
   * Before this, the quote screen could only search — somebody who had rung up
   * for the first time was written in as free text, so the quote carried no
   * GSTIN and no state code (which decides IGST against CGST+SGST), and the
   * order punched from it made a second, unrelated record.
   */
  describe('a client who is not on file yet', () => {
    it('creates them and attaches the quote to the record', async () => {
      const { service, db } = build();
      db.client.create = jest.fn(async () => ({ id: 'new-client' }));
      db.client.findFirst = jest.fn(async (args: never) =>
        (args as { where: { id?: string } }).where.id === 'new-client'
          ? { id: 'new-client', name: 'Verma Interiors', stateCode: '29' }
          : null,
      );

      await inTenant(() =>
        service.create({
          newClient: { name: 'Verma Interiors', phone: '9820012345' },
          items: [line()],
        } as never),
      );

      expect(created(db)).toMatchObject({ clientId: 'new-client', clientName: 'Verma Interiors' });
    });

    it('reuses the client the phone number already belongs to', async () => {
      const { service, db } = build();
      db.client.findFirst = jest.fn(async () => ({ id: 'c1', name: 'Verma Interiors' }));

      await inTenant(() =>
        service.create({
          newClient: { name: 'Verma Interior', phone: '98200 12345' },
          items: [line()],
        } as never),
      );

      // The same rule punching an order uses: one client, not two.
      expect(db.client.create).not.toHaveBeenCalled();
      expect(created(db).clientId).toBe('c1');
    });

    it('is ignored when an existing client was picked instead', async () => {
      const { service, db } = build();
      db.client.findFirst = jest.fn(async () => ({ id: 'c1', name: 'Verma Interiors' }));

      await inTenant(() =>
        service.create({
          clientId: 'c1',
          newClient: { name: 'Somebody else' },
          items: [line()],
        } as never),
      );

      expect(db.client.create).not.toHaveBeenCalled();
      expect(created(db).clientId).toBe('c1');
    });

    it('takes the state code across, so the quote splits its GST the right way', async () => {
      const { service, db } = build();
      db.client.create = jest.fn(async () => ({ id: 'new-client' }));
      db.client.findFirst = jest.fn(async (args: never) =>
        (args as { where: { id?: string } }).where.id === 'new-client'
          ? { id: 'new-client', name: 'Out of state', stateCode: '29' }
          : null,
      );

      await inTenant(() =>
        service.create({
          newClient: { name: 'Out of state', phone: '9000000001', stateCode: '29' },
          items: [line()],
        } as never),
      );

      // The firm is in 27; a client in 29 is inter-state, so it is IGST.
      expect(created(db)).toMatchObject({ igst: expect.anything(), cgst: 0, sgst: 0 });
    });
  });

  it('falls back to the plain address when there is no billing one', async () => {
    const { service, db } = build();
    db.client.findFirst = jest.fn(async () => ({ id: 'c1', name: 'X', address: 'Somewhere' }));
    await inTenant(() => service.create({ clientId: 'c1', items: [line()] } as never));
    expect(created(db).billingAddress).toBe('Somewhere');
  });

  it('lets the estimate override the client’s details', async () => {
    const { service, db } = build();
    db.client.findFirst = jest.fn(async () => ({ id: 'c1', name: 'Verma', address: 'Old' }));
    await inTenant(() =>
      service.create({
        clientId: 'c1',
        clientName: 'Verma (site office)',
        billingAddress: 'New',
        items: [line()],
      } as never),
    );
    expect(created(db)).toMatchObject({
      clientName: 'Verma (site office)',
      billingAddress: 'New',
    });
  });

  it('works for a walk-in with no client record', async () => {
    const { service, db } = build();
    await inTenant(() =>
      service.create({ clientName: 'Walk-in', items: [line()] } as never),
    );
    expect(created(db).clientName).toBe('Walk-in');
    expect(db.client.findFirst).not.toHaveBeenCalled();
  });

  it('splits CGST and SGST for a client in the same state', async () => {
    const { service, db } = build();
    db.gstSlab.findFirst = jest.fn(async () => ({ id: 'g18', ratePct: 18 }));
    db.client.findFirst = jest.fn(async () => ({ id: 'c1', name: 'X', stateCode: '27' }));
    await inTenant(() => service.create({ clientId: 'c1', items: [line()] } as never));
    const data = created(db);
    expect(data.cgst).toBe(450);
    expect(data.sgst).toBe(450);
    expect(data.igst).toBe(0);
  });

  it('charges IGST for a client in another state', async () => {
    const { service, db } = build();
    db.gstSlab.findFirst = jest.fn(async () => ({ id: 'g18', ratePct: 18 }));
    db.client.findFirst = jest.fn(async () => ({ id: 'c1', name: 'X', stateCode: '29' }));
    await inTenant(() => service.create({ clientId: 'c1', items: [line()] } as never));
    const data = created(db);
    expect(data.igst).toBe(900);
    expect(data.cgst).toBe(0);
  });

  it('defaults to EXCLUSIVE when the treatment is not stated', async () => {
    const { service, db } = build();
    await inTenant(() => service.create({ items: [line()] } as never));
    expect(created(db).taxTreatment).toBe(TaxTreatment.EXCLUSIVE);
  });
});

describe('update', () => {
  function withEstimate(db: Db, over: Record<string, unknown> = {}) {
    db.estimate.findFirst = jest.fn(async () => ({
      id: 'e1',
      code: 'EST-1',
      clientId: 'c1',
      clientName: 'Verma',
      billingAddress: 'Andheri',
      taxTreatment: TaxTreatment.EXCLUSIVE,
      status: EstimateStatus.DRAFT,
      client: { id: 'c1', stateCode: '27' },
      items: [],
      ...over,
    }));
  }

  it('replaces the lines wholesale rather than reconciling them', async () => {
    const { service, db } = build();
    withEstimate(db);
    await inTenant(() => service.update('e1', { items: [line()] } as never));
    // Matching by position would silently mis-edit a line deleted from the middle.
    expect(db.estimateItem.deleteMany).toHaveBeenCalledWith({ where: { estimateId: 'e1' } });
    expect(db.estimate.update.mock.calls[0][0].data.items.create).toHaveLength(1);
  });

  it('keeps the fields the edit did not mention', async () => {
    const { service, db } = build();
    withEstimate(db);
    await inTenant(() => service.update('e1', { items: [line()] } as never));
    expect(db.estimate.update.mock.calls[0][0].data).toMatchObject({
      clientName: 'Verma',
      billingAddress: 'Andheri',
      status: EstimateStatus.DRAFT,
    });
  });

  it('keeps the existing treatment unless changed', async () => {
    const { service, db } = build();
    withEstimate(db, { taxTreatment: TaxTreatment.INCLUSIVE });
    await inTenant(() => service.update('e1', { items: [line()] } as never));
    expect(db.estimate.update.mock.calls[0][0].data.taxTreatment).toBe(TaxTreatment.INCLUSIVE);
  });

  it('reports a missing estimate', async () => {
    const { service } = build();
    await expect(service.update('ghost', { items: [] } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('setStatus and remove', () => {
  it('refuses to set a status on a missing estimate', async () => {
    const { service } = build();
    await expect(service.setStatus('ghost', EstimateStatus.SENT)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses to delete a missing estimate', async () => {
    const { service, db } = build();
    await expect(service.remove('ghost')).rejects.toBeInstanceOf(NotFoundException);
    expect(db.estimate.delete).not.toHaveBeenCalled();
  });
});

describe('the enquiry a quote belongs to', () => {
  /** An estimate on a lead, and a pipeline that says which stage means quoted. */
  function linked(db: Db, over: Record<string, unknown> = {}) {
    db.estimate.findFirst = jest.fn(async () => ({
      id: 'e1',
      code: 'EST-1',
      leadId: 'ld1',
      status: EstimateStatus.DRAFT,
      grandTotal: 450000,
      items: [],
      ...over,
    }));
    db.estimate.update = jest.fn(async () => ({
      id: 'e1',
      code: 'EST-1',
      leadId: 'ld1',
      grandTotal: 450000,
    }));
    db.lead.findFirst = jest.fn(async () => ({
      id: 'ld1',
      statusId: 'contacted',
      workflowId: 'w1',
      convertedOrderId: null,
    }));
    db.workflow.findFirst = jest.fn(async () => ({
      quoteStatusId: 'quoted',
      lostStatusId: 'lost',
    }));
    db.workflowTransition.findUnique = jest.fn(async () => ({ id: 't1' }));
  }

  const leadWrite = (db: Db) =>
    db.lead.update.mock.calls.map((call: any[]) => call[0].data);

  it('refuses to quote for an enquiry that does not exist', async () => {
    const { service, db } = build();
    db.lead.findFirst = jest.fn(async () => null);
    await expect(
      inTenant(() => service.create({ items: [line()], leadId: 'ghost' } as never)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('links the quote to the enquiry it was written for', async () => {
    const { service, db } = build();
    db.lead.findFirst = jest.fn(async () => ({ id: 'ld1' }));
    await inTenant(() => service.create({ items: [line()], leadId: 'ld1' } as never));
    expect(db.estimate.create.mock.calls[0][0].data.leadId).toBe('ld1');
  });

  it('leaves a walk-in quote unattached', async () => {
    const { service, db } = build();
    await inTenant(() => service.create({ items: [line()] } as never));
    // Most quotes are for somebody who rang up and asked for a price.
    expect(db.estimate.create.mock.calls[0][0].data.leadId).toBeUndefined();
    expect(db.lead.update).not.toHaveBeenCalled();
  });

  describe('sending it', () => {
    it('moves the enquiry to the stage the shop calls quoted', async () => {
      const { service, db } = build();
      linked(db);
      await inTenant(() => service.setStatus('e1', EstimateStatus.SENT, 'u1'));
      expect(leadWrite(db)).toContainEqual({ statusId: 'quoted' });
    });

    it('writes it into the enquiry’s history, naming the quote', async () => {
      const { service, db } = build();
      linked(db);
      await inTenant(() => service.setStatus('e1', EstimateStatus.SENT, 'u1'));
      expect(db.leadStatusHistory.create.mock.calls[0][0].data).toMatchObject({
        leadId: 'ld1',
        fromStatusId: 'contacted',
        toStatusId: 'quoted',
        note: 'Quote EST-1 sent',
        changedById: 'u1',
      });
    });

    it('records what was quoted as what the enquiry is worth', async () => {
      const { service, db } = build();
      linked(db);
      await inTenant(() => service.setStatus('e1', EstimateStatus.SENT));
      // The guess typed when the enquiry came in stays where it is.
      expect(leadWrite(db)).toContainEqual({ quotedValue: 450000 });
    });

    it('moves nothing where the shop has named no quoted stage', async () => {
      const { service, db } = build();
      linked(db);
      db.workflow.findFirst = jest.fn(async () => ({ quoteStatusId: null }));
      await inTenant(() => service.setStatus('e1', EstimateStatus.SENT));
      expect(leadWrite(db)).not.toContainEqual({ statusId: 'quoted' });
      // The quote still went out, and the figure is still recorded.
      expect(leadWrite(db)).toContainEqual({ quotedValue: 450000 });
    });

    it('moves nothing where the pipeline does not allow that move', async () => {
      const { service, db } = build();
      linked(db);
      db.workflowTransition.findUnique = jest.fn(async () => null);
      await inTenant(() => service.setStatus('e1', EstimateStatus.SENT));
      // A quote that went out is a fact; a pipeline drawn a particular way
      // must not stop it being recorded.
      expect(db.leadStatusHistory.create).not.toHaveBeenCalled();
      expect(leadWrite(db)).toContainEqual({ quotedValue: 450000 });
    });

    it('does not move it again when it was already sent', async () => {
      const { service, db } = build();
      linked(db, { status: EstimateStatus.SENT });
      await inTenant(() => service.setStatus('e1', EstimateStatus.SENT));
      expect(db.leadStatusHistory.create).not.toHaveBeenCalled();
    });

    it('leaves an unattached quote alone', async () => {
      const { service, db } = build();
      linked(db, { leadId: null });
      db.estimate.update = jest.fn(async () => ({ id: 'e1', code: 'EST-1', leadId: null }));
      await inTenant(() => service.setStatus('e1', EstimateStatus.SENT));
      expect(db.lead.update).not.toHaveBeenCalled();
    });
  });

  describe('what the enquiry is worth', () => {
    it('falls back to the guess once no quote stands', async () => {
      const { service, db } = build();
      linked(db);
      db.estimate.findFirst = jest
        .fn()
        .mockResolvedValueOnce({ id: 'e1', code: 'EST-1', leadId: 'ld1', items: [] })
        .mockResolvedValue(null);
      await inTenant(() => service.remove('e1'));
      // Deleting the only quote must not leave its figure behind on the lead.
      expect(leadWrite(db)).toContainEqual({ quotedValue: null });
    });

    it('takes the newest quote that still stands', async () => {
      const { service, db } = build();
      linked(db);
      await inTenant(() => service.setStatus('e1', EstimateStatus.ACCEPTED));
      const asked = db.estimate.findFirst.mock.calls.at(-1)[0];
      expect(asked).toMatchObject({
        where: { leadId: 'ld1', status: { in: ['SENT', 'ACCEPTED', 'CONVERTED'] } },
        orderBy: { updatedAt: 'desc' },
      });
    });
  });

  it('keeps the enquiry from going quiet while it is being quoted', async () => {
    const { service, db } = build();
    db.lead.findFirst = jest.fn(async () => ({ id: 'ld1' }));
    db.estimate.create = jest.fn(async () => ({ id: 'e1', leadId: 'ld1' }));
    await inTenant(() => service.create({ items: [line()], leadId: 'ld1' } as never));
    // Writing a careful quote was exactly the activity that let an enquiry
    // fall off the board.
    expect(db.lead.update).toHaveBeenCalledWith({ where: { id: 'ld1' }, data: {} });
  });
});

describe('convertToOrder', () => {
  function withEstimate(db: Db, over: Record<string, unknown> = {}) {
    db.estimate.findFirst = jest.fn(async () => ({
      id: 'e1',
      code: 'EST-1',
      clientId: 'c1',
      orderId: null,
      // Taxable ₹50,000, GST ₹9,000, so the client pays ₹59,000.
      total: 50000,
      grandTotal: 59000,
      taxTreatment: TaxTreatment.EXCLUSIVE,
      items: [
        { name: 'CNC jali', gstSlabId: 'g18' },
        { name: 'Corian panel', gstSlabId: 'g18' },
      ],
      ...over,
    }));
    db.material.findFirst = jest.fn(async () => ({ id: 'm1' }));
  }

  const punched = (orders: { punch: jest.Mock }) =>
    orders.punch.mock.calls[0][0] as never as Record<string, never>;

  it('refuses to convert the same estimate twice', async () => {
    const { service, db } = build();
    withEstimate(db, { orderId: 'o1' });
    await expect(service.convertToOrder('e1', { location: 'Site A' })).rejects.toThrow(
      /already been turned into an order/,
    );
  });

  it('refuses an estimate with no client attached', async () => {
    const { service, db } = build();
    withEstimate(db, { clientId: null });
    await expect(service.convertToOrder('e1', { location: 'Site A' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses when the shop has no materials to point the stand-in line at', async () => {
    const { service, db } = build();
    withEstimate(db);
    db.material.findFirst = jest.fn(async () => null);
    await expect(service.convertToOrder('e1', { location: 'Site A' })).rejects.toThrow(
      /at least one material/,
    );
  });

  it('carries the agreed figure across as a lump sum', async () => {
    const { service, db, orders } = build();
    withEstimate(db);
    await service.convertToOrder('e1', { location: 'Site A' });
    // The client agreed to these figures; re-deriving them from today's rates
    // would be wrong. Under EXCLUSIVE the order takes the taxable value and
    // puts the same GST back on top — handed the gross it taxed a figure that
    // already included tax, and ₹59,000 agreed became ₹69,620 invoiced.
    expect(punched(orders)).toMatchObject({
      pricingMode: PricingMode.LUMP_SUM,
      total: 50000,
      taxTreatment: TaxTreatment.EXCLUSIVE,
      clientId: 'c1',
    });
  });

  it('takes the gross where the quoted figure is what the client pays', async () => {
    const { service, db, orders } = build();
    withEstimate(db, { taxTreatment: TaxTreatment.INCLUSIVE });
    await service.convertToOrder('e1', { location: 'Site A' });
    // Under INCLUSIVE and ABSORBED the tax comes out of the quoted figure.
    expect(punched(orders)).toMatchObject({ total: 59000 });
  });

  it('orders at the slab the quote was priced at, not the shop default', async () => {
    const { service, db, orders } = build();
    withEstimate(db);
    await service.convertToOrder('e1', { location: 'Site A' });
    expect(punched(orders)).toMatchObject({ gstSlabId: 'g18' });
  });

  it('leaves the slab to the shop where the quote mixed rates', async () => {
    const { service, db, orders } = build();
    withEstimate(db, {
      items: [
        { name: 'CNC jali', gstSlabId: 'g18' },
        { name: 'Corian panel', gstSlabId: 'g12' },
      ],
    });
    await service.convertToOrder('e1', { location: 'Site A' });
    // One lump sum cannot carry two rates; the shop's own default decides.
    expect(punched(orders).gstSlabId).toBeUndefined();
  });

  it('makes one stand-in line naming what was quoted', async () => {
    const { service, db, orders } = build();
    withEstimate(db);
    await service.convertToOrder('e1', { location: 'Site A' });
    const items = punched(orders).items as never as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0].notes).toBe('CNC jali, Corian panel');
    // A per-line rate would be a number nobody quoted.
    expect(items[0]).not.toHaveProperty('rate');
  });

  it('notes which estimate the order came from', async () => {
    const { service, db, orders } = build();
    withEstimate(db);
    await service.convertToOrder('e1', { location: 'Site A' });
    expect(punched(orders).notes).toBe('From estimate EST-1');
  });

  it('marks the estimate converted and links the order, keeping the record', async () => {
    const { service, db } = build();
    withEstimate(db);
    await service.convertToOrder('e1', { location: 'Site A' });
    expect(db.estimate.update.mock.calls[0][0].data).toEqual({
      status: EstimateStatus.CONVERTED,
      orderId: 'o1',
    });
    expect(db.estimate.delete).not.toHaveBeenCalled();
  });
});

describe('forPrinting', () => {
  function withEstimate(db: Db, over: Record<string, unknown> = {}) {
    db.estimate.findFirst = jest.fn(async () => ({
      id: 'e1',
      grandTotal: 59000,
      igst: 0,
      termsOverride: null,
      items: [],
      ...over,
    }));
  }

  it('spells the total out for the paper copy', async () => {
    const { service, db } = build();
    withEstimate(db);
    const printed = await inTenant(() => service.forPrinting('e1'));
    expect(printed.amountInWords).toMatch(/Fifty Nine Thousand/i);
  });

  it('uses the estimate’s own terms when it has them', async () => {
    const { service, db } = build();
    withEstimate(db, { termsOverride: 'Special terms' });
    const printed = await inTenant(() => service.forPrinting('e1'));
    expect(printed.terms).toBe('Special terms');
  });

  it('falls back to the firm’s terms', async () => {
    const { service, db } = build();
    withEstimate(db);
    const printed = await inTenant(() => service.forPrinting('e1'));
    expect(printed.terms).toBe('Firm terms');
  });

  it('marks the estimate inter-state when there is IGST on it', async () => {
    const { service, db } = build();
    withEstimate(db, { igst: 900 });
    const printed = await inTenant(() => service.forPrinting('e1'));
    expect(printed.interState).toBe(true);
  });

  it('marks it intra-state when there is not', async () => {
    const { service, db } = build();
    withEstimate(db);
    const printed = await inTenant(() => service.forPrinting('e1'));
    expect(printed.interState).toBe(false);
  });
});

describe('an accepted quote that becomes work', () => {
  function converting(db: Db, lead: Record<string, unknown> | null) {
    db.estimate.findFirst = jest.fn(async () => ({
      id: 'e1',
      code: 'EST-1',
      clientId: 'c1',
      orderId: null,
      leadId: lead ? 'ld1' : null,
      grandTotal: 59000,
      taxTreatment: TaxTreatment.EXCLUSIVE,
      items: [{ name: 'CNC jali' }],
    }));
    db.material.findFirst = jest.fn(async () => ({ id: 'm1' }));
    db.lead.findFirst = jest.fn(async () => lead);
    db.workflowStatus.findFirst = jest.fn(async () => ({ id: 'won' }));
  }

  const open = { id: 'ld1', statusId: 'quoted', workflowId: 'w1', convertedOrderId: null };

  it('marks the enquiry converted, so the funnel is not wrong', async () => {
    const { service, db } = build();
    converting(db, open);
    await inTenant(() => service.convertToOrder('e1', { location: 'Site A' }, 'u1'));
    // Only the estimate knew about the order, so a lead quoted properly and
    // won showed in the pipeline as never converted.
    expect(db.lead.update.mock.calls.at(-1)[0].data).toMatchObject({
      convertedOrderId: 'o1',
      statusId: 'won',
    });
  });

  it('says in the enquiry’s history what it became', async () => {
    const { service, db } = build();
    converting(db, open);
    await inTenant(() => service.convertToOrder('e1', { location: 'Site A' }, 'u1'));
    expect(db.leadStatusHistory.create.mock.calls[0][0].data).toMatchObject({
      leadId: 'ld1',
      toStatusId: 'won',
      note: 'Converted into ORD-1',
      changedById: 'u1',
    });
  });

  it('leaves an enquiry that already became work alone', async () => {
    const { service, db } = build();
    converting(db, { ...open, convertedOrderId: 'o9' });
    await inTenant(() => service.convertToOrder('e1', { location: 'Site A' }));
    // Whatever it became, that is the record.
    expect(db.lead.update).not.toHaveBeenCalled();
  });

  it('converts a quote with no enquiry behind it exactly as before', async () => {
    const { service, db, orders } = build();
    converting(db, null);
    await inTenant(() => service.convertToOrder('e1', { location: 'Site A' }));
    expect(orders.punch).toHaveBeenCalled();
    expect(db.lead.update).not.toHaveBeenCalled();
  });
});


/**
 * The client said no.
 *
 * A declined quote moves the enquiry to whichever stage that shop calls lost —
 * configured, because one pipeline says "Lost", another says "Closed — no", and
 * a third keeps them and works them again.
 */
describe('a quote that is turned down', () => {
  /** Stage moves only — settling the quoted figure writes to the lead too. */
  const movedStage = (db: Db) =>
    db.lead.update.mock.calls
      .map((call: any[]) => call[0].data)
      .filter((data: Record<string, unknown>) => 'statusId' in data);

  function build() {
    const db = prismaMock() as never as Db;
    db.estimate.findFirst = jest.fn(async () => ({
      id: 'e1',
      code: 'EST-1',
      leadId: 'ld1',
      status: EstimateStatus.SENT,
      grandTotal: 450000,
      items: [],
    }));
    db.estimate.update = jest.fn(async () => ({
      id: 'e1',
      code: 'EST-1',
      leadId: 'ld1',
      grandTotal: 450000,
      status: EstimateStatus.DECLINED,
    }));
    db.lead.findFirst = jest.fn(async () => ({
      id: 'ld1',
      statusId: 'quoted',
      workflowId: 'w1',
      convertedOrderId: null,
    }));
    db.workflow.findFirst = jest.fn(async () => ({
      quoteStatusId: 'quoted',
      lostStatusId: 'lost',
    }));
    db.workflowTransition.findUnique = jest.fn(async () => ({ id: 't1' }));
    db.estimate.aggregate = jest.fn(async () => ({ _sum: { grandTotal: null }, _count: 0 }));
    db.estimate.findMany = jest.fn(async () => []);
    return {
      service: new EstimatesService(
        db as never,
        { next: jest.fn(async () => 'EST-2') } as never,
        {} as never,
        {} as never,
        notificationsMock() as never,
      ),
      db,
    };
  }

  it('moves the enquiry to the stage the shop calls lost', async () => {
    const { service, db } = build();
    await inTenant(() => service.setStatus('e1', EstimateStatus.DECLINED, 'u1'));

    expect(movedStage(db)).toEqual([{ statusId: 'lost' }]);
  });

  it('says in the enquiry’s history which quote was turned down', async () => {
    const { service, db } = build();
    await inTenant(() => service.setStatus('e1', EstimateStatus.DECLINED, 'u1'));

    expect(db.leadStatusHistory.create.mock.calls.at(-1)?.[0].data).toMatchObject({
      toStatusId: 'lost',
      note: 'Quote EST-1 declined',
      changedById: 'u1',
    });
  });

  it('moves nothing where the pipeline has no such stage', async () => {
    const { service, db } = build();
    db.workflow.findFirst = jest.fn(async () => ({ quoteStatusId: 'quoted', lostStatusId: null }));

    await inTenant(() => service.setStatus('e1', EstimateStatus.DECLINED, 'u1'));

    // A shop that works declined enquiries again should keep them where they
    // are. Settling the quoted figure still happens; the stage does not move.
    expect(movedStage(db)).toEqual([]);
  });

  it('respects the drawing: no arrow, no move', async () => {
    const { service, db } = build();
    db.workflowTransition.findUnique = jest.fn(async () => null);

    await inTenant(() => service.setStatus('e1', EstimateStatus.DECLINED, 'u1'));

    expect(movedStage(db)).toEqual([]);
  });

  it('does not move it a second time when the status is set again', async () => {
    const { service, db } = build();
    db.estimate.findFirst = jest.fn(async () => ({
      id: 'e1',
      code: 'EST-1',
      leadId: 'ld1',
      status: EstimateStatus.DECLINED,
      grandTotal: 450000,
      items: [],
    }));

    await inTenant(() => service.setStatus('e1', EstimateStatus.DECLINED, 'u1'));
    expect(movedStage(db)).toEqual([]);
  });
});
