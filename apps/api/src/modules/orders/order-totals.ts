import { PricingMode, TaxTreatment } from '@prisma/client';
import { round2, splitTax } from '../../common/utils/pricing';

/**
 * The order's money, from however it was quoted.
 *
 * ITEMISED adds the priced lines and subtracts a discount. LUMP_SUM keeps the
 * figure that was actually given to the client and leaves the lines unpriced —
 * back-calculating a rate from it would invent a number nobody agreed to, and
 * that number would drift the moment a size was corrected.
 *
 * Kept apart from the service because it is pure arithmetic and it is the part
 * that must never be wrong: everything here is what ends up on an invoice.
 */
export function totalsFor(
  pricingMode: PricingMode,
  items: {
    amount: number;
    taxAmount?: number;
    quotedAmount?: number;
    concession?: number;
  }[],
  discount = 0,
  quotedTotal = 0,
  lumpSumTaxPct = 0,
  treatment: TaxTreatment = TaxTreatment.EXCLUSIVE,
): {
  pricingMode: PricingMode;
  quotedAmount: number;
  taxDiscount: number;
  subtotal: number;
  discount: number;
  total: number;
  taxAmount: number;
  grandTotal: number;
} {
  if (pricingMode === PricingMode.LUMP_SUM) {
    // One slab covers the whole quoted figure, because a lump sum has no lines
    // to tax individually. Whether the tax comes out of that figure or goes on
    // top of it is exactly what the treatment decides.
    const split = splitTax(round2(quotedTotal), lumpSumTaxPct, treatment);
    return {
      pricingMode,
      quotedAmount: round2(quotedTotal),
      taxDiscount: split.concession,
      subtotal: split.net,
      // A lump sum is the agreed figure; there is nothing to discount off it.
      discount: 0,
      total: split.net,
      taxAmount: split.tax,
      grandTotal: split.gross,
    };
  }

  // Line amounts are already taxable values — resolveItem took the tax out
  // under INCLUSIVE and ABSORBED — so everything here adds up the same way
  // whichever treatment was used.
  const subtotal = round2(items.reduce((sum, item) => sum + item.amount, 0));
  const applied = Math.min(round2(discount), subtotal);
  const total = round2(subtotal - applied);
  const taxAmount = round2(items.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0));

  return {
    pricingMode,
    quotedAmount: round2(
      items.reduce((sum, item) => sum + (item.quotedAmount ?? item.amount), 0),
    ),
    taxDiscount: round2(items.reduce((sum, item) => sum + (item.concession ?? 0), 0)),
    subtotal,
    discount: applied,
    total,
    taxAmount,
    grandTotal: round2(total + taxAmount),
  };
}
