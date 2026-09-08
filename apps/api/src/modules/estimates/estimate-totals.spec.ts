import { splitTax } from '../../common/utils/pricing';
import { estimateTotals } from './estimate-totals';

/** One line, priced the way the service prices it. */
function line(qty: number, rate: number, discountPct: number, gstPct: number) {
  const gross = qty * rate;
  const discountAmount = Number(((gross * discountPct) / 100).toFixed(2));
  const split = splitTax(Number((gross - discountAmount).toFixed(2)), gstPct, 'EXCLUSIVE');
  return {
    discountAmount,
    taxAmount: split.tax,
    netAmount: split.net,
    amount: split.gross,
  };
}

describe('estimateTotals', () => {
  it('reproduces the shop’s own sample estimate', () => {
    // 20 Sqf × ₹127.12 less 10%, plus 20 Sqf × ₹150, both at 18%.
    const totals = estimateTotals(
      [line(20, 127.12, 10, 18), line(20, 150, 0, 18)],
      '08',
      '08',
    );

    expect(totals.discount).toBeCloseTo(254.24, 2);
    expect(totals.subtotal).toBeCloseTo(5542.4, 2);
    expect(totals.total).toBeCloseTo(5288.16, 2);
    expect(totals.grandTotal).toBeCloseTo(6240.03, 2);
    expect(totals.savedAmount).toBe(300);
  });

  it('splits the tax within one state and sums back to the whole', () => {
    const totals = estimateTotals([line(20, 150, 0, 18)], '08', '08');
    expect(totals.igst).toBe(0);
    expect(Number((totals.cgst + totals.sgst).toFixed(2))).toBeCloseTo(totals.taxAmount, 2);
  });

  it('charges IGST when the client is in another state', () => {
    const totals = estimateTotals([line(20, 150, 0, 18)], '08', '27');
    expect(totals.cgst).toBe(0);
    expect(totals.sgst).toBe(0);
    expect(totals.igst).toBeCloseTo(totals.taxAmount, 2);
  });

  it('includes the tax that would have ridden on a discount in "you saved"', () => {
    // A ₹1,000 discount on an 18% line saves the client ₹1,180, not ₹1,000.
    const totals = estimateTotals([line(10, 1000, 10, 18)], '08', '08');
    expect(totals.discount).toBe(1000);
    expect(totals.savedAmount).toBeCloseTo(1180, 2);
  });

  it('saves nothing when nothing was discounted', () => {
    expect(estimateTotals([line(20, 150, 0, 18)], '08', '08').savedAmount).toBe(0);
  });

  it('handles an empty estimate without dividing by zero', () => {
    const totals = estimateTotals([], '08', '08');
    expect(totals).toMatchObject({
      subtotal: 0,
      discount: 0,
      total: 0,
      taxAmount: 0,
      grandTotal: 0,
      savedAmount: 0,
    });
  });

  it('keeps subtotal equal to the taxable value plus the discount', () => {
    const totals = estimateTotals(
      [line(3, 999.99, 7.5, 12), line(11, 45.5, 0, 28), line(2, 12000, 25, 5)],
      '08',
      '08',
    );
    expect(totals.subtotal).toBeCloseTo(totals.total + totals.discount, 2);
    expect(totals.grandTotal).toBeCloseTo(totals.total + totals.taxAmount, 2);
  });
});
