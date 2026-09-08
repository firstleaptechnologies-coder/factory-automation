import { LettersController } from './letters.controller';

const letters = {
  templates: jest.fn(async (..._a: unknown[]) => 'templates'),
  createTemplate: jest.fn(async (..._a: unknown[]) => 'created'),
  updateTemplate: jest.fn(async (..._a: unknown[]) => 'updated'),
  draft: jest.fn(async (..._a: unknown[]) => ({ kind: 'OFFER', title: 'T', body: 'B' })),
  letters: jest.fn(async (..._a: unknown[]) => 'letters'),
  letter: jest.fn(async (..._a: unknown[]) => ({
    title: 'Offer — Ramesh',
    body: 'Dear Ramesh,\n\nWelcome.',
    issuedOn: new Date('2026-09-09T00:00:00.000Z'),
    kind: 'OFFER',
    employee: { name: 'Ramesh', code: 'EMP-0001' },
  })),
  issue: jest.fn(async (..._a: unknown[]) => 'issued'),
};

const files = { read: jest.fn(async () => ({ file: { mimeType: 'image/png' }, data: Buffer.from('x') })) };
const prisma = { firmProfile: { findFirst: jest.fn(async () => ({ name: 'Decor Bucket' })) } };

const controller = new LettersController(letters as never, files as never, prisma as never);

beforeEach(() => jest.clearAllMocks());

it('narrows templates to one kind when asked', async () => {
  await controller.templates('NDA' as never);
  expect(letters.templates).toHaveBeenCalledWith('NDA');
});

it('records who issued a letter, from the session', async () => {
  await controller.issue({ title: 'T' } as never, { id: 'u9' } as never);
  expect(letters.issue).toHaveBeenCalledWith({ title: 'T' }, 'u9');
});

it('drafts from a template and a person together', async () => {
  await controller.draft('t1', 'e1');
  expect(letters.draft).toHaveBeenCalledWith('t1', 'e1');
});

it('prints the letter on the shop’s own page', async () => {
  const html = await controller.document('l1');
  expect(html).toContain('Offer — Ramesh');
  expect(html).toContain('Decor Bucket');
  // The body's paragraphs survive as paragraphs.
  expect(html).toContain('<p>Dear Ramesh,</p>');
});

it('prints without a letterhead when the shop has none', async () => {
  prisma.firmProfile.findFirst = jest.fn(async () => ({ name: 'Decor Bucket' }));
  const html = await controller.document('l1');
  // The firm block stands in, rather than a broken image on a letter somebody
  // is about to hand over.
  expect(html).toContain('class="firm"');
  expect(files.read).not.toHaveBeenCalled();
});
