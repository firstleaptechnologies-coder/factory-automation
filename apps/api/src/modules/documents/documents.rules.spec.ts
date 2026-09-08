import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentsService, describeItem, documentFilter } from './documents.service';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const ORDER = {
  id: 'o1',
  code: 'ORD-2627-0007',
  // The order's own money: `total` is the taxable value and `grandTotal` is
  // what the client pays. An invoice restates these rather than recomputing
  // them from the lines, which on a lump-sum job carry nothing at all.
  subtotal: 10000,
  discount: 0,
  total: 10000,
  taxAmount: 1800,
  grandTotal: 11800,
  client: {
    name: 'Verma Interiors',
    gstin: '08ABCDE1234F1Z5',
    address: 'Sardarpura, Jodhpur',
    billingAddress: 'Sardarpura, Jodhpur',
    shippingAddress: 'Site 4, Boranada',
    stateCode: '08',
    stateName: 'Rajasthan',
  },
  items: [
    {
      lineNo: 1,
      material: { name: 'MDF' },
      materialThickness: { valueMm: 18, label: '18mm' },
      lengthMm: 2400,
      widthMm: 1200,
      quantity: 2,
      rate: 5000,
      amount: 10000,
      gstRatePct: 18,
      taxAmount: 1800,
      notes: null,
    },
  ],
};

const FIRM = { name: 'Decor Bucket', gstin: '08AAACD1234A1Z1', stateCode: '08', stateName: 'Rajasthan' };

function build() {
  const db = prismaMock() as never as Db;
  db.order.findFirst = jest.fn(async () => ORDER);
  db.firmProfile.findFirst = jest.fn(async () => FIRM);
  db.documentSequence.upsert = jest.fn(async () => ({ next: 1 }));
  db.invoice.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'i1',
    ...data,
  }));
  db.challan.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'd1',
    ...data,
  }));
  db.creditNote.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'c1',
    ...data,
  }));

  const codes = {
    next: jest.fn(async (kind: string) =>
      ({ invoice: 'INV-2627-0001', challan: 'DC-2627-0001', creditNote: 'CN-2627-0001' })[kind],
    ),
  };

  return { service: new DocumentsService(db as never, codes as never), db, codes };
}

/** An issued invoice, as the service reads one back. */
const issued = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  code: 'INV-2627-0001',
  status: 'ISSUED',
  orderId: 'o1',
  taxable: 10000,
  cgst: 900,
  sgst: 900,
  igst: 0,
  total: 11800,
  creditNotes: [],
  ...over,
});

