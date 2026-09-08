import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PayrollService, dayBefore, readRecoveries, totalsOf } from './payroll.service';
import { inTenant, prismaMock, ledgerMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const PEOPLE = [
  { id: 'e1', code: 'EMP-0001', name: 'Ramesh', designation: 'Operator', department: 'Production', status: 'ACTIVE' },
];

function build() {
  const db = prismaMock() as never as Db;
  const ledger = ledgerMock();
  const attendance = {
    summary: jest.fn(async () => ({
      from: '2026-09-01',
      to: '2026-09-30',
      rows: [{ employee: PEOPLE[0], payableDays: 26, overtimeMinutes: 0 }],
    })),
  };

  db.employee.findMany = jest.fn(async () => PEOPLE);
  db.employee.findFirst = jest.fn(async () => PEOPLE[0]);
  db.payStructure.findMany = jest.fn(async () => [
    {
      id: 's1',
      employeeId: 'e1',
      kind: 'MONTHLY',
      rate: 26000,
      pieceLabel: null,
      overtimeHourlyRate: null,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
    },
  ]);
  db.salaryAdvance.findMany = jest.fn(async () => []);
  db.salaryRun.findFirst = jest.fn(async () => null);
  db.salaryRun.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'r1',
    ...data,
  }));
  db.payslip.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'p1',
    ...data,
  }));

  return {
    service: new PayrollService(db as never, ledger as never, attendance as never),
    db,
    ledger,
    attendance,
  };
}

/**
 * The run as `run()` reads it back, since `open` finishes by fetching it.
 *
 * Nothing on the first call, because that one is `open` asking whether the
 * month is already there.
 */
function readsBack(db: Db, payslips: unknown[] = []) {
  let asked = 0;
  db.salaryRun.findFirst = jest.fn(async () => {
    asked += 1;
    if (asked === 1) return null;
    return {
      id: 'r1',
      month: new Date('2026-09-01T00:00:00.000Z'),
      status: 'DRAFT',
      workingDays: 26,
      payslips,
    };
  });
}

