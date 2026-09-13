import { EstimatesController } from './estimates.controller';

const estimates = {
  firmProfile: jest.fn(async (..._a: unknown[]) => 'firm'),
  theme: jest.fn(async (..._a: unknown[]) => ({ accent: '#FF6B1A' })),
  saveFirmProfile: jest.fn(async (..._a: unknown[]) => 'saved'),
  setLetterhead: jest.fn(async (..._a: unknown[]) => 'set'),
  forPrinting: jest.fn(async (..._a: unknown[]) => ({}) as unknown),
  list: jest.fn(async (..._a: unknown[]) => 'list'),
  findOne: jest.fn(async (..._a: unknown[]) => 'one'),
  create: jest.fn(async (..._a: unknown[]) => 'created'),
  update: jest.fn(async (..._a: unknown[]) => 'updated'),
  setStatus: jest.fn(async (..._a: unknown[]) => 'status'),
  convertToOrder: jest.fn(async (..._a: unknown[]) => 'converted'),
  remove: jest.fn(async (..._a: unknown[]) => 'removed'),
};

const files = {
  ingest: jest.fn(async (..._a: unknown[]) => ({ id: 'f9' })),
  read: jest.fn(async (..._a: unknown[]) => ({
    file: { mimeType: 'image/png' },
    data: Buffer.from('head'),
  })),
};

const controller = new EstimatesController(estimates as never, files as never);
const USER = { id: 'u1', code: 'ADMIN', role: 'ADMIN', permissions: [] } as never;

/** The shape the document renderer is handed. */
const PRINTABLE = {
  estimate: { code: 'EST-1', items: [], client: { name: 'Verma Interiors' } },
  firm: { name: 'Decor Bucket', letterheadFileId: 'f1', logoFileId: null },
  amountInWords: 'Rupees five thousand only',
  terms: 'Fifty percent advance.',
  interState: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  estimates.forPrinting.mockResolvedValue(PRINTABLE);
  files.read.mockResolvedValue({
    file: { mimeType: 'image/png' },
    data: Buffer.from('head'),
  });
});

describe('the firm profile', () => {
  it('reads and writes the whole profile', async () => {
    await controller.firm();
    await controller.saveFirm({ name: 'Decor Bucket' } as never);
    expect(estimates.firmProfile).toHaveBeenCalled();
    expect(estimates.saveFirmProfile).toHaveBeenCalledWith({ name: 'Decor Bucket' });
  });

  it('serves the accent on its own, apart from the bank details', async () => {
    // A production hand who may not see the bank details still needs the
    // colours their software is painted in.
    await controller.theme();
    expect(estimates.theme).toHaveBeenCalled();
  });

  it('stores an uploaded letterhead as a file and points the firm at it', async () => {
    const file = { originalname: 'head.png' } as never;
    await controller.uploadLetterhead(file, USER);
    expect(files.ingest).toHaveBeenCalledWith(file, 'DOCUMENT', 'u1');
    expect(estimates.setLetterhead).toHaveBeenCalledWith('f9', 'letterhead');
  });

  it('can hold a logo instead, on the same route', async () => {
    await controller.uploadLetterhead({ originalname: 'logo.png' } as never, USER, 'logo');
    expect(estimates.setLetterhead).toHaveBeenCalledWith('f9', 'logo');
  });

  it('treats an unrecognised kind as the letterhead', async () => {
    await controller.uploadLetterhead({ originalname: 'x.png' } as never, USER, 'banner');
    expect(estimates.setLetterhead).toHaveBeenCalledWith('f9', 'letterhead');
  });

  it('clears whichever of the two was asked for', async () => {
    await controller.clearLetterhead();
    expect(estimates.setLetterhead).toHaveBeenCalledWith(null, 'letterhead');
    await controller.clearLetterhead('logo');
    expect(estimates.setLetterhead).toHaveBeenLastCalledWith(null, 'logo');
  });
});

describe('the printed document', () => {
  it('is HTML, so the app can make a PDF and the web can print the same markup', async () => {
    const html = await controller.document('e1');
    expect(typeof html).toBe('string');
    expect(html).toContain('EST-1');
  });

  it('inlines the letterhead rather than linking it', async () => {
    const html = await controller.document('e1');
    // The app renders this inside a PDF converter that fetches nothing.
    expect(html).toContain('data:image/png;base64,');
    expect(files.read).toHaveBeenCalledWith('f1');
  });

  it('still prints when the letterhead has gone missing', async () => {
    files.read.mockRejectedValue(new Error('No such file'));
    const html = await controller.document('e1');
    // A document nobody can send is worse than one with no letterhead.
    expect(html).toContain('EST-1');
  });

  it('asks for no file at all when the firm has none', async () => {
    estimates.forPrinting.mockResolvedValue({
      ...PRINTABLE,
      firm: { ...PRINTABLE.firm, letterheadFileId: null, logoFileId: null },
    });
    await controller.document('e1');
    expect(files.read).not.toHaveBeenCalled();
  });
});

describe('the estimates themselves', () => {
  it('records who wrote a quote', async () => {
    await controller.create({ clientName: 'Verma' } as never, USER);
    expect(estimates.create).toHaveBeenCalledWith({ clientName: 'Verma' }, 'u1');
  });

  it('passes the query, the id and the body straight through', async () => {
    await controller.list({ status: 'SENT' } as never);
    await controller.findOne('e1');
    await controller.update('e1', { notes: 'x' } as never, { id: 'u1' } as never);
    await controller.remove('e1');
    expect(estimates.list).toHaveBeenCalledWith({ status: 'SENT' });
    expect(estimates.findOne).toHaveBeenCalledWith('e1');
    expect(estimates.update).toHaveBeenCalledWith('e1', { notes: 'x' }, 'u1');
    expect(estimates.remove).toHaveBeenCalledWith('e1');
  });

  it('carries who converted a quote, since it writes an order', async () => {
    await controller.convert('e1', { location: 'Andheri' } as never, USER);
    expect(estimates.convertToOrder).toHaveBeenCalledWith('e1', { location: 'Andheri' }, 'u1');
  });

  it('sets the status a quote has reached', async () => {
    // The service takes the status itself, not the body it arrived in.
    await controller.setStatus('e1', { status: 'ACCEPTED' } as never, { id: 'u1' } as never);
    // Who sent it, so the enquiry's history has a name against the move.
    expect(estimates.setStatus).toHaveBeenCalledWith('e1', 'ACCEPTED', 'u1');
  });
});
