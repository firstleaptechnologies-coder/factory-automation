import { round2, splitGstComponents } from '../../common/utils/pricing';

export interface PricedLine {
  discountAmount: number;
  taxAmount: number;
  /** Taxable value after the line discount. */
  netAmount: number;
  /** What the line comes to including its GST. */
  amount: number;
}

/**
 * An estimate's totals, from its priced lines.
 *
 * Pure arithmetic, kept out of the service because this is what ends up on a
 * document a client reads and an accountant reconciles.
 */
export function estimateTotals(
  lines: PricedLine[],
  sellerStateCode?: string | null,
  buyerStateCode?: string | null,
) {
  const discount = round2(sum(lines.map((line) => line.discountAmount)));
  const total = round2(sum(lines.map((line) => line.netAmount)));
  const taxAmount = round2(sum(lines.map((line) => line.taxAmount)));
  const grandTotal = round2(sum(lines.map((line) => line.amount)));
  const components = splitGstComponents(taxAmount, sellerStateCode, buyerStateCode);

  // What the client would have paid without the discount, less what they are
  // paying — so "you saved" includes the tax that would have ridden on it.
  const effectiveRate = total > 0 ? taxAmount / total : 0;
  const savedAmount = round2(discount * (1 + effectiveRate));

  return {
    subtotal: round2(total + discount),
    discount,
    total,
    taxAmount,
    ...components,
    grandTotal,
    savedAmount,
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
