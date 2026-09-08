import { RateUnit } from '@prisma/client';

/**
 * Turning a quoted rate into a line amount.
 *
 * The shop quotes in whatever way suits the job — per square foot for panels,
 * per piece for repeated parts, per running foot for edging, or one lump figure
 * for the whole line. Each of those is stored as it was said, and this is the
 * only place that converts one into money.
 *
 * Sizes arrive in millimetres, because that is the only unit the system stores.
 */

const MM_PER_FT = 304.8;
const MM_PER_M = 1000;

export interface LinePricing {
  rate: number | null;
  rateUnit: RateUnit;
  lengthMm: number;
  widthMm: number;
  quantity: number;
}

export function lineAmount(input: LinePricing): number {
  const { rate, rateUnit, lengthMm, widthMm, quantity } = input;
  if (rate === null || rate === undefined) return 0;

  // A lump sum is the amount, not a multiplier. Multiplying it by quantity
  // would double-charge a line someone deliberately priced as a whole.
  if (rateUnit === RateUnit.LUMP_SUM) return round2(rate);

  const qty = Math.max(quantity, 0);

  switch (rateUnit) {
    case RateUnit.PER_SQFT: {
      const sqft = (lengthMm / MM_PER_FT) * (widthMm / MM_PER_FT);
      return round2(sqft * qty * rate);
    }
    case RateUnit.PER_SQM: {
      const sqm = (lengthMm / MM_PER_M) * (widthMm / MM_PER_M);
      return round2(sqm * qty * rate);
    }
    case RateUnit.PER_RFT: {
      // Running foot bills the length only — width is irrelevant to edging,
      // beading and the like.
      const rft = lengthMm / MM_PER_FT;
      return round2(rft * qty * rate);
    }
    case RateUnit.PER_PIECE:
    default:
      return round2(qty * rate);
  }
}

/** The billable quantity behind a line, for showing the working on an invoice. */
export function billableQuantity(input: LinePricing): { value: number; label: string } {
  const { rateUnit, lengthMm, widthMm, quantity } = input;
  switch (rateUnit) {
    case RateUnit.PER_SQFT:
      return {
        value: round2((lengthMm / MM_PER_FT) * (widthMm / MM_PER_FT) * quantity),
        label: 'sq ft',
      };
    case RateUnit.PER_SQM:
      return {
        value: round2((lengthMm / MM_PER_M) * (widthMm / MM_PER_M) * quantity),
        label: 'sq m',
      };
    case RateUnit.PER_RFT:
      return { value: round2((lengthMm / MM_PER_FT) * quantity, 2), label: 'r ft' };
    case RateUnit.LUMP_SUM:
      return { value: 1, label: 'lump sum' };
    case RateUnit.PER_PIECE:
    default:
      return { value: quantity, label: 'pcs' };
  }
}

