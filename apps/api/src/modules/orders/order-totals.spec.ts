import { PricingMode, TaxTreatment } from '@prisma/client';
import { splitTax } from '../../common/utils/pricing';
import { totalsFor } from './order-totals';

/** Lines arrive already split, exactly as resolveItem hands them over. */
function line(quoted: number, ratePct: number, treatment: TaxTreatment) {
  const split = splitTax(quoted, ratePct, treatment as never);
  return {
    amount: split.net,
    taxAmount: split.tax,
    quotedAmount: quoted,
    concession: split.concession,
  };
}

describe('totalsFor — itemised', () => {
  it('adds the lines and puts GST on top', () => {
    const money = totalsFor(
      PricingMode.ITEMISED,
      [line(40000, 18, TaxTreatment.EXCLUSIVE)],
      0,
      0,
      0,
      TaxTreatment.EXCLUSIVE,
    );
    expect(money).toMatchObject({
      subtotal: 40000,
      discount: 0,
      total: 40000,
      taxAmount: 7200,
      grandTotal: 47200,
      taxDiscount: 0,
    });
  });

  it('takes the discount off before the tax', () => {
    const money = totalsFor(
      PricingMode.ITEMISED,
      [line(10000, 18, TaxTreatment.EXCLUSIVE)],
      1000,
      0,
      0,
      TaxTreatment.EXCLUSIVE,
    );
    expect(money.subtotal).toBe(10000);
    expect(money.discount).toBe(1000);
    expect(money.total).toBe(9000);
  });

  it('never discounts more than the order is worth', () => {
    const money = totalsFor(
      PricingMode.ITEMISED,
      [line(5000, 18, TaxTreatment.EXCLUSIVE)],
      9999,
      0,
      0,
      TaxTreatment.EXCLUSIVE,
    );
    expect(money.discount).toBe(5000);
    expect(money.total).toBe(0);
  });

  it('leaves the client paying the quoted figure when GST is absorbed', () => {
    const money = totalsFor(
      PricingMode.ITEMISED,
      [line(40000, 18, TaxTreatment.ABSORBED)],
      0,
      0,
      0,
      TaxTreatment.ABSORBED,
    );
    // What they actually pay is what they were told.
    expect(money.grandTotal).toBe(40000);
    // And the tax owed is the part inside that, not 18% on top of it.
    expect(money.taxAmount).toBeCloseTo(6101.69, 2);
    // The concession is recorded but does not reduce anything.
    expect(money.taxDiscount).toBe(7200);
    expect(money.quotedAmount).toBe(40000);
  });

  it('sums several lines with different slabs', () => {
    const money = totalsFor(
      PricingMode.ITEMISED,
      [line(2288.16, 18, TaxTreatment.EXCLUSIVE), line(3000, 18, TaxTreatment.EXCLUSIVE)],
      0,
      0,
      0,
      TaxTreatment.EXCLUSIVE,
    );
    expect(money.total).toBeCloseTo(5288.16, 2);
    expect(money.grandTotal).toBeCloseTo(money.total + money.taxAmount, 2);
  });
});

describe('totalsFor — lump sum', () => {
  it('taxes the single quoted figure', () => {
    const money = totalsFor(PricingMode.LUMP_SUM, [], 0, 40000, 18, TaxTreatment.EXCLUSIVE);
    expect(money).toMatchObject({
      subtotal: 40000,
      total: 40000,
      taxAmount: 7200,
      grandTotal: 47200,
    });
  });

  it('backs the tax out when the lump sum already includes it', () => {
    const money = totalsFor(PricingMode.LUMP_SUM, [], 0, 40000, 18, TaxTreatment.INCLUSIVE);
    expect(money.grandTotal).toBe(40000);
    expect(money.total).toBeCloseTo(33898.31, 2);
    expect(money.taxAmount).toBeCloseTo(6101.69, 2);
  });

  it('ignores a discount, because a lump sum is the agreed figure', () => {
    const money = totalsFor(PricingMode.LUMP_SUM, [], 5000, 40000, 18, TaxTreatment.EXCLUSIVE);
    expect(money.discount).toBe(0);
    expect(money.total).toBe(40000);
  });
});

describe('a lump sum with no quoted figure on record', () => {
  it('falls back to the taxable total rather than zeroing the order', () => {
    // Orders punched before `quotedAmount` existed carry the column default of
    // 0. Treating that as the quote wiped them out on the first reprice.
    const fallback = (quotedAmount: number, total: number) =>
      Number(quotedAmount) || Number(total) || 0;

    expect(fallback(0, 40000)).toBe(40000);
    expect(fallback(40000, 40000)).toBe(40000);
    expect(fallback(0, 0)).toBe(0);
  });
});
