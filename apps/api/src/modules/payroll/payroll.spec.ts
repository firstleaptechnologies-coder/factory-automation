import { activeIn, earnings, net, overtimeLine, recoverAdvances, round2 } from './payroll';

const on = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const monthly = (rate: number, over?: number) => ({
  kind: 'MONTHLY' as never,
  rate,
  overtimeHourlyRate: over ?? null,
  effectiveFrom: on('2026-01-01'),
});

const daily = (rate: number, over?: number) => ({
  kind: 'DAILY' as never,
  rate,
  overtimeHourlyRate: over ?? null,
  effectiveFrom: on('2026-01-01'),
});

const piece = (rate: number, label?: string) => ({
  kind: 'PIECE' as never,
  rate,
  pieceLabel: label ?? null,
  overtimeHourlyRate: null,
  effectiveFrom: on('2026-01-01'),
});

const month = { payableDays: 26, overtimeMinutes: 0, workingDays: 26 };

describe('a monthly salary', () => {
  it('pays the whole thing for a whole month', () => {
    const { gross } = earnings({ structures: [monthly(30000)], ...month });
    expect(gross).toBe(30000);
  });

  it('is divided by the days the shop calls a month, not by the calendar', () => {
    // Plenty of shops pay for 26 days. Dividing by 30 would quietly dock
    // everybody four days.
    const { gross } = earnings({
      structures: [monthly(26000)],
      payableDays: 13,
      overtimeMinutes: 0,
      workingDays: 26,
    });
    expect(gross).toBe(13000);
  });

  it('never pays more than the salary, however many days were worked', () => {
    // Somebody who came in on a Sunday has more payable days than the month
    // has. A salary is a salary; the extra is overtime's business.
    const { gross } = earnings({
      structures: [monthly(30000)],
      payableDays: 29,
      overtimeMinutes: 0,
      workingDays: 26,
    });
    expect(gross).toBe(30000);
  });

  it('pays nothing for a month nobody worked', () => {
    const { gross } = earnings({
      structures: [monthly(30000)],
      payableDays: 0,
      overtimeMinutes: 0,
      workingDays: 26,
    });
    expect(gross).toBe(0);
  });

  it('does not divide by nothing when the run says zero days', () => {
    const { gross } = earnings({
      structures: [monthly(30000)],
      payableDays: 10,
      overtimeMinutes: 0,
      workingDays: 0,
    });
    expect(gross).toBe(0);
  });
});

describe('a daily wage', () => {
  it('multiplies the days actually worked', () => {
    const { gross } = earnings({
      structures: [daily(700)],
      payableDays: 22,
      overtimeMinutes: 0,
      workingDays: 26,
    });
    expect(gross).toBe(15400);
  });

  it('pays half a day for a half day', () => {
    // The one sum a shop would notice immediately if it were wrong.
    const { gross } = earnings({
      structures: [daily(700)],
      payableDays: 21.5,
      overtimeMinutes: 0,
      workingDays: 26,
    });
    expect(gross).toBe(15050);
  });
});

describe('piece work', () => {
  it('multiplies what was counted, in the shop’s own word', () => {
    const { lines } = earnings({
      structures: [piece(45, 'panel')],
      payableDays: 26,
      overtimeMinutes: 0,
      workingDays: 26,
      pieces: 120,
    });
    expect(lines[0]).toMatchObject({ label: 'Per panel', quantity: 120, amount: 5400 });
  });

  it('leaves the line off entirely when nothing has been counted', () => {
    // A line reading ₹0 says the person made nothing; an absent line says
    // nobody has filled it in, which is what is true.
    const { lines } = earnings({ structures: [piece(45)], ...month });
    expect(lines).toEqual([]);
  });
});

describe('a mix, which is the point of the model', () => {
  it('gives a line for each arrangement somebody is on', () => {
    // A base salary plus a rate per panel is a real arrangement, and choosing
    // one shape for the product would have made it unrepresentable.
    const { lines, gross } = earnings({
      structures: [monthly(20000), piece(45, 'panel')],
      payableDays: 26,
      overtimeMinutes: 0,
      workingDays: 26,
      pieces: 100,
    });
    expect(lines.map((line) => line.label)).toEqual(['Salary', 'Per panel']);
    expect(gross).toBe(24500);
  });
});

