import { PricingMode, TaxTreatment } from '@prisma/client';
import { oneSlab, pricedFromQuote } from './estimate-pricing';

const quote = (over: Record<string, unknown> = {}) => ({
  taxTreatment: TaxTreatment.EXCLUSIVE,
  total: 43200,
  grandTotal: 50976,
  items: [{ gstSlabId: 'g18' }],
  ...over,
});

it('always prices the order as a lump sum', () => {
  // The lines are what the shop will cut; the figure is what was agreed. A
  // per-line rate here would be a number nobody quoted.
  expect(pricedFromQuote(quote()).pricingMode).toBe(PricingMode.LUMP_SUM);
});

/*
 * The subtlety that once invoiced a client ₹5,02,656 for a quote they had
 * agreed at ₹4,25,980.
 */
describe('the figure it hands over', () => {
  it('is the taxable value when GST goes on top', () => {
    // LUMP_SUM under EXCLUSIVE adds GST to whatever it is given, so giving it
    // the gross would tax a figure that already includes tax.
    expect(pricedFromQuote(quote({ taxTreatment: TaxTreatment.EXCLUSIVE })).total).toBe(43200);
  });

  it('is what the client pays when the tax comes out of it', () => {
    for (const treatment of [TaxTreatment.INCLUSIVE, TaxTreatment.ABSORBED]) {
      expect(pricedFromQuote(quote({ taxTreatment: treatment })).total).toBe(50976);
    }
  });

  it('carries the treatment across unchanged', () => {
    expect(pricedFromQuote(quote({ taxTreatment: TaxTreatment.ABSORBED })).taxTreatment).toBe(
      TaxTreatment.ABSORBED,
    );
  });

  it('reads a Decimal that arrives as a string', () => {
    expect(pricedFromQuote(quote({ total: '43200.00' })).total).toBe(43200);
  });
});

describe('the rate it was quoted at', () => {
  it('carries the slab when the whole quote used one', () => {
    expect(pricedFromQuote(quote()).gstSlabId).toBe('g18');
  });

  it('carries none when the quote mixed several, rather than guessing', () => {
    const mixed = quote({ items: [{ gstSlabId: 'g18' }, { gstSlabId: 'g5' }] });
    // The shop's default is not necessarily what any of these lines agreed to.
    expect(pricedFromQuote(mixed).gstSlabId).toBeUndefined();
  });

  it('carries none when the quote named no slab at all', () => {
    expect(pricedFromQuote(quote({ items: [{ gstSlabId: null }] })).gstSlabId).toBeUndefined();
  });
});

describe('oneSlab', () => {
  it('is the slab when every line shares it', () => {
    expect(oneSlab([{ gstSlabId: 'g18' }, { gstSlabId: 'g18' }])).toBe('g18');
  });

  it('is nothing for a mixture, a null, or no lines at all', () => {
    expect(oneSlab([{ gstSlabId: 'g18' }, { gstSlabId: null }])).toBeUndefined();
    expect(oneSlab([{ gstSlabId: null }])).toBeUndefined();
    expect(oneSlab([])).toBeUndefined();
  });
});
