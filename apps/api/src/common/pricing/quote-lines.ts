import { TaxTreatment } from '@prisma/client';
import { round2, splitGstComponents, splitTax } from '../utils/pricing';

/**
 * The arithmetic behind a priced line, and the totals a set of them come to.
 *
 * Kept here rather than inside Quotes because there are now two documents made
 * of the same lines — an enquiry priced on the phone, and the quotation raised
 * from it — and they have to come to the same money. Two copies of this sum
 * would agree on the day they were written and drift the first time a
 * treatment or a rounding rule changed, which is a shop quoting one figure and
 * invoicing another.
 *
 * Pure: no database, no tenant, no request. Given a line and a GST rate it
 * says what the line comes to, and nothing else.
 */

/** A line as somebody typed it, before it is priced. */
export interface QuoteLineInput {
  name: string;
  description?: string | null;
  hsnSac?: string | null;
  quantity: number;
  unit?: string | null;
  ratePerUnit: number;
  discountPct?: number | null;
}

/** The same line with every figure worked out, ready to be stored. */
export interface PricedQuoteLine {
  name: string;
  description?: string | null;
  hsnSac?: string | null;
  quantity: number;
  unit: string;
  ratePerUnit: number;
  discountPct: number;
  discountAmount: number;
  gstSlabId: string | null;
  gstRatePct: number;
  taxAmount: number;
  /** Taxable value after the line discount. */
  netAmount: number;
  /** What the line comes to including its GST. */
  amount: number;
}

/**
 * One line, priced.
 *
 * The order of operations is the whole of it: the discount comes off before
 * the tax split, so the client is taxed on what they are actually being
 * charged rather than on a figure nobody is paying.
 */
export function priceQuoteLine(
  item: QuoteLineInput,
  gst: { id: string | null; ratePct: number },
  treatment: TaxTreatment,
): PricedQuoteLine {
  const gross = round2(item.quantity * item.ratePerUnit);
  const discountPct = item.discountPct ?? 0;
  const discountAmount = round2((gross * discountPct) / 100);
  const afterDiscount = round2(gross - discountAmount);

  const split = splitTax(afterDiscount, gst.ratePct, treatment);

  return {
    name: item.name,
    description: item.description ?? undefined,
    hsnSac: item.hsnSac ?? undefined,
    quantity: item.quantity,
    unit: item.unit ?? 'Sqf',
    ratePerUnit: item.ratePerUnit,
    discountPct,
    discountAmount,
    gstSlabId: gst.id,
    gstRatePct: gst.ratePct,
    taxAmount: split.tax,
    netAmount: split.net,
    amount: split.gross,
  };
}

export interface PricedLine {
  discountAmount: number;
  taxAmount: number;
  /** Taxable value after the line discount. */
  netAmount: number;
  /** What the line comes to including its GST. */
  amount: number;
}

/**
 * What a set of priced lines come to.
 *
 * Kept out of the services because this is what ends up on a document a client
 * reads and an accountant reconciles.
 */
export function quoteTotals(
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
