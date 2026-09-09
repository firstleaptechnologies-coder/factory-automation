import { PERIODS, periodDates } from './report-periods';

const on = (iso: string) => new Date(`${iso}T10:00:00`);

describe('the windows offered', () => {
  it('offers no duplicate keys', () => {
    expect(new Set(PERIODS.map((p) => p.key)).size).toBe(PERIODS.length);
  });

  it('resolves every one it offers', () => {
    for (const period of PERIODS) {
      const dates = periodDates(period.key, on('2026-09-09'));
      expect(dates.from <= dates.to).toBe(true);
    }
  });
});

describe('months', () => {
  it('takes this month from the first to the last day', () => {
    expect(periodDates('thisMonth', on('2026-09-09'))).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
  });

  it('takes last month, crossing a year end', () => {
    expect(periodDates('lastMonth', on('2027-01-15'))).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });

  it('ends February on the right day in a leap year', () => {
    expect(periodDates('thisMonth', on('2028-02-10')).to).toBe('2028-02-29');
  });
});

describe('quarters, counted the way a return is filed', () => {
  // An Indian return's first quarter is April to June. Counting from January
  // would file the wrong three months under the right name.
  it('puts September in July–September, not July in Q3', () => {
    expect(periodDates('thisQuarter', on('2026-09-09'))).toEqual({
      from: '2026-07-01',
      to: '2026-09-30',
    });
  });

  it('starts the year at April', () => {
    expect(periodDates('thisQuarter', on('2026-04-02'))).toEqual({
      from: '2026-04-01',
      to: '2026-06-30',
    });
  });

  it('puts January in the January–March quarter of the same financial year', () => {
    expect(periodDates('thisQuarter', on('2027-01-20'))).toEqual({
      from: '2027-01-01',
      to: '2027-03-31',
    });
  });

  it('steps back a quarter across the year boundary', () => {
    expect(periodDates('lastQuarter', on('2026-04-20'))).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    });
  });

  it('steps back a quarter inside the year', () => {
    expect(periodDates('lastQuarter', on('2026-09-09'))).toEqual({
      from: '2026-04-01',
      to: '2026-06-30',
    });
  });
});

describe('the financial year', () => {
  // April to March, which is the only year an Indian shop's books have.
  it('runs April to March when the date is after April', () => {
    expect(periodDates('thisYear', on('2026-09-09'))).toEqual({
      from: '2026-04-01',
      to: '2027-03-31',
    });
  });

  it('belongs to the previous April when the date is before it', () => {
    expect(periodDates('thisYear', on('2027-02-14'))).toEqual({
      from: '2026-04-01',
      to: '2027-03-31',
    });
  });
});
