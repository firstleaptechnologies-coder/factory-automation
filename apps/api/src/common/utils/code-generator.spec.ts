import { financialYear } from './code-generator.service';

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
