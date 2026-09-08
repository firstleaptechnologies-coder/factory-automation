import { DocumentsController } from './documents.controller';

const INVOICE = {
  id: 'i1',
  code: 'INV-2627-0001',
  status: 'ISSUED',
  issuedOn: new Date('2026-09-09T00:00:00.000Z'),
  clientName: 'Verma Interiors',
  clientGstin: '08ABCDE1234F1Z5',
  clientAddress: 'Sardarpura, Jodhpur',
  firmGstin: '08AAACD1234A1Z1',
  interState: false,
  subtotal: 10000,
  discount: 0,
  taxable: 10000,
  cgst: 900,
  sgst: 900,
  igst: 0,
  total: 11800,
  totalInWords: 'Eleven Thousand Eight Hundred Rupees only',
  order: { id: 'o1', code: 'ORD-2627-0007' },
  items: [
    {
      description: 'MDF · 18mm · 2400 × 1200 mm',
      hsn: '4411',
      quantity: 2,
      unit: 'nos',
      rate: 5000,
      amount: 10000,
      gstRatePct: 18,
      taxAmount: 1800,
    },
  ],
  creditNotes: [],
};

const CHALLAN = {
  id: 'd1',
  code: 'DC-2627-0001',
  status: 'ISSUED',
  issuedOn: new Date('2026-09-09T00:00:00.000Z'),
  shipTo: 'Site 4, Boranada',
  transport: 'Rathore Carriers',
  vehicle: 'RJ19 GA 4412',
  order: { id: 'o1', code: 'ORD-2627-0007' },
  items: [{ description: 'MDF · 18mm · 2400 × 1200 mm', quantity: 2, unit: 'nos' }],
};

const NOTE = {
  id: 'c1',
  code: 'CN-2627-0001',
  status: 'ISSUED',
  issuedOn: new Date('2026-09-10T00:00:00.000Z'),
  reason: 'RETURN',
  note: 'Two panels came back chipped',
  taxable: 5000,
  cgst: 450,
  sgst: 450,
  igst: 0,
  total: 5900,
  totalInWords: 'Five Thousand Nine Hundred Rupees only',
  invoice: { id: 'i1', code: 'INV-2627-0001', clientName: 'Verma Interiors', interState: false },
};

const documents = {
  invoices: jest.fn(async (..._a: unknown[]) => 'invoices'),
  invoice: jest.fn(async (..._a: unknown[]) => INVOICE),
  forOrder: jest.fn(async (..._a: unknown[]) => INVOICE),
  raise: jest.fn(async (..._a: unknown[]) => 'raised'),
  cancelInvoice: jest.fn(async (..._a: unknown[]) => 'cancelled'),
  challans: jest.fn(async (..._a: unknown[]) => 'challans'),
  challan: jest.fn(async (..._a: unknown[]) => CHALLAN),
  issueChallan: jest.fn(async (..._a: unknown[]) => 'issued'),
  cancelChallan: jest.fn(async (..._a: unknown[]) => 'cancelled'),
  creditNotes: jest.fn(async (..._a: unknown[]) => 'notes'),
  creditNote: jest.fn(async (..._a: unknown[]) => NOTE),
  credit: jest.fn(async (..._a: unknown[]) => 'credited'),
  cancelCreditNote: jest.fn(async (..._a: unknown[]) => 'cancelled'),
  receivableFor: jest.fn(async (..._a: unknown[]) => ({ charged: 1, credited: 0, received: 0 })),
};

const files = {
  read: jest.fn(async () => ({ file: { mimeType: 'image/png' }, data: Buffer.from('x') })),
};

let firm: Record<string, unknown> = {
  name: 'Decor Bucket',
  gstin: '08AAACD1234A1Z1',
  accentColor: '#E4232F',
};
const prisma = { firmProfile: { findFirst: jest.fn(async () => firm) } };

const controller = new DocumentsController(documents as never, files as never, prisma as never);

beforeEach(() => {
  jest.clearAllMocks();
  firm = { name: 'Decor Bucket', gstin: '08AAACD1234A1Z1', accentColor: '#E4232F' };
});

describe('routes', () => {
  it('records who raised an invoice, from the session', async () => {
    await controller.raise('o1', { note: 'n' } as never, { id: 'u9' } as never);
    expect(documents.raise).toHaveBeenCalledWith('o1', { note: 'n' }, 'u9');
  });

  it('records who credited an invoice, from the session', async () => {
    await controller.credit('i1', { taxable: 100 } as never, { id: 'u9' } as never);
    expect(documents.credit).toHaveBeenCalledWith('i1', { taxable: 100 }, 'u9');
  });

  it('hands back the three figures an order owes without folding any of them', async () => {
    const summary = await controller.receivable('o1');
    expect(Object.keys(summary ?? {})).toEqual(
      expect.arrayContaining(['charged', 'credited', 'received']),
    );
  });
});

