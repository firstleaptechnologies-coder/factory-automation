/**
 * One font size for a row of labels, taken from the longest of them.
 *
 * `adjustsFontSizeToFit` shrinks each label on its own, so a row of five came
 * out at five different sizes — "Design" full size beside a visibly smaller
 * "Order confirmed", which reads as a mistake rather than as a fit. Sizing the
 * row from its longest member keeps them identical, which is the thing the eye
 * actually notices.
 *
 * Width is estimated from the character count rather than measured: React
 * Native can only measure text after it has been laid out, and a size that
 * arrives a frame late shows as a visible jump. The ratio is deliberately
 * generous, so the error is a slightly small label rather than a clipped one.
 */

/** Roughly how wide an average glyph is, as a fraction of the font size. */
const GLYPH = 0.58;

export function fitLabels(
  labels: string[],
  rowWidth: number,
  { base, min, gap = 0 }: { base: number; min: number; gap?: number },
): number {
  const longest = Math.max(0, ...labels.map((label) => label.length));
  // Nothing measured yet, or nothing to measure: leave the size alone and let
  // the first real layout settle it.
  if (!rowWidth || !longest || labels.length === 0) return base;

  const each = (rowWidth - gap * (labels.length - 1)) / labels.length;
  const fits = each / (longest * GLYPH);
  return Math.max(min, Math.min(base, Math.floor(fits * 10) / 10));
}
