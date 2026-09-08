import { Prisma } from '@prisma/client';
import { CodeGeneratorService, financialYear } from './code-generator.service';
import { inTenant } from '../../../test/prisma-mock';

describe('financialYear', () => {
  it('runs April to March, as the Indian financial year does', () => {
    // 1 April 2026 starts FY 2026–27.
    expect(financialYear(new Date('2026-04-01T00:00:00Z'))).toBe('2627');
    expect(financialYear(new Date('2026-12-31T00:00:00Z'))).toBe('2627');
    // 31 March 2027 is still FY 2026–27.
    expect(financialYear(new Date('2027-03-31T00:00:00Z'))).toBe('2627');
    // 1 April 2027 rolls over.
    expect(financialYear(new Date('2027-04-01T00:00:00Z'))).toBe('2728');
  });

  it('puts January to March in the year that began the previous April', () => {
    // The trap: a January order numbered with the calendar year would restart
    // the sequence three months early.
    expect(financialYear(new Date('2027-01-15T00:00:00Z'))).toBe('2627');
  });

  it('is always four digits', () => {
    for (const iso of ['2026-04-01', '2027-03-31', '2030-06-15', '2099-12-01']) {
      expect(financialYear(new Date(`${iso}T00:00:00Z`))).toMatch(/^\d{4}$/);
    }
  });
});

describe('which counters restart in April', () => {
  const nextFor = async (entity: string) => {
    const rows: Record<string, number> = {};
    const db = {
      documentSequence: {
        update: jest.fn(async ({ where }: { where: { tenantId_key: { key: string } } }) => {
          const key = where.tenantId_key.key;
          if (!(key in rows)) {
            // The real thing throws Prisma's own error, and the service tells
            // "no counter yet" from a genuine failure by its class.
            throw new Prisma.PrismaClientKnownRequestError('No counter yet', {
              code: 'P2025',
              clientVersion: 'test',
            });
          }
          rows[key] += 1;
          return { value: rows[key] };
        }),
        create: jest.fn(async ({ data }: { data: { key: string } }) => {
          rows[data.key] = 1;
          return { value: 1 };
        }),
      },
    };
    const service = new CodeGeneratorService(db as never);
    return inTenant(() => service.next(entity as never, undefined, new Date('2026-09-09')));
  };

  it('dates a document, because that is what the paper shows', async () => {
    await expect(nextFor('order')).resolves.toBe('ORD-2627-0001');
    await expect(nextFor('estimate')).resolves.toBe('EST-2627-0001');
  });

  it('does not date an employee number', async () => {
    // A person whose number changed every April would be no use to anybody,
    // least of all to the payroll of the year before.
    await expect(nextFor('employee')).resolves.toBe('EMP-0001');
  });
});
