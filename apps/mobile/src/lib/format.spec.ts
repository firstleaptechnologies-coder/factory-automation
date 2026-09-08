import { formatDateShort, formatDateTime, formatInr, relativeTime } from './format';

describe('formatInr', () => {
  it('groups in lakhs the way the figure is read out loud', () => {
    expect(formatInr(47200)).toBe('₹47,200');
  });

  it('shortens a lakh so a large figure still fits a phone card', () => {
    expect(formatInr(250000)).toBe('₹2.50 L');
  });

  it('shortens a crore', () => {
    expect(formatInr(12500000)).toBe('₹1.25 Cr');
  });

  it('switches to lakhs exactly at one lakh, not before', () => {
    expect(formatInr(99999)).toBe('₹99,999');
    expect(formatInr(100000)).toBe('₹1.00 L');
  });

  it('switches to crores exactly at one crore', () => {
    expect(formatInr(9999999)).toBe('₹100.00 L');
    expect(formatInr(10000000)).toBe('₹1.00 Cr');
  });

  it('accepts the decimal strings the API returns', () => {
    expect(formatInr('47200.00')).toBe('₹47,200');
  });

  it('shows nothing as zero rather than NaN', () => {
    expect(formatInr(null)).toBe('₹0');
    expect(formatInr(undefined)).toBe('₹0');
  });
});

describe('dates', () => {
  const date = new Date('2026-03-09T10:30:00Z');

  it('drops the year, for dense lists on a small screen', () => {
    expect(formatDateShort(date)).toMatch(/09 Mar/);
    expect(formatDateShort(date)).not.toMatch(/2026/);
  });

  it('includes the time on the long form', () => {
    expect(formatDateTime(date)).toMatch(/\d{2}:\d{2}/);
  });

  it('accepts the ISO string the API returns', () => {
    expect(formatDateShort('2026-03-09T10:30:00Z')).toBe(formatDateShort(date));
  });

  it('shows an em dash for nothing, not "Invalid Date"', () => {
    expect(formatDateShort(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
    expect(relativeTime(null)).toBe('—');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-09-07T12:00:00Z').getTime();
  beforeAll(() => jest.spyOn(Date, 'now').mockReturnValue(now));
  afterAll(() => jest.restoreAllMocks());

  const ago = (ms: number) => new Date(now - ms);

  it('says "just now" inside the first minute', () => {
    expect(relativeTime(ago(20_000))).toBe('just now');
  });

  it('counts minutes, hours, then days', () => {
    expect(relativeTime(ago(5 * 60_000))).toBe('5m ago');
    expect(relativeTime(ago(3 * 3_600_000))).toBe('3h ago');
    expect(relativeTime(ago(3 * 86_400_000))).toBe('3d ago');
  });

  it('gives a real date once "Nd ago" stops meaning anything', () => {
    expect(relativeTime(ago(30 * 86_400_000))).toMatch(/[A-Z][a-z]{2}/);
  });
});