describe('the printed invoice', () => {
  it('prints the client, the shop and both GSTINs', async () => {
    const html = await controller.invoiceDocument('i1');
    expect(html).toContain('Verma Interiors');
    expect(html).toContain('Decor Bucket');
    expect(html).toContain('08ABCDE1234F1Z5');
    expect(html).toContain('08AAACD1234A1Z1');
    expect(html).toContain('Tax Invoice');
  });

  it('shows CGST and SGST within the state, and no IGST line', async () => {
    const html = await controller.invoiceDocument('i1');
    expect(html).toContain('CGST');
    expect(html).toContain('SGST');
    expect(html).not.toContain('>IGST<');
  });

  it('shows one IGST line when the goods crossed a state line', async () => {
    documents.invoice = jest.fn(async () => ({ ...INVOICE, interState: true, igst: 1800, cgst: 0, sgst: 0 }));
    const html = await controller.invoiceDocument('i1');
    // Printing the wrong pair invalidates the document, so it follows what the
    // invoice recorded rather than anything read live.
    expect(html).toContain('>IGST<');
    expect(html).not.toContain('>CGST<');
    documents.invoice = jest.fn(async () => INVOICE);
  });

  it('carries the amount in words, which the paper has to show', async () => {
    const html = await controller.invoiceDocument('i1');
    expect(html).toContain('Eleven Thousand Eight Hundred Rupees only');
  });

  it('stamps a cancelled invoice across the face of it', async () => {
    documents.invoice = jest.fn(async () => ({
      ...INVOICE,
      status: 'CANCELLED',
      cancelReason: 'Raised against the wrong client',
    }));
    const html = await controller.invoiceDocument('i1');
    // The number stays used, so the paper is the only thing standing between a
    // void invoice and somebody paying it.
    expect(html).toContain('CANCELLED');
    expect(html).toContain('Raised against the wrong client');
    documents.invoice = jest.fn(async () => INVOICE);
  });

  it('escapes what the shop typed rather than rendering it', async () => {
    documents.invoice = jest.fn(async () => ({
      ...INVOICE,
      clientName: '<script>alert(1)</script>',
    }));
    const html = await controller.invoiceDocument('i1');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    documents.invoice = jest.fn(async () => INVOICE);
  });

  it('lets no colour but a hex one into the stylesheet', async () => {
    firm = { name: 'Decor Bucket', accentColor: 'red; } body { display:none } .x {' };
    const html = await controller.invoiceDocument('i1');
    expect(html).not.toContain('display:none');
    // It falls back rather than printing an unstyled sheet.
    expect(html).toContain('#E4232F');
  });

  it('inlines the letterhead rather than linking it', async () => {
    firm = { name: 'Decor Bucket', letterheadFileId: 'f1', accentColor: '#E4232F' };
    const html = await controller.invoiceDocument('i1');
    // The app renders this inside a PDF converter that will not fetch
    // anything, so a linked letterhead is a blank page.
    expect(html).toContain('data:image/png;base64,');
    expect(files.read).toHaveBeenCalledWith('f1');
    // The shop's own block is printed on the paper already, so the document
    // does not draw a second one over it — only what kind of document it is.
    expect(html).not.toContain('class="firm"');
    expect(html).toContain('Tax Invoice');
  });

  it('prints without one when the letterhead cannot be read', async () => {
    firm = { name: 'Decor Bucket', letterheadFileId: 'gone', accentColor: '#E4232F' };
    files.read = jest.fn(async () => {
      throw new Error('no such file');
    });
    const html = await controller.invoiceDocument('i1');
    // A missing letterhead must not stop an invoice going out.
    expect(html).toContain('class="firm"');
    files.read = jest.fn(async () => ({ file: { mimeType: 'image/png' }, data: Buffer.from('x') }));
  });
});

describe('the printed challan', () => {
  it('shows what went, where it went and on what', async () => {
    const html = await controller.challanDocument('d1');
    expect(html).toContain('Delivery Challan');
    expect(html).toContain('Site 4, Boranada');
    expect(html).toContain('RJ19 GA 4412');
  });

  it('shows no money anywhere on it', async () => {
    const html = await controller.challanDocument('d1');
    // Whoever takes delivery is a site supervisor or a watchman; what the job
    // cost is between the shop and whoever ordered it.
    expect(html).not.toContain('₹');
    // The shop's own GSTIN stays in the firm block — it identifies the sender.
    // What is absent is every figure: no rate, no amount, no tax column.
    expect(html).not.toMatch(/>(Rate|Amount|Taxable|CGST|SGST|IGST)</);
    expect(html).toContain('no charge is made on this document');
  });

  it('leaves a line for the receiver to sign, which is the proof it arrived', async () => {
    const html = await controller.challanDocument('d1');
    expect(html).toContain('Receiver');
  });
});

describe('the printed credit note', () => {
  it('says Credit Note and names the invoice it credits', async () => {
    const html = await controller.creditNoteDocument('c1');
    // The one document in the shop that reduces what somebody owes must never
    // be mistakeable for a bill.
    expect(html).toContain('Credit Note');
    expect(html).toContain('INV-2627-0001');
  });

  it('carries the reason in the shop’s own words', async () => {
    const html = await controller.creditNoteDocument('c1');
    expect(html).toContain('Goods returned');
    expect(html).toContain('Two panels came back chipped');
  });

  it('says on its face that nothing was paid against it', async () => {
    const html = await controller.creditNoteDocument('c1');
    expect(html).toContain('is not a receipt');
  });

  it('reverses the same pair of taxes the invoice charged', async () => {
    const html = await controller.creditNoteDocument('c1');
    expect(html).toContain('CGST');
    expect(html).not.toContain('>IGST<');
  });
});