describe('raising an invoice', () => {
  it('snapshots the client and the shop as they are today', async () =>
    inTenant(async () => {
      const { service, db } = build();
      await service.raise('o1', {});

      const { data } = db.invoice.create.mock.calls[0][0];
      // A reprint next year must be the paper that went out, not a fresh
      // render of whatever the client's address has become since.
      expect(data).toMatchObject({
        clientName: 'Verma Interiors',
        clientGstin: '08ABCDE1234F1Z5',
        clientAddress: 'Sardarpura, Jodhpur',
        firmName: 'Decor Bucket',
        firmGstin: '08AAACD1234A1Z1',
      });
    }));

  it('charges CGST and SGST when the shop and the client share a state', async () =>
    inTenant(async () => {
      const { service, db } = build();
      await service.raise('o1', {});

      const { data } = db.invoice.create.mock.calls[0][0];
      expect(data).toMatchObject({ interState: false, cgst: 900, sgst: 900, igst: 0 });
    }));

  it('charges IGST when the goods cross a state line', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.order.findFirst = jest.fn(async () => ({
        ...ORDER,
        client: { ...ORDER.client, stateCode: '27', stateName: 'Maharashtra' },
      }));

      await service.raise('o1', {});
      const { data } = db.invoice.create.mock.calls[0][0];
      expect(data).toMatchObject({ interState: true, igst: 1800, cgst: 0, sgst: 0 });
    }));

  it('writes the total in words, because the paper has to carry it', async () =>
    inTenant(async () => {
      const { service, db } = build();
      await service.raise('o1', {});
      const { data } = db.invoice.create.mock.calls[0][0];
      expect(String(data.totalInWords)).toMatch(/Eleven Thousand Eight Hundred/i);
    }));

  it('refuses a second invoice for the same order, and says what to do instead', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.invoice.findFirst = jest.fn(async () => ({ code: 'INV-2627-0001' }));

      // One per order. Progressive billing would mean deciding which lines
      // belong to which invoice, and a correction is a credit note anyway.
      await expect(service.raise('o1', {})).rejects.toThrow(/already invoiced as INV-2627-0001/);
      await expect(service.raise('o1', {})).rejects.toThrow(/credit note/);
    }));

  it('bills a lump-sum job at what the order says, not what its lines add to', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.order.findFirst = jest.fn(async () => ({
        ...ORDER,
        subtotal: 100000,
        total: 100000,
        taxAmount: 18000,
        grandTotal: 118000,
        // Quoted as one figure for the whole job: the lines describe what was
        // made and carry no money at all. Running it against a real order was
        // what showed this — the first invoice raised billed ₹1,18,000 as ₹0.
        items: [{ ...ORDER.items[0], rate: null, amount: 0, gstRatePct: 0, taxAmount: 0 }],
      }));

      await service.raise('o1', {});
      const { data } = db.invoice.create.mock.calls[0][0];
      expect(data).toMatchObject({ taxable: 100000, cgst: 9000, sgst: 9000, total: 118000 });

      const line = (data.items as { create: Record<string, unknown>[] }).create[0];
      expect(line).toMatchObject({ amount: 100000, unit: 'job', taxAmount: 18000 });
    }));

  it('leaves no size on a line that never had one', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.order.findFirst = jest.fn(async () => ({
        ...ORDER,
        items: [{ ...ORDER.items[0], lengthMm: 0, widthMm: 0, notes: 'Jali balcony' }],
      }));

      await service.raise('o1', {});
      const { data } = db.invoice.create.mock.calls[0][0];
      const line = (data.items as { create: Record<string, unknown>[] }).create[0];
      // "0 × 0 mm" on a bill is worse than saying nothing.
      expect(line.description).toBe('MDF · 18mm · Jali balcony');
    }));

  it('refuses to bill an order nobody has priced', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.order.findFirst = jest.fn(async () => ({ ...ORDER, total: 0, taxAmount: 0, grandTotal: 0 }));

      // A zero-value invoice is a number burnt for nothing, and the series is
      // gapless: it cannot be handed back.
      await expect(service.raise('o1', {})).rejects.toBeInstanceOf(BadRequestException);
    }));

  it('refuses an order that is not there', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.order.findFirst = jest.fn(async () => null);
      await expect(service.raise('ghost', {})).rejects.toBeInstanceOf(NotFoundException);
    }));

  it('posts nothing to the ledger', async () =>
    inTenant(async () => {
      const { service, db } = build();
      await service.raise('o1', {});

      // An invoice is a claim, not a movement of money. The payment against it
      // is the movement and that already posts; posting both would count the
      // same rupees twice and leave the cash position wrong.
      expect(db.ledgerEntry.create).not.toHaveBeenCalled();
      expect(db.ledgerEntry.createMany).not.toHaveBeenCalled();
    }));
});

describe('cancelling an invoice', () => {
  it('keeps the number and records why', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.invoice.findFirst = jest.fn(async () => issued());

      await service.cancelInvoice('i1', { reason: 'Raised against the wrong client' });
      const { data } = db.invoice.update.mock.calls[0][0];
      // A gap in an invoice series is the first thing an assessing officer
      // asks about, so nothing is ever deleted.
      expect(data).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Raised against the wrong client',
      });
      expect(db.invoice.delete).not.toHaveBeenCalled();
    }));

  it('refuses to cancel one that has already been credited', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.invoice.findFirst = jest.fn(async () =>
        issued({ creditNotes: [{ id: 'c1', total: 1180, taxable: 1000 }] }),
      );

      // Voiding the invoice under a live credit note would leave the note
      // crediting a document that says it was never worth anything.
      await expect(
        service.cancelInvoice('i1', { reason: 'Wrong client' }),
      ).rejects.toThrow(/credit notes/);
    }));

  it('refuses to cancel one twice', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.invoice.findFirst = jest.fn(async () => issued({ status: 'CANCELLED' }));
      await expect(
        service.cancelInvoice('i1', { reason: 'Wrong client' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }));
});

