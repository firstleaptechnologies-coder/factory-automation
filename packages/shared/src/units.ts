/**
 * Length units.
 *
 * Millimetres are the only unit ever stored. Everything else is a conversion
 * applied at the edge — on input when someone types a size, and on output when
 * a screen renders one. Nothing in the system persists feet, so a size can
 * never be ambiguous about what it means.
 *
 * Feet is the default the shop thinks in, so it is the default the UI shows.
 */

export const LENGTH_UNITS = ['MM', 'CM', 'M', 'IN', 'FT'] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];

/** Millimetres in one of each unit. Exact by definition: 1 in = 25.4 mm. */
const MM_PER_UNIT: Record<LengthUnit, number> = {
  MM: 1,
  CM: 10,
  M: 1000,
  IN: 25.4,
  FT: 304.8,
};

export const UNIT_LABEL: Record<LengthUnit, string> = {
  MM: 'mm',
  CM: 'cm',
  M: 'm',
  IN: 'in',
  FT: 'ft',
};

/** Sensible decimal places per unit — 4 dp of millimetres is noise. */
const UNIT_PRECISION: Record<LengthUnit, number> = {
  MM: 1,
  CM: 2,
  M: 3,
  IN: 3,
  FT: 3,
};

export const DEFAULT_UNIT: LengthUnit = 'FT';

export function isLengthUnit(value: unknown): value is LengthUnit {
  return typeof value === 'string' && (LENGTH_UNITS as readonly string[]).includes(value);
}

/** Any unit → millimetres. This is what gets stored. */
export function toMm(value: number, unit: LengthUnit): number {
  return round(value * MM_PER_UNIT[unit], 3);
}

/** Millimetres → any unit. This is what gets displayed. */
export function fromMm(valueMm: number, unit: LengthUnit): number {
  return round(valueMm / MM_PER_UNIT[unit], UNIT_PRECISION[unit]);
}

export function convert(value: number, from: LengthUnit, to: LengthUnit): number {
  return fromMm(toMm(value, from), to);
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** "2438.4" mm → "8 ft" (trailing zeros trimmed). */
export function formatLength(
  valueMm: number | string | null | undefined,
  unit: LengthUnit = DEFAULT_UNIT,
  options: { withUnit?: boolean } = {},
): string {
  if (valueMm === null || valueMm === undefined || valueMm === '') return '—';
  const converted = fromMm(Number(valueMm), unit);
  const text = trimZeros(converted.toFixed(UNIT_PRECISION[unit]));
  return options.withUnit === false ? text : `${text} ${UNIT_LABEL[unit]}`;
}

/** "1220 × 2440 mm" rendered in whichever unit the viewer picked. */
export function formatSize(
  lengthMm: number | string | null | undefined,
  widthMm: number | string | null | undefined,
  unit: LengthUnit = DEFAULT_UNIT,
): string {
  if (lengthMm == null || widthMm == null) return '—';
  const l = formatLength(lengthMm, unit, { withUnit: false });
  const w = formatLength(widthMm, unit, { withUnit: false });
  return `${l} × ${w} ${UNIT_LABEL[unit]}`;
}

export function formatArea(
  lengthMm: number | string | null | undefined,
  widthMm: number | string | null | undefined,
  unit: LengthUnit = DEFAULT_UNIT,
): string {
  if (lengthMm == null || widthMm == null) return '—';
  const l = fromMm(Number(lengthMm), unit);
  const w = fromMm(Number(widthMm), unit);
  return `${round(l * w, 2)} ${UNIT_LABEL[unit]}²`;
}

/**
 * Parse what a person actually types into a size box.
 *
 * Accepts a plain number in the active unit ("8", "8.5"), an explicit unit
 * ("2440mm", "96 in"), the feet-and-inches the trade speaks in ("8' 6\"",
 * "8ft 6in"), and fractions of an inch ("3/4\"", "8' 6 1/2\""). Returns
 * millimetres, or null when it cannot make sense of the input — callers should
 * treat null as "show a validation error", never as zero.
 */
export function parseLengthToMm(
  input: string,
  defaultUnit: LengthUnit = DEFAULT_UNIT,
): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text) return null;

  // Feet-and-inches: 8' 6", 8ft 6in, 8' 6 1/2"
  const feetInches = text.match(
    /^(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*(?:(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?\s*(?:"|in|inch|inches)?)?$/,
  );
  if (feetInches) {
    const feet = Number(feetInches[1]);
    const inches = feetInches[2] ? Number(feetInches[2]) : 0;
    const fraction =
      feetInches[3] && feetInches[4] ? Number(feetInches[3]) / Number(feetInches[4]) : 0;
    if (Number.isNaN(feet)) return null;
    const sign = feet < 0 ? -1 : 1;
    return round(
      Math.abs(feet) * MM_PER_UNIT.FT * sign + sign * (inches + fraction) * MM_PER_UNIT.IN,
      3,
    );
  }

  // Inches with a fraction: 6 1/2", 3/4 in
  const inchFraction = text.match(
    /^(?:(\d+(?:\.\d+)?)\s+)?(\d+)\/(\d+)\s*(?:"|in|inch|inches)$/,
  );
  if (inchFraction) {
    const whole = inchFraction[1] ? Number(inchFraction[1]) : 0;
    const denominator = Number(inchFraction[3]);
    if (!denominator) return null;
    return round((whole + Number(inchFraction[2]) / denominator) * MM_PER_UNIT.IN, 3);
  }

  // Number with an explicit unit suffix, or a bare number in the active unit.
  const suffixed = text.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m|in|inch|inches|ft|feet|"|')?$/);
  if (!suffixed) return null;

  const value = Number(suffixed[1]);
  if (Number.isNaN(value)) return null;

  const unit = suffixed[2] ? SUFFIX_TO_UNIT[suffixed[2]] : defaultUnit;
  return unit ? toMm(value, unit) : null;
}

const SUFFIX_TO_UNIT: Record<string, LengthUnit> = {
  mm: 'MM',
  cm: 'CM',
  m: 'M',
  in: 'IN',
  inch: 'IN',
  inches: 'IN',
  '"': 'IN',
  ft: 'FT',
  feet: 'FT',
  "'": 'FT',
};

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}
