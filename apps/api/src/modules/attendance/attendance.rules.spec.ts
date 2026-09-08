import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttendanceService, registerFilter, summarise } from './attendance.service';
import { inTenant, prismaMock } from '../../../test/prisma-mock';

type Db = Record<string, Record<string, jest.Mock>>;

const PEOPLE = [
  { id: 'e1', code: 'EMP-0001', name: 'Ramesh', designation: 'Operator', department: 'Production', status: 'ACTIVE' },
  { id: 'e2', code: 'EMP-0002', name: 'Iqbal', designation: 'Polisher', department: 'Finishing', status: 'ACTIVE' },
];

function build(people = PEOPLE, marked: unknown[] = []) {
  const db = prismaMock() as never as Db;
  // Honest about the filter, because the "is this person one of ours" check
  // is precisely a question about which rows come back.
  db.employee.findMany = jest.fn(async (args?: { where?: { id?: { in?: string[] } } }) => {
    const wanted = args?.where?.id?.in;
    return wanted ? people.filter((person) => wanted.includes(person.id)) : people;
  });
  db.attendance.findMany = jest.fn(async () => marked);
  return { service: new AttendanceService(db as never), db };
}

describe('the register for one day', () => {
  it('leads with the people, not with the rows already entered', async () => {
    const { service } = build();
    const day = await service.day({ date: '2026-09-09' });
    // A register showing only what was entered would make a morning nobody
    // marked look like a morning nobody came in.
    expect(day.rows.map((row) => row.employee.name)).toEqual(['Ramesh', 'Iqbal']);
    expect(day.rows.every((row) => row.marked === false)).toBe(true);
  });

  it('carries what somebody was marked, when they were', async () => {
    const { service } = build(PEOPLE, [
      {
        employeeId: 'e2',
        mark: 'HALF_DAY',
        inAt: null,
        outAt: null,
        overtimeMinutes: 45,
        note: 'Left after lunch',
        markedBy: { id: 'u1', name: 'Nakul' },
      },
    ]);
    const day = await service.day({ date: '2026-09-09' });
    const iqbal = day.rows.find((row) => row.employee.id === 'e2')!;
    expect(iqbal).toMatchObject({
      marked: true,
      mark: 'HALF_DAY',
      overtimeMinutes: 45,
      note: 'Left after lunch',
    });
  });

  it('leaves out the people who have gone', async () => {
    const { service, db } = build();
    await service.day({ date: '2026-09-09' });
    expect(db.employee.findMany.mock.calls[0][0].where.status).toEqual({ not: 'LEFT' });
  });
});

describe('marking it', () => {
  it('writes one row per person per day, correcting rather than repeating', async () => {
    const { service, db } = build();
    await inTenant(() =>
      service.markDay({
        date: '2026-09-09',
        marks: [{ employeeId: 'e1', mark: 'PRESENT' as never }],
      }),
    );
    // Marking the same day twice must not count anybody twice.
    const call = db.attendance.upsert.mock.calls[0][0];
    expect(call.where.tenantId_employeeId_date).toMatchObject({
      employeeId: 'e1',
      date: new Date('2026-09-09T00:00:00.000Z'),
    });
  });

  it('records who marked it, from the session', async () => {
    const { service, db } = build();
    await inTenant(() =>
      service.markDay(
        { date: '2026-09-09', marks: [{ employeeId: 'e1', mark: 'PRESENT' as never }] },
        'u9',
      ),
    );
    expect(db.attendance.upsert.mock.calls[0][0].create.markedById).toBe('u9');
  });

  it('marks the whole shop in one transaction', async () => {
    const { service, db } = build();
    await inTenant(() =>
      service.markDay({
        date: '2026-09-09',
        marks: [
          { employeeId: 'e1', mark: 'PRESENT' as never },
          { employeeId: 'e2', mark: 'ABSENT' as never },
        ],
      }),
    );
    // Half a marked register is worse than an unmarked one: nobody can tell
    // which half.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.attendance.upsert).toHaveBeenCalledTimes(2);
  });

  it('refuses a name that is not on the staff list', async () => {
    const { service } = build();
    await expect(
      inTenant(() =>
        service.markDay({
          date: '2026-09-09',
          marks: [
            { employeeId: 'e1', mark: 'PRESENT' as never },
            { employeeId: 'ghost', mark: 'PRESENT' as never },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses an empty register', async () => {
    const { service } = build();
    await expect(
      inTenant(() => service.markDay({ date: '2026-09-09', marks: [] })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('what a set of days comes to', () => {
  const days = (marks: string[]) =>
    marks.map((mark) => ({ mark: mark as never, overtimeMinutes: 0 }));

  it('counts a half day as half, which is the one sum a shop would spot', () => {
    expect(summarise(days(['PRESENT', 'PRESENT', 'HALF_DAY'])).payableDays).toBe(2.5);
  });

  it('keeps the kinds of day apart', () => {
    const summary = summarise(
      days(['PRESENT', 'ABSENT', 'LEAVE', 'HOLIDAY', 'WEEKLY_OFF', 'HALF_DAY']),
    );
    expect(summary).toMatchObject({
      present: 1,
      halfDays: 1,
      absent: 1,
      leave: 1,
      // A festival and the weekly off are both days the shop was shut.
      holidays: 2,
    });
  });

  it('adds the overtime up in minutes, because half an hour is a real answer', () => {
    expect(
      summarise([
        { mark: 'PRESENT' as never, overtimeMinutes: 30 },
        { mark: 'PRESENT' as never, overtimeMinutes: 90 },
      ]).overtimeMinutes,
    ).toBe(120);
  });

  it('answers zero for somebody with no days at all', () => {
    expect(summarise([])).toMatchObject({ present: 0, payableDays: 0, overtimeMinutes: 0 });
  });
});

describe('which days a view covers', () => {
  it('takes both ends of the window as whole days', () => {
    expect(registerFilter({ from: '2026-09-01', to: '2026-09-30' }).date).toEqual({
      gte: new Date('2026-09-01T00:00:00.000Z'),
      lte: new Date('2026-09-30T00:00:00.000Z'),
    });
  });

  it('narrows to one person when asked', () => {
    expect(registerFilter({ from: '2026-09-01', to: '2026-09-30', employeeId: 'e1' })).toMatchObject(
      { employeeId: 'e1' },
    );
  });
});

describe('the month, per person', () => {
  it('gives everybody a line, including whoever was never marked', async () => {
    const { service, db } = build();
    db.attendance.findMany = jest.fn(async () => [
      { employeeId: 'e1', mark: 'PRESENT', overtimeMinutes: 0 },
      { employeeId: 'e1', mark: 'HALF_DAY', overtimeMinutes: 60 },
    ]);
    const summary = await service.summary({ from: '2026-09-01', to: '2026-09-30' });
    // Iqbal was never marked and still gets a line, reading zero.
    expect(summary.rows.map((row) => [row.employee.name, row.payableDays])).toEqual([
      ['Ramesh', 1.5],
      ['Iqbal', 0],
    ]);
  });
});