describe('crediting an invoice', () => {
  it('reverses the tax in the proportion the invoice charged it', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.invoice.findFirst = jest.fn(async () => issued());

      await service.credit('i1', { taxable: 5000, reason: 'RETURN' as never, note: 'Two panels back' });
      const { data } = db.creditNote.create.mock.calls[0][0];
      expect(data).toMatchObject({ taxable: 5000, cgst: 450, sgst: 450, igst: 0, total: 5900 });
    }));

  it('will not credit more than is left of the invoice', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.invoice.findFirst = jest.fn(async () =>
        issued({ creditNotes: [{ id: 'c1', taxable: 8000, total: 9440 }] }),
      );

      // Otherwise a credit note could turn a bill into money owed to the
      // client, which is a different document entirely.
      await expect(
        service.credit('i1', { taxable: 5000, reason: 'RETURN' as never, note: 'More back' }),
      ).rejects.toThrow(/₹2000.00 of that invoice is left/);
    }));

  it('refuses to credit an invoice that was cancelled', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.invoice.findFirst = jest.fn(async () => issued({ status: 'CANCELLED' }));
      await expect(
        service.credit('i1', { taxable: 100, reason: 'RETURN' as never, note: 'Back' }),
      ).rejects.toThrow(/nothing to credit/);
    }));

  it('posts nothing to the ledger either', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.invoice.findFirst = jest.fn(async () => issued());
      await service.credit('i1', { taxable: 1000, reason: 'ALLOWANCE' as never, note: 'Agreed' });

      // A credit note is not a refund. If the shop actually hands money back,
      // that is a payment out and posts on its own.
      expect(db.ledgerEntry.create).not.toHaveBeenCalled();
    }));
});

describe('a delivery challan', () => {
  it('carries no price, no rate and no tax at all', async () =>
    inTenant(async () => {
      const { service, db } = build();
      await service.issueChallan('o1', {});

      const { data } = db.challan.create.mock.calls[0][0];
      const line = (data.items as { create: Record<string, unknown>[] }).create[0];
      // It travels with the goods and is read by whoever receives them; what
      // the job cost is between the shop and whoever ordered it.
      expect(Object.keys(line)).not.toContain('rate');
      expect(Object.keys(line)).not.toContain('amount');
      expect(Object.keys(line)).not.toContain('taxAmount');
    }));

  it('goes to the shipping address rather than the billing one by default', async () =>
    inTenant(async () => {
      const { service, db } = build();
      await service.issueChallan('o1', {});
      const { data } = db.challan.create.mock.calls[0][0];
      expect(data.shipTo).toBe('Site 4, Boranada');
    }));

  it('lets a load go somewhere else again', async () =>
    inTenant(async () => {
      const { service, db } = build();
      await service.issueChallan('o1', { shipTo: 'Site 9, Pali Road' });
      const { data } = db.challan.create.mock.calls[0][0];
      expect(data.shipTo).toBe('Site 9, Pali Road');
    }));

  it('allows more than one against an order, unlike an invoice', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.challan.findFirst = jest.fn(async () => ({ id: 'd0', code: 'DC-2627-0001' }));

      // A job often leaves in two vans on two days, and each load needs its
      // own paper travelling with it.
      await expect(service.issueChallan('o1', {})).resolves.toBeTruthy();
    }));
});

describe('what an order still owes', () => {
  it('reads as three figures, never two', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.invoice.findFirst = jest.fn(async () => ({
        id: 'i1',
        code: 'INV-2627-0001',
        total: 50000,
        creditNotes: [{ total: 5000 }],
      }));
      db.payment.aggregate = jest.fn(async () => ({ _sum: { amount: 45000 } }));

      const summary = await service.receivableFor('o1');
      // Credited money is never counted as received: the order is settled, and
      // it says so without ever claiming ₹50,000 was collected.
      expect(summary).toMatchObject({
        charged: 50000,
        credited: 5000,
        received: 45000,
        due: 0,
        settled: true,
      });
    }));

  it('says nothing at all when the order has not been invoiced', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.invoice.findFirst = jest.fn(async () => null);
      await expect(service.receivableFor('o1')).resolves.toBeNull();
    }));

  it('ignores a cancelled invoice, which claims nothing', async () =>
    inTenant(async () => {
      const { service, db } = build();
      db.invoice.findFirst = jest.fn(async () => null);
      await service.receivableFor('o1');
      expect(db.invoice.findFirst.mock.calls[0][0].where).toMatchObject({ status: 'ISSUED' });
    }));
});

describe('how a line reads on paper', () => {
  it('names the material, its thickness and the size it was cut to', () => {
    expect(describeItem(ORDER.items[0] as never).description).toBe(
      'MDF · 18mm · 2400 × 1200 mm',
    );
  });

  it('leaves out a thickness the material does not have', () => {
    const line = describeItem({ ...ORDER.items[0], materialThickness: null } as never);
    expect(line.description).toBe('MDF · 2400 × 1200 mm');
  });
});

describe('finding a document again', () => {
  it('searches the invoice number, the client and the order number together', () => {
    // Somebody holding a piece of paper has one of the three, and does not
    // know which of them the system calls it.
    const where = documentFilter({ search: 'Verma' });
    expect(where.OR).toHaveLength(3);
  });

  it('filters nothing when nothing was asked', () => {
    expect(documentFilter({})).toEqual({});
  });
});