export function round2(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Splitting a figure into a taxable value and the GST on it.
 *
 * Which way the split runs depends on what the client was told, and getting it
 * wrong is not a rounding difference — it changes what the shop owes.
 *
 * - EXCLUSIVE: the quoted figure is the taxable value. GST is added on top.
 * - INCLUSIVE / ABSORBED: the quoted figure is what the client pays, so the GST
 *   is already inside it and has to come out. ₹40,000 collected at 18% carries
 *   ₹6,101.69 of tax, not ₹7,200 — the ₹7,200 would only be right if ₹40,000
 *   were the taxable base, and under these treatments it is not.
 *
 * ABSORBED splits identically to INCLUSIVE; what differs is the concession,
 * which is what the client would have paid on top had the shop not agreed to
 * absorb it. That is recorded, not deducted — they were never billed it.
 */
export interface TaxSplit {
  /** Taxable value, before GST. */
  net: number;
  /** GST on `net`. */
  tax: number;
  /** What the client actually pays: net + tax. */
  gross: number;
  /** Under ABSORBED, the GST the shop chose not to charge on top. */
  concession: number;
}

export function splitTax(
  quoted: number,
  ratePct: number,
  treatment: 'EXCLUSIVE' | 'INCLUSIVE' | 'ABSORBED',
): TaxSplit {
  const rate = Math.max(ratePct, 0) / 100;

  if (treatment === 'EXCLUSIVE') {
    const net = round2(quoted);
    const tax = round2(net * rate);
    return { net, tax, gross: round2(net + tax), concession: 0 };
  }

  const gross = round2(quoted);
  const net = round2(gross / (1 + rate));
  // Derived by subtraction so net + tax is exactly gross, whatever the rate
  // rounds to. Computing tax independently can leave a paisa unaccounted for.
  const tax = round2(gross - net);

  return {
    net,
    tax,
    gross,
    concession: treatment === 'ABSORBED' ? round2(gross * rate) : 0,
  };
}

/**
 * Splitting GST into the components an Indian invoice has to show.
 *
 * A supply within the seller's own state is CGST + SGST at half the slab rate
 * each; a supply to another state is IGST at the whole rate. Both come to the
 * same money, and printing the wrong pair is the kind of error that gets an
 * invoice rejected — so it is decided from the two state codes rather than
 * being a setting somebody has to remember.
 *
 * When either state is unknown the supply is treated as intra-state, which is
 * the overwhelmingly common case for a shop selling locally.
 */
export function splitGstComponents(
  taxAmount: number,
  sellerStateCode?: string | null,
  buyerStateCode?: string | null,
): { cgst: number; sgst: number; igst: number } {
  const interState =
    Boolean(sellerStateCode) &&
    Boolean(buyerStateCode) &&
    sellerStateCode !== buyerStateCode;

  return gstComponents(taxAmount, interState);
}

/**
 * The same split, when the decision has already been made.
 *
 * An invoice stores whether the supply crossed a state line, because a reprint
 * after the client moves must not change which pair is on the paper that was
 * issued. It has the answer, not the codes — so it needs this rather than
 * being made to reconstruct two state codes it no longer has.
 */
export function gstComponents(
  taxAmount: number,
  interState: boolean,
): { cgst: number; sgst: number; igst: number } {
  if (interState) return { cgst: 0, sgst: 0, igst: round2(taxAmount) };

  const half = round2(taxAmount / 2);
  // The second half absorbs the odd paisa so the two always sum to the whole.
  return { cgst: half, sgst: round2(taxAmount - half), igst: 0 };
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty',
  'Ninety',
];

/**
 * The amount written out, as every Indian invoice carries it.
 *
 * Grouped the Indian way — crore, lakh, thousand — because "Six Lakh" is what
 * the client expects to read, not "Six Hundred Thousand".
 */
export function amountInWords(value: number): string {
  const rupees = Math.floor(Math.abs(value));
  const paise = Math.round((Math.abs(value) - rupees) * 100);

  const words = rupees === 0 ? 'Zero' : indianGrouping(rupees);
  const tail = paise > 0 ? ` and ${indianGrouping(paise)} Paise` : '';
  return `${words} Rupees${tail} only`;
}

function indianGrouping(value: number): string {
  if (value === 0) return '';

  const parts: string[] = [];
  const crore = Math.floor(value / 10000000);
  const lakh = Math.floor((value % 10000000) / 100000);
  const thousand = Math.floor((value % 100000) / 1000);
  const rest = value % 1000;

  if (crore) parts.push(`${underThousand(crore)} Crore`);
  if (lakh) parts.push(`${underThousand(lakh)} Lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} Thousand`);
  if (rest) parts.push(underThousand(rest));

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function underThousand(value: number): string {
  if (value === 0) return '';
  if (value < 20) return ONES[value];
  if (value < 100) {
    return `${TENS[Math.floor(value / 10)]}${value % 10 ? ` ${ONES[value % 10]}` : ''}`;
  }
  const rest = value % 100;
  return `${ONES[Math.floor(value / 100)]} Hundred${rest ? ` and ${underThousand(rest)}` : ''}`;
}
