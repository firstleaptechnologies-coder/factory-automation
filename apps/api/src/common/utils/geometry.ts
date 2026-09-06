/**
 * Sheet-goods geometry. Every area figure in the system funnels through here so
 * that inventory, nesting and waste reporting can never disagree on the maths.
 */

export const MM2_PER_SQM = 1_000_000;

export function areaSqm(lengthMm: number, widthMm: number): number {
  return round((lengthMm * widthMm) / MM2_PER_SQM, 4);
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * An offcut is only worth a barcode if it can still hold a real part. Below the
 * threshold it is waste, and calling it inventory just inflates stock on paper.
 */
export interface OffcutRule {
  minLengthMm: number;
  minWidthMm: number;
  minAreaSqm: number;
}

export const DEFAULT_OFFCUT_RULE: OffcutRule = {
  minLengthMm: 300,
  minWidthMm: 200,
  minAreaSqm: 0.06,
};

export function isReusableOffcut(
  lengthMm: number,
  widthMm: number,
  rule: OffcutRule = DEFAULT_OFFCUT_RULE,
): boolean {
  const longSide = Math.max(lengthMm, widthMm);
  const shortSide = Math.min(lengthMm, widthMm);
  return (
    longSide >= rule.minLengthMm &&
    shortSide >= rule.minWidthMm &&
    areaSqm(lengthMm, widthMm) >= rule.minAreaSqm
  );
}

export interface YieldInput {
  sheetAreaSqm: number;
  partsAreaSqm: number;
  offcutAreaSqm: number;
}

export interface YieldResult {
  /** Share of the sheet that became sellable parts. */
  utilizationPct: number;
  /** Area lost for good: kerf, trim and undersized drops. */
  wasteAreaSqm: number;
  /** Utilisation once recovered offcuts are credited back. */
  effectiveUtilizationPct: number;
}

export function computeYield({
  sheetAreaSqm,
  partsAreaSqm,
  offcutAreaSqm,
}: YieldInput): YieldResult {
  if (sheetAreaSqm <= 0) {
    return { utilizationPct: 0, wasteAreaSqm: 0, effectiveUtilizationPct: 0 };
  }
  const wasteAreaSqm = round(
    Math.max(sheetAreaSqm - partsAreaSqm - offcutAreaSqm, 0),
    4,
  );
  return {
    utilizationPct: round((partsAreaSqm / sheetAreaSqm) * 100, 2),
    wasteAreaSqm,
    effectiveUtilizationPct: round(
      ((partsAreaSqm + offcutAreaSqm) / sheetAreaSqm) * 100,
      2,
    ),
  };
}
