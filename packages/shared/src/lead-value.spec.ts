import { leadValue, leadValueSource } from './lead-value';

describe('what an enquiry is worth', () => {
  it('believes the quotation over everything — somebody was told that number', () => {
    const lead = { quotedValue: '80000', grandTotal: '60534', estimatedValue: '50000' };
    expect(leadValue(lead)).toBe(80000);
    expect(leadValueSource(lead)).toBe('quoted');
  });

  it('believes the priced lines over a guess', () => {
    const lead = { quotedValue: null, grandTotal: '60534', estimatedValue: '50000' };
    expect(leadValue(lead)).toBe(60534);
    expect(leadValueSource(lead)).toBe('priced');
  });

  it('falls back to the guess when nothing has been priced', () => {
    const lead = { quotedValue: null, grandTotal: '0', estimatedValue: '50000' };
    expect(leadValue(lead)).toBe(50000);
    expect(leadValueSource(lead)).toBe('estimated');
  });

  it('reads an unpriced total as unpriced, not as a price of nothing', () => {
    // Every enquiry has grandTotal 0 until somebody prices it, so zero must
    // not win over a guess of 50,000.
    expect(leadValue({ grandTotal: 0, estimatedValue: 50000 })).toBe(50000);
  });

  it('says nothing when the enquiry carries no figure at all', () => {
    expect(leadValue({ quotedValue: null, grandTotal: '0', estimatedValue: null })).toBeNull();
    expect(leadValueSource({})).toBeNull();
  });

  it('follows a repricing, because it is derived rather than stored', () => {
    // The bug this exists for: an enquiry repriced from GST-on-top to
    // GST-included showed the old figure on its card and the new one on its
    // lines, in the same view.
    const before = { grandTotal: '60534', estimatedValue: '60534' };
    const after = { grandTotal: '51300', estimatedValue: '60534' };
    expect(leadValue(before)).toBe(60534);
    expect(leadValue(after)).toBe(51300);
  });

  it('takes numbers as readily as the strings Prisma hands back', () => {
    expect(leadValue({ grandTotal: 60534 })).toBe(60534);
  });

  it('ignores a figure that is not one', () => {
    expect(leadValue({ grandTotal: 'n/a', estimatedValue: '50000' })).toBe(50000);
  });
});
