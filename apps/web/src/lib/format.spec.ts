import {
  formatCurrencyInr,
  formatDate,
  formatDateShort,
  formatDateTime,
  formatInr,
  relativeTime,
} from './format';

describe('money', () => {
  it('formats in the Indian grouping, not thousands', () => {
    // ₹4,72,000 — a shop reading ₹472,000 has to stop and count digits.
    expect(formatCurrencyInr(472000)).toBe('₹4,72,000');
  });

  it('rounds to whole rupees', () => {
    expect(formatCurrencyInr(1076.4)).toBe('₹1,076');
  });

  it('accepts a decimal string, as Prisma hands them back', () => {
    expect(formatCurrencyInr('47200.00')).toBe('₹47,200');
  });

  it('shows nothing as zero rather than NaN', () => {
    expect(formatCurrencyInr(null)).toBe('₹0');
    expect(formatCurrencyInr(undefined)).toBe('₹0');
  });

  it('keeps a negative readable', () => {
    expect(formatInr(-500)).toBe('-₹500');
  });

  it('formatInr agrees with formatCurrencyInr, so no screen disagrees', () => {
    for (const value of [0, 1, 999, 100000, 12345678]) {
      expect(formatInr(value)).toBe(formatCurrencyInr(value));
    }
  });
});

describe('dates', () => {
  const date = new Date('2026-03-09T10:30:00Z');

  it('writes a date the way it is read out loud here', () => {
    expect(formatDate(date)).toMatch(/09 Mar 2026/);
  });

  it('accepts the ISO string the API returns', () => {
    expect(formatDate('2026-03-09T10:30:00Z')).toBe(formatDate(date));
  });

  it('shows an em dash for nothing, not "Invalid Date"', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDateShort(undefined)).toBe('—');
    expect(formatDateTime(null)).toBe('—');
  });

  it('drops the year on the short form, for dense lists', () => {
    expect(formatDateShort(date)).toMatch(/09 Mar/);
    expect(formatDateShort(date)).not.toMatch(/2026/);
  });

  it('includes the time on the long form', () => {
    expect(formatDateTime(date)).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-09-07T12:00:00Z').getTime();
  beforeAll(() => jest.spyOn(Date, 'now').mockReturnValue(now));
  afterAll(() => jest.restoreAllMocks());

  const ago = (ms: number) => new Date(now - ms);

  it('says "just now" inside the first minute', () => {
    expect(relativeTime(ago(30_000))).toBe('just now');
  });

  it('counts minutes, then hours, then days', () => {
    expect(relativeTime(ago(5 * 60_000))).toBe('5m ago');
    expect(relativeTime(ago(3 * 3_600_000))).toBe('3h ago');
    expect(relativeTime(ago(4 * 86_400_000))).toBe('4d ago');
  });

  it('falls back to a real date once it is old enough to need one', () => {
    // "47d ago" tells nobody when something happened.
    expect(relativeTime(ago(60 * 86_400_000))).toMatch(/2026/);
  });

  it('shows an em dash for nothing', () => {
    expect(relativeTime(null)).toBe('—');
  });
});
