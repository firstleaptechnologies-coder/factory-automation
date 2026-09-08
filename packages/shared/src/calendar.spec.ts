import { isoDate, monthBounds, shiftDay, shiftMonth, thisMonth, today } from './calendar';

describe('the day the person is having', () => {
  it('answers in local time, not UTC', () => {
    // 00:30 on the 9th in a shop running +05:30 is still the 9th. Read as UTC
    // it is the 8th, and the register would open on yesterday.
    const at = new Date(2026, 8, 9, 0, 30);
    expect(today(at)).toBe('2026-09-09');
    expect(isoDate(at)).toBe('2026-09-09');
  });

  it('is late in the evening too, which UTC gets wrong the other way', () => {
    const at = new Date(2026, 8, 9, 23, 45);
    expect(today(at)).toBe('2026-09-09');
  });

  it('pads a single-digit month and day', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('names the month the same way', () => {
    expect(thisMonth(new Date(2026, 8, 9))).toBe('2026-09');
  });
});

describe('stepping a day', () => {
  it('goes forwards and back', () => {
    expect(shiftDay('2026-09-09', 1)).toBe('2026-09-10');
    expect(shiftDay('2026-09-09', -1)).toBe('2026-09-08');
  });

  it('steps over a month end, which is where naive arithmetic goes wrong', () => {
    expect(shiftDay('2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30');
  });

  it('knows February', () => {
    expect(shiftDay('2027-03-01', -1)).toBe('2027-02-28');
    // 2028 is a leap year.
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('stepping a month', () => {
  it('goes forwards and back, and over a year end', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('the bounds of a month', () => {
  it('runs the first to the last, whatever length it is', () => {
    expect(monthBounds('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});
