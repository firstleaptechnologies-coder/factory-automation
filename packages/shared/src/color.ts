/**
 * Colour, and whether text can be read on it.
 *
 * A shop picks its own accent and names and colours its own stages, so almost
 * every coloured surface in the product is a colour we have never seen. What
 * must not happen is a label the shop cannot read — a white pill label on a
 * pale yellow stage, or a white button label on the lime accent somebody chose
 * because they liked it. So the ink is never hard-coded beside a colour: it is
 * derived from it, here, once, for both the app and the web.
 *
 * The arithmetic is the WCAG definition rather than a rule of thumb: a
 * perceived-brightness shortcut gets greens and yellows wrong, and those are
 * exactly the colours a decor shop reaches for.
 */

/** The app's two inks. Everything coloured picks one of them. */
export const INK_LIGHT = '#FFFFFF';
export const INK_DARK = '#1F2327';

/** Anything below this is uncomfortable to read at label sizes. */
export const MIN_CONTRAST = 4.5;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  /** 0–360 */
  h: number;
  /** 0–100 */
  s: number;
  /** 0–100 */
  l: number;
}

/**
 * Tidy a hex somebody typed, or say it is not one.
 *
 * Accepts it with or without the hash and in the three-digit short form, since
 * all three turn up when a colour is pasted from somewhere else.
 */
export function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{3}$/.test(raw) && !/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : raw;
  return `#${full.toUpperCase()}`;
}

export function hexToRgb(hex: string): Rgb {
  const clean = normalizeHex(hex) ?? '#000000';
  return {
    r: parseInt(clean.slice(1, 3), 16),
    g: parseInt(clean.slice(3, 5), 16),
    b: parseInt(clean.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

export function hexToHsl(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex);
  const [rf, gf, bf] = [r / 255, g / 255, b / 255];
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rf) h = ((gf - bf) / delta) % 6;
    else if (max === gf) h = (bf - rf) / delta + 2;
    else h = (rf - gf) / delta + 4;
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];

  return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}

/** WCAG relative luminance: 0 for black, 1 for white. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** How readable one colour is on another: 1 is invisible, 21 is black on white. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [relativeLuminance(a), relativeLuminance(b)];
  const [lighter, darker] = x > y ? [x, y] : [y, x];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The ink to write on this colour.
 *
 * Whichever of the two the shop can actually read — decided by measurement, not
 * by a lightness threshold, because a saturated yellow and a saturated blue can
 * share a lightness and take opposite inks.
 */
export function inkOn(background: string): string {
  return contrastRatio(background, INK_DARK) >= contrastRatio(background, INK_LIGHT)
    ? INK_DARK
    : INK_LIGHT;
}

/** Whether the better of the two inks is comfortable on this colour at all. */
export function isReadable(background: string, min = MIN_CONTRAST): boolean {
  return contrastRatio(background, inkOn(background)) >= min;
}

/**
 * The nearest colour to this one that its ink can be read on.
 *
 * A shop that picks a washed-out pastel for its accent still has to be able to
 * read the buttons, so the colour is walked towards black or white — whichever
 * its own ink is not — until it is legible. The hue is kept: the answer is
 * recognisably the colour they asked for, only darker or lighter.
 */
export function ensureReadable(background: string, min = MIN_CONTRAST): string {
  const start = normalizeHex(background);
  if (!start) return background;
  if (isReadable(start, min)) return start;

  const { h, s } = hexToHsl(start);
  const ink = inkOn(start);
  // Light ink means the colour must get darker, and the other way round.
  const towards = ink === INK_LIGHT ? -1 : 1;
  const from = hexToHsl(start).l;

  for (let step = 1; step <= 100; step += 1) {
    const l = from + towards * step;
    if (l < 0 || l > 100) break;
    const candidate = hslToHex({ h, s, l });
    if (contrastRatio(candidate, ink) >= min) return candidate;
  }
  // Nothing in that direction works, which only happens for a mid grey: take
  // the extreme rather than handing back something unreadable.
  return ink === INK_LIGHT ? '#000000' : '#FFFFFF';
}
