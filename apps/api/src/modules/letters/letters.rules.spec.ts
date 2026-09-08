import { NotFoundException } from '@nestjs/common';
import { LettersService, longDate, salaryInWords, valuesFor } from './letters.service';
import { esc, formatDate, safeColor } from './letter-document';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const EMPLOYEE = {
  id: 'e1',
  code: 'EMP-0001',
  name: 'Ramesh Kumar',
  designation: 'CNC operator',
  department: 'Production',
  joinedOn: new Date('2026-04-01T00:00:00.000Z'),
  leftOn: null,
};

function build() {
  const db = prismaMock() as never as Db;
  db.letter.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'l1',
    ...data,
  }));
  return { service: new LettersService(db as never), db };
}

describe('drafting one', () => {
  it('fills the template in from the person it is about', async () => {
    const { service, db } = build();
    db.letterTemplate.findFirst = jest.fn(async () => ({
      kind: 'OFFER',
      name: 'Offer',
      body: 'Dear {{name}}, as {{designation}} at {{firmName}}, paid {{salary}}.',
    }));
    db.employee.findFirst = jest.fn(async () => EMPLOYEE);
    db.firmProfile.findFirst = jest.fn(async () => ({ name: 'Decor Bucket' }));
    db.payStructure.findFirst = jest.fn(async () => ({ kind: 'MONTHLY', rate: 26000 }));

    const draft = await service.draft('t1', 'e1');
    expect(draft.body).toBe(
      'Dear Ramesh Kumar, as CNC operator at Decor Bucket, paid ₹26,000 a month.',
    );
    expect(draft.title).toBe('Offer — Ramesh Kumar');
  });

  it('leaves a placeholder standing when nothing can fill it', async () => {
    const { service, db } = build();
    db.letterTemplate.findFirst = jest.fn(async () => ({
      kind: 'OFFER',
      name: 'Offer',
      body: 'Paid {{salary}} a month.',
    }));
    db.employee.findFirst = jest.fn(async () => EMPLOYEE);
    db.firmProfile.findFirst = jest.fn(async () => null);
    db.payStructure.findFirst = jest.fn(async () => null);

    // Nobody has set their pay yet. The braces are a question somebody can
    // answer; a blank space is a letter that goes out saying nothing.
    const draft = await service.draft('t1', 'e1');
    expect(draft.body).toBe('Paid {{salary}} a month.');
  });

  it('refuses a template or a person that is not there', async () => {
    const { service, db } = build();
    db.letterTemplate.findFirst = jest.fn(async () => null);
    db.employee.findFirst = jest.fn(async () => EMPLOYEE);
    db.firmProfile.findFirst = jest.fn(async () => null);
    await expect(service.draft('ghost', 'e1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('issuing one', () => {
  it('keeps the body as it was handed over', async () => {
    const { service, db } = build();
    db.employee.findFirst = jest.fn(async () => EMPLOYEE);
    await inTenant(() =>
      service.issue({
        employeeId: 'e1',
        kind: 'OFFER' as never,
        title: 'Offer — Ramesh Kumar',
        body: 'Dear Ramesh Kumar, we are pleased to offer you the post.',
      }),
    );
    /*
     * Not the template id and a promise to render it again later. A template
     * edited next year must not change what is in somebody's file from last
     * March: the copy they hold is the one that counts, and this is ours.
     */
    expect(db.letter.create.mock.calls[0][0].data.body).toContain('pleased to offer');
  });

  it('records who issued it, from the session', async () => {
    const { service, db } = build();
    db.employee.findFirst = jest.fn(async () => EMPLOYEE);
    await inTenant(() =>
      service.issue(
        { employeeId: 'e1', kind: 'NDA' as never, title: 'T', body: 'x'.repeat(30) },
        'u9',
      ),
    );
    expect(db.letter.create.mock.calls[0][0].data.issuedById).toBe('u9');
  });

  it('refuses one for somebody who does not work here', async () => {
    const { service, db } = build();
    db.employee.findFirst = jest.fn(async () => null);
    await expect(
      inTenant(() =>
        service.issue({
          employeeId: 'ghost',
          kind: 'OFFER' as never,
          title: 'T',
          body: 'x'.repeat(30),
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('what the placeholders stand for', () => {
  it('says the pay the way a letter should', () => {
    // Somebody takes this to a bank; "26000" is not what it should read.
    expect(salaryInWords({ kind: 'MONTHLY', rate: 26000 })).toBe('₹26,000 a month');
    expect(salaryInWords({ kind: 'DAILY', rate: 700 })).toBe('₹700 a day');
    expect(salaryInWords({ kind: 'PIECE', rate: 45 })).toBe('₹45 a piece');
  });

  it('writes a date out in full', () => {
    expect(longDate(new Date('2026-04-01T00:00:00.000Z'))).toBe('1 April 2026');
    expect(longDate(null)).toBe('');
  });

  it('gives an empty string for what nobody has recorded', () => {
    const values = valuesFor(
      { ...EMPLOYEE, designation: null, department: null },
      null,
      null,
      new Date('2026-09-09T00:00:00.000Z'),
    );
    expect(values).toMatchObject({
      name: 'Ramesh Kumar',
      designation: '',
      leftOn: '',
      firmName: '',
      today: '9 September 2026',
    });
  });
});

describe('printing one', () => {
  it('escapes what the shop typed', () => {
    // The body goes into a document that may be printed or opened in a
    // browser; a stray angle bracket in an address must not become markup.
    expect(esc('Plot 4 <B> & "C"')).toBe('Plot 4 &lt;B&gt; &amp; &quot;C&quot;');
  });

  it('lets only a hex colour into the stylesheet', () => {
    expect(safeColor('#E4232F')).toBe('#E4232F');
    expect(safeColor('red; } body { display:none')).toBeNull();
    expect(safeColor(null)).toBeNull();
  });

  it('dates itself the way a letter does', () => {
    expect(formatDate('2026-09-09T00:00:00.000Z')).toBe('9 September 2026');
  });
});