describe('putting somebody on an arrangement', () => {
  it('closes the one it replaces the day before, rather than editing it', async () => {
    const { service, db } = build();
    db.payStructure.findFirst = jest.fn(async () => ({
      id: 's1',
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    }));
    await inTenant(() =>
      service.setStructure({
        employeeId: 'e1',
        kind: 'MONTHLY' as never,
        rate: 30000,
        effectiveFrom: '2026-10-01',
      } as never),
    );
    // Last month's payslip has to still divide by last month's rate.
    expect(db.payStructure.update.mock.calls[0][0].data.effectiveTo).toEqual(
      new Date('2026-09-30T00:00:00.000Z'),
    );
  });

  it('refuses a raise dated before the arrangement it replaces', async () => {
    const { service, db } = build();
    db.payStructure.findFirst = jest.fn(async () => ({
      id: 's1',
      effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
    }));
    await expect(
      inTenant(() =>
        service.setStructure({
          employeeId: 'e1',
          kind: 'MONTHLY' as never,
          rate: 30000,
          effectiveFrom: '2026-01-01',
        } as never),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('insists on knowing what a piece is', async () => {
    const { service, db } = build();
    db.payStructure.findFirst = jest.fn(async () => null);
    // "Per piece" on a payslip tells nobody anything; "per panel" does.
    await expect(
      inTenant(() =>
        service.setStructure({
          employeeId: 'e1',
          kind: 'PIECE' as never,
          rate: 45,
          effectiveFrom: '2026-10-01',
        } as never),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an arrangement for somebody who does not work here', async () => {
    const { service, db } = build();
    db.employee.findFirst = jest.fn(async () => null);
    await expect(
      inTenant(() =>
        service.setStructure({
          employeeId: 'ghost',
          kind: 'MONTHLY' as never,
          rate: 1,
          effectiveFrom: '2026-10-01',
        } as never),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('works out the day before, across a month end', () => {
    expect(dayBefore(new Date('2026-10-01T00:00:00.000Z'))).toEqual(
      new Date('2026-09-30T00:00:00.000Z'),
    );
  });
});

describe('an advance', () => {
  it('leaves the drawer the day it is given', async () => {
    const { service, db, ledger } = build();
    db.salaryAdvance.create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'a1',
      ...data,
      employee: PEOPLE[0],
    }));
    await inTenant(() =>
      service.giveAdvance({
        employeeId: 'e1',
        amount: 5000,
        givenOn: '2026-09-05',
        mode: 'CASH' as never,
      } as never),
    );
    // Recording it only as a deduction would have the cash position wrong for
    // however long it took to reach a payslip.
    expect(ledger.post.mock.calls[0][0]).toMatchObject({
      sourceType: 'SalaryAdvance',
      direction: 'OUT',
      account: 'CASH',
      amount: 5000,
      accountHead: 'Salary advance',
      party: 'Ramesh',
    });
  });
});

describe('opening a month', () => {
  it('drafts a payslip from the register and the arrangement', async () => {
    const { service, db } = build();
    readsBack(db);
    await inTenant(() => service.open({ month: '2026-09', workingDays: 26 } as never));
    expect(db.payslip.create.mock.calls[0][0].data).toMatchObject({
      employeeId: 'e1',
      payableDays: 26,
      gross: 26000,
      net: 26000,
    });
  });

  it('divides by the days the shop calls a month', async () => {
    const { service, db } = build();
    readsBack(db);
    await inTenant(() => service.open({ month: '2026-09', workingDays: 30 } as never));
    // 26 days of a 30-day month, not a full salary.
    expect(db.payslip.create.mock.calls[0][0].data.gross).toBe(22533.33);
  });

  it('takes an outstanding advance off the first month it can', async () => {
    const { service, db } = build();
    readsBack(db);
    db.salaryAdvance.findMany = jest.fn(async () => [
      {
        id: 'a1',
        employeeId: 'e1',
        amount: 5000,
        recoveredAmount: 0,
        givenOn: new Date('2026-09-05T00:00:00.000Z'),
      },
    ]);
    await inTenant(() => service.open({ month: '2026-09', workingDays: 26 } as never));
    const written = db.payslip.create.mock.calls[0][0].data;
    expect(written).toMatchObject({ advanceDeducted: 5000, net: 21000 });
    // Which advance gave what, so paying cannot credit the wrong one.
    expect(written.recoveries).toEqual([{ advanceId: 'a1', amount: 5000 }]);
  });

  it('leaves out somebody with no arrangement at all', async () => {
    const { service, db } = build();
    readsBack(db);
    db.payStructure.findMany = jest.fn(async () => []);
    // A payslip of zero says the shop paid them nothing, which is a different
    // claim from "they are not on the payroll yet".
    await inTenant(() => service.open({ month: '2026-09', workingDays: 26 } as never));
    expect(db.payslip.create).not.toHaveBeenCalled();
  });

  it('refuses to open the same month twice', async () => {
    const { service, db } = build();
    db.salaryRun.findFirst = jest.fn(async () => ({ id: 'r1' }));
    // A shop that has adjusted a payslip should not lose it to a second click.
    await expect(
      inTenant(() => service.open({ month: '2026-09', workingDays: 26 } as never)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('paying it', () => {
  const payslip = (over: Record<string, unknown> = {}) => ({
    id: 'p1',
    employeeId: 'e1',
    net: 21000,
    gross: 26000,
    advanceDeducted: 5000,
    otherDeductions: 0,
    recoveries: [{ advanceId: 'a1', amount: 5000 }],
    employee: PEOPLE[0],
    ...over,
  });

  const approved = (payslips: unknown[]) => ({
    id: 'r1',
    month: new Date('2026-09-01T00:00:00.000Z'),
    status: 'APPROVED',
    workingDays: 26,
    payslips,
  });

  it('posts one ledger entry per person, not one for the payroll', async () => {
    const { service, db, ledger } = build();
    db.salaryRun.findFirst = jest.fn(async () => approved([payslip(), payslip({ id: 'p2' })]));
    await inTenant(() => service.pay('r1', { mode: 'ONLINE' as never } as never));
    // A single line for the whole payroll is a figure nobody can reconcile
    // against a person. ONLINE money lands in the bank, so that is the account.
    expect(ledger.post).toHaveBeenCalledTimes(2);
    expect(ledger.post.mock.calls[0][0]).toMatchObject({
      sourceType: 'Payslip',
      direction: 'OUT',
      account: 'BANK',
      amount: 21000,
      accountHead: 'Salary',
      party: 'Ramesh',
    });
  });

  it('credits each advance with what that advance gave back', async () => {
    const { service, db } = build();
    db.salaryRun.findFirst = jest.fn(async () => approved([payslip()]));
    await inTenant(() => service.pay('r1', { mode: 'CASH' as never } as never));
    expect(db.salaryAdvance.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'a1' },
      data: { recoveredAmount: { increment: 5000 } },
    });
  });

  it('posts nothing for somebody whose pay went entirely on an advance', async () => {
    const { service, db, ledger } = build();
    db.salaryRun.findFirst = jest.fn(async () => approved([payslip({ net: 0 })]));
    await inTenant(() => service.pay('r1', { mode: 'CASH' as never } as never));
    // No money moved, so no line in the books saying it did.
    expect(ledger.post).not.toHaveBeenCalled();
  });

  it('will not pay a month nobody has approved', async () => {
    const { service, db } = build();
    db.salaryRun.findFirst = jest.fn(async () => ({ ...approved([]), status: 'DRAFT' }));
    await expect(
      inTenant(() => service.pay('r1', { mode: 'CASH' as never } as never)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('will not pay the same month twice', async () => {
    const { service, db } = build();
    db.salaryRun.findFirst = jest.fn(async () => ({ ...approved([]), status: 'PAID' }));
    await expect(
      inTenant(() => service.pay('r1', { mode: 'CASH' as never } as never)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('changing a month', () => {
  it('will not touch one that has been paid', async () => {
    const { service, db } = build();
    db.salaryRun.findFirst = jest.fn(async () => ({ id: 'r1', status: 'PAID' }));
    await expect(service.adjust('r1', 'p1', {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws a draft away, but not an approved one', async () => {
    const { service, db } = build();
    db.salaryRun.findFirst = jest.fn(async () => ({ id: 'r1', status: 'DRAFT' }));
    await expect(service.discard('r1')).resolves.toEqual({ id: 'r1' });

    db.salaryRun.findFirst = jest.fn(async () => ({ id: 'r1', status: 'APPROVED' }));
    await expect(service.discard('r1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('reading what a payslip recovered', () => {
  it('takes a well-formed list', () => {
    expect(readRecoveries([{ advanceId: 'a1', amount: 500 }])).toEqual([
      { advanceId: 'a1', amount: 500 },
    ]);
  });

  it('answers nothing for a row written before the column existed', () => {
    // Better than crediting nothing at all to the wrong advance.
    expect(readRecoveries(null)).toEqual([]);
    expect(readRecoveries('nonsense' as never)).toEqual([]);
    expect(readRecoveries([{ advanceId: 'a1' }] as never)).toEqual([]);
  });
});

describe('what a month comes to', () => {
  it('adds the payslips up for the heading above them', () => {
    expect(
      totalsOf([
        { gross: 26000, advanceDeducted: 5000, otherDeductions: 0, net: 21000 } as never,
        { gross: 15400, advanceDeducted: 0, otherDeductions: 400, net: 15000 } as never,
      ]),
    ).toEqual({ gross: 41400, advances: 5000, deductions: 400, net: 36000, count: 2 });
  });
});