describe('overtime', () => {
  it('is paid by the hour, from minutes', () => {
    const { lines } = earnings({
      structures: [monthly(26000, 120)],
      payableDays: 26,
      overtimeMinutes: 150,
      workingDays: 26,
    });
    expect(lines[1]).toMatchObject({ label: 'Overtime', quantity: 2.5, amount: 300 });
  });

  it('is not paid at all when no arrangement names a rate', () => {
    const { lines } = earnings({
      structures: [monthly(26000)],
      payableDays: 26,
      overtimeMinutes: 600,
      workingDays: 26,
    });
    expect(lines.map((line) => line.kind)).toEqual(['MONTHLY']);
  });

  it('is paid once, at the shop’s latest word on what an hour is worth', () => {
    const older = { ...daily(700, 100), effectiveFrom: on('2026-01-01') };
    const newer = { ...monthly(26000, 150), effectiveFrom: on('2026-06-01') };
    const line = overtimeLine([older, newer], 60);
    expect(line).toMatchObject({ rate: 150, amount: 150 });
  });

  it('is nothing when nobody stayed late', () => {
    expect(overtimeLine([monthly(26000, 150)], 0)).toBeNull();
  });
});

describe('taking advances back', () => {
  const advance = (id: string, amount: number, givenOn: string, recovered = 0) => ({
    id,
    amount,
    recoveredAmount: recovered,
    givenOn: on(givenOn),
  });

  it('takes the oldest first', () => {
    const { recoveries } = recoverAdvances(
      [advance('a2', 2000, '2026-08-20'), advance('a1', 1000, '2026-08-01')],
      10000,
    );
    expect(recoveries.map((one) => one.advanceId)).toEqual(['a1', 'a2']);
  });

  it('never takes more than the pay, because a payslip is not a bill', () => {
    // The rest stays outstanding and comes off next month.
    const { recoveries, total } = recoverAdvances([advance('a1', 9000, '2026-08-01')], 4000);
    expect(total).toBe(4000);
    expect(recoveries).toEqual([{ advanceId: 'a1', amount: 4000 }]);
  });

  it('stops once the pay is used up, leaving the later ones alone', () => {
    const { recoveries } = recoverAdvances(
      [advance('a1', 3000, '2026-08-01'), advance('a2', 3000, '2026-08-10')],
      3000,
    );
    expect(recoveries).toEqual([{ advanceId: 'a1', amount: 3000 }]);
  });

  it('ignores one that has already been paid back', () => {
    const { total } = recoverAdvances([advance('a1', 3000, '2026-08-01', 3000)], 10000);
    expect(total).toBe(0);
  });

  it('takes the remainder of a part-recovered one', () => {
    const { recoveries } = recoverAdvances([advance('a1', 3000, '2026-08-01', 1200)], 10000);
    expect(recoveries).toEqual([{ advanceId: 'a1', amount: 1800 }]);
  });

  it('takes nothing from a month that earned nothing', () => {
    expect(recoverAdvances([advance('a1', 3000, '2026-08-01')], 0).total).toBe(0);
  });
});

describe('what is handed over', () => {
  it('is the gross less what was held back', () => {
    expect(net(20000, 3000, 500)).toBe(16500);
  });

  it('never goes below nothing', () => {
    expect(net(2000, 3000, 0)).toBe(0);
  });
});

describe('which arrangements applied in a month', () => {
  const structure = (from: string, to?: string) => ({
    effectiveFrom: on(from),
    effectiveTo: to ? on(to) : null,
  });

  it('includes one that started before the month and has not ended', () => {
    const kept = activeIn([structure('2026-01-01')], on('2026-09-30'), on('2026-09-01'));
    expect(kept).toHaveLength(1);
  });

  it('leaves out one that had already been replaced', () => {
    // A raise is a new row; last month's payslip must still divide by last
    // month's rate.
    const kept = activeIn(
      [structure('2026-01-01', '2026-08-31')],
      on('2026-09-30'),
      on('2026-09-01'),
    );
    expect(kept).toHaveLength(0);
  });

  it('leaves out one that has not started yet', () => {
    const kept = activeIn([structure('2026-10-01')], on('2026-09-30'), on('2026-09-01'));
    expect(kept).toHaveLength(0);
  });

  it('keeps one that began part-way through the month', () => {
    const kept = activeIn([structure('2026-09-15')], on('2026-09-30'), on('2026-09-01'));
    expect(kept).toHaveLength(1);
  });
});

describe('rounding', () => {
  it('holds two decimals without the float creeping', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(15050.000000001)).toBe(15050);
  });
});
