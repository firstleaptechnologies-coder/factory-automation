import { LeadsController } from './leads.controller';

const leads = {
  list: jest.fn(async (..._a: unknown[]) => 'list'),
  board: jest.fn(async (..._a: unknown[]) => 'board'),
  listSources: jest.fn(async (..._a: unknown[]) => 'sources'),
  findOne: jest.fn(async (..._a: unknown[]) => 'one'),
  create: jest.fn(async (..._a: unknown[]) => 'created'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  changeStatus: jest.fn(async (..._a: unknown[]) => 'moved'),
  convert: jest.fn(async (..._a: unknown[]) => 'converted'),
  createSource: jest.fn(async (..._a: unknown[]) => 'source'),
  forPrinting: jest.fn(async (..._a: unknown[]) => ({
    lead: { code: 'LEAD-1', createdAt: '2026-09-01T00:00:00Z', items: [], total: 0 },
    firm: { name: 'Decor Bucket', letterheadFileId: null, logoFileId: null },
    amountInWords: 'Zero Rupees Only',
    terms: '',
  })),
};

const customFields = {
  list: jest.fn(async (..._a: unknown[]) => 'fields'),
  create: jest.fn(async (..._a: unknown[]) => 'field'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  deactivate: jest.fn(async (..._a: unknown[]) => 'gone'),
};

const files = {
  read: jest.fn(async (..._a: unknown[]) => ({
    file: { mimeType: 'image/png' },
    data: Buffer.from('letterhead'),
  })),
};

const controller = new LeadsController(
  leads as never,
  customFields as never,
  files as never,
);
const USER = { id: 'u1', code: 'SALES01', role: 'SALES', permissions: [] } as never;

beforeEach(() => jest.clearAllMocks());

it('passes the query through', async () => {
  await controller.list({ statusId: 's1' } as never);
  expect(leads.list).toHaveBeenCalledWith({ statusId: 's1' });
});

it('asks for a particular pipeline’s board when one is named', async () => {
  await controller.board('w1');
  expect(leads.board).toHaveBeenCalledWith('w1');
});

it('records who took an enquiry', async () => {
  await controller.create({ title: 'Kitchen jali' } as never, USER);
  expect(leads.create).toHaveBeenCalledWith({ title: 'Kitchen jali' }, 'u1');
});

it('carries who moved a lead, for the history', async () => {
  await controller.changeStatus('l1', { toStatusId: 's2' } as never, USER);
  expect(leads.changeStatus).toHaveBeenCalledWith('l1', { toStatusId: 's2' }, USER);
});

it('carries who converted one, since it writes an order', async () => {
  await controller.convert('l1', { location: 'Andheri' } as never, USER);
  expect(leads.convert).toHaveBeenCalledWith('l1', { location: 'Andheri' }, USER);
});

describe('what the shop captures on an enquiry', () => {
  it('hides the retired sources and fields from the lead form', async () => {
    await controller.listSources();
    await controller.listFields();
    // The form must not offer a source nobody uses any more.
    expect(leads.listSources).toHaveBeenCalledWith(false);
    expect(customFields.list).toHaveBeenCalledWith('LEAD', false);
  });

  it('includes them when the admin screen asks', async () => {
    await controller.listSources('true');
    await controller.listFields('true');
    expect(leads.listSources).toHaveBeenCalledWith(true);
    expect(customFields.list).toHaveBeenCalledWith('LEAD', true);
  });

  it('adds a source and a field', async () => {
    await controller.createSource({ code: 'WALKIN', name: 'Walk in' } as never);
    await controller.createField({ label: 'Architect' } as never);
    expect(leads.createSource).toHaveBeenCalledWith({ code: 'WALKIN', name: 'Walk in' });
    expect(customFields.create).toHaveBeenCalledWith({ label: 'Architect' });
  });

  it('deactivates a field rather than deleting what was captured under it', async () => {
    await controller.deactivateField('f1');
    expect(customFields.deactivate).toHaveBeenCalledWith('f1');
  });

  it('edits a field', async () => {
    await controller.updateField('f1', { label: 'Site engineer' } as never);
    expect(customFields.update).toHaveBeenCalledWith('f1', { label: 'Site engineer' });
  });
});

it('reads and edits one lead', async () => {
  await controller.findOne('l1');
  await controller.update('l1', { title: 'Kitchen jali' } as never);
  expect(leads.findOne).toHaveBeenCalledWith('l1');
  expect(leads.update).toHaveBeenCalledWith('l1', { title: 'Kitchen jali' });
});

describe('the printable enquiry', () => {
  it('is HTML, and says Enquiry rather than Estimate', async () => {
    const html = await controller.document('ld1');
    expect(leads.forPrinting).toHaveBeenCalledWith('ld1');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Enquiry For');
    // It is not a quotation and must not read as one to whoever is handed it.
    expect(html).not.toContain('Estimate For');
  });

  it('prints without a letterhead rather than not printing', async () => {
    files.read.mockRejectedValueOnce(new Error('gone'));
    leads.forPrinting.mockResolvedValueOnce({
      lead: { code: 'LEAD-1', createdAt: '2026-09-01T00:00:00Z', items: [], total: 0 },
      firm: { name: 'Decor Bucket', letterheadFileId: 'missing', logoFileId: null },
      amountInWords: 'Zero Rupees Only',
      terms: '',
    } as never);
    await expect(controller.document('ld1')).resolves.toContain('Decor Bucket');
  });
});

describe('an enquiry nobody has priced', () => {
  const unpriced = {
    lead: {
      code: 'LEAD-1',
      createdAt: '2026-09-01T00:00:00Z',
      contactName: 'Deshpande',
      total: 0,
      discount: 0,
      items: [
        { name: 'Louvered shutters, 8 nos', description: 'Teak veneer', quantity: 0, unit: 'Sqf' },
      ],
    },
    firm: { name: 'Decor Bucket', letterheadFileId: null, logoFileId: null },
    amountInWords: 'Zero Rupees Only',
    terms: '',
  };

  it('prints as the list it is, not as a quotation for nothing', async () => {
    leads.forPrinting.mockResolvedValueOnce(unpriced as never);
    const html = await controller.document('ld1');
    // What a client would read off a sheet of ₹0.00 is not "not priced yet".
    expect(html).not.toContain('₹ 0.00');
    expect(html).not.toContain('Zero Rupees Only');
    expect(html).not.toContain('Sub Total');
    // The list itself is still there, with its detail.
    expect(html).toContain('Louvered shutters, 8 nos');
    expect(html).toContain('Teak veneer');
  });

  it('drops the money columns rather than printing them empty', async () => {
    leads.forPrinting.mockResolvedValueOnce(unpriced as never);
    const html = await controller.document('ld1');
    expect(html).not.toContain('Price/ Unit');
    expect(html).not.toContain('Discount');
    expect(html).not.toContain('Amount');
    // Quantity and unit stay: they are what was asked for, not a price.
    expect(html).toContain('Quantity');
    expect(html).toContain('Unit');
  });

  it('leaves the quantity blank rather than printing a nought', async () => {
    leads.forPrinting.mockResolvedValueOnce(unpriced as never);
    const html = await controller.document('ld1');
    // A column of noughts reads as "none of these", which is the opposite of
    // "nobody has counted them yet".
    expect(html).not.toMatch(/<td class="r">0<\/td>/);
  });

  it('prints the figures once somebody has worked one out', async () => {
    leads.forPrinting.mockResolvedValueOnce({
      ...unpriced,
      lead: {
        ...unpriced.lead,
        total: 10000,
        subtotal: 10000,
        items: [
          {
            name: 'Louvered shutters',
            quantity: 10,
            unit: 'Sqf',
            ratePerUnit: 1000,
            discountAmount: 0,
            discountPct: 0,
            amount: 10000,
          },
        ],
      },
      amountInWords: 'Ten Thousand Rupees only',
    } as never);
    const html = await controller.document('ld1');
    expect(html).toContain('Price/ Unit');
    expect(html).toContain('Ten Thousand Rupees only');
    // And still no tax, because an enquiry carries none.
    expect(html).not.toContain('SGST');
    expect(html).not.toContain('HSN');
  });
});
