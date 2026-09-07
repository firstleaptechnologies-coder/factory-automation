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
