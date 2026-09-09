/**
 * Design tokens — dark neumorphic ("soft UI") with a glowing orange accent.
 *
 * The rule that makes neumorphism work: surfaces are the SAME colour as the
 * ground behind them. Nothing is separated by a border or a fill — only by
 * light. A soft highlight from the top-left and a soft shadow to the
 * bottom-right make a panel look pressed out of the background, and inverting
 * those two makes it look pressed in.
 *
 * That means the palette is deliberately tiny: one charcoal, a lighter and a
 * darker version of it for the light to play with, and one hot orange for the
 * few things that should pull the eye.
 */

import { inkOn } from '@fas/shared';

export const palette: Record<string, string> = {
  /** The single ground colour. Every panel is this, or a shade of it. */
  bg: '#25292E',
  surface: '#282D32',
  /** Gradient ends that give a panel its curvature. */
  surfaceLit: '#30363C',
  surfaceShade: '#1F2327',
  /** Deeper wells, for inset fields and tracks. */
  surfaceInset: '#212529',

  /** The two lights. Everything is shaped by these. */
  shadowLight: 'rgba(255,255,255,0.055)',
  shadowDark: 'rgba(0,0,0,0.55)',

  /** The accent, and the halo it throws. */
  accent: '#FF6B1A',
  accentBright: '#FF9142',
  accentDeep: '#EF4B14',
  accentGlow: 'rgba(255,107,26,0.45)',

  textOnAccent: '#FFFFFF',
  text: '#EDEFF2',
  textMuted: '#8B939B',
  textFaint: '#5B6268',

  white: '#FFFFFF',
  danger: '#FF5A4E',
  warning: '#FFB13D',
  success: '#4ED18A',
  info: '#57B7E8',
} as const;

/** Gradients. Mutable arrays because LinearGradient's prop is not readonly. */
export const gradients: Record<string, string[]> = {
  /** A raised panel: lit at the top-left, shaded at the bottom-right. */
  raised: [palette.surfaceLit, palette.surfaceShade],
  /** An inset well: the same light, reversed. */
  inset: [palette.surfaceShade, palette.surfaceLit],
  /** The accent, for the one thing that matters on a screen. */
  accent: ['#FF9142', '#FF6B1A', '#EF4B14'],
  accentSoft: ['#FF7C2A', '#F1521A'],
  /** The app background — a barely-there vignette so the ground has depth. */
  screen: ['#2A2F34', '#25292E', '#1E2226'],
} as const as Record<string, string[]>;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  xxl: 36,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const font = {
  display: 40,
  h1: 30,
  h2: 22,
  h3: 18,
  body: 15,
  small: 13,
  tiny: 11,
  micro: 10,
} as const;

export const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
} as const;

/**
 * Shadow geometry. Depth is the offset and blur of the two lights; a bigger
 * depth reads as a panel standing further off the ground.
 */
/**
 * Shadow geometry. Depth is the offset, blur and strength of the two lights;
 * a bigger depth reads as a panel standing further off the ground.
 *
 * The blur is deliberately three to four times the offset. When blur only just
 * exceeds the offset the shadow keeps a hard edge and reads as a second copy of
 * the control sitting behind it — a visible dark pill behind every button —
 * rather than as light falling off a raised surface. Small controls also get a
 * weaker shadow, because a chip usually sits on a card that is already raised
 * and the two otherwise compound into a smudge.
 */
export const depth = {
  sm: { offset: 2, blur: 8, dark: 0.34, light: 0.045 },
  md: { offset: 5, blur: 16, dark: 0.46, light: 0.055 },
  lg: { offset: 8, blur: 24, dark: 0.55, light: 0.06 },
} as const;

export const shadow = {
  /** The accent's halo — this is what makes it look lit rather than painted. */
  glow: {
    shadowColor: palette.accent,
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  soft: {
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 4, height: 6 },
    elevation: 8,
  },
} as const;

export const motion = {
  fast: 160,
  base: 260,
  slow: 420,
  spring: { damping: 18, stiffness: 180, mass: 0.9 },
  springSoft: { damping: 22, stiffness: 120, mass: 1 },
} as const;

/**
 * Legible text for an arbitrary configured colour.
 *
 * Measured rather than estimated: this used to weigh the channels by perceived
 * brightness and flip at a threshold, which reads a saturated yellow and a
 * saturated blue as the same lightness and gives them the same ink. Those are
 * exactly the colours a decor shop reaches for.
 */
export function readableOn(background: string): string {
  return normaliseHex(background) ? inkOn(background) : palette.text;
}


// ---------------------------------------------------------------------------
// Runtime theming
// ---------------------------------------------------------------------------

/**
 * Repaint the app in a tenant's own accent.
 *
 * Only the accent moves. On a soft-UI theme the greys are structural — they are
 * what makes a surface look pressed out of the ground — so letting a client
 * choose those would not be branding, it would be breaking the illusion. One
 * colour in, the whole ramp derived from it.
 *
 * The exported objects are mutated in place rather than replaced, because every
 * StyleSheet in the app has already captured references to them. Callers must
 * force a re-render afterwards; ThemeProvider does that by remounting the tree.
 */
export function applyAccent(hex: string): void {
  const accent = normaliseHex(hex);
  if (!accent) return;

  palette.accent = accent;
  palette.accentBright = shift(accent, 0.18);
  palette.accentDeep = shift(accent, -0.12);
  palette.accentGlow = withAlpha(accent, 0.45);
  /*
   * The ink on the accent follows the accent.
   *
   * It was white, which was right for our orange and wrong the moment a shop
   * chose a pale one: the punch button's label disappeared into its own
   * background. Whether the label is white or charcoal is not a decision
   * anybody should have to make — it falls out of the colour.
   */
  palette.textOnAccent = inkOn(accent);

  gradients.accent = [palette.accentBright, palette.accent, palette.accentDeep];
  gradients.accentSoft = [shift(accent, 0.08), shift(accent, -0.07)];
}

export const DEFAULT_ACCENT = '#FF6B1A';

/** Accepts #rgb and #rrggbb; anything else is refused rather than guessed at. */
function normaliseHex(input: string): string | null {
  const value = String(input ?? '').trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const [, r, g, b] = value.toUpperCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Lighten (positive) or darken (negative) towards white or black. */
function shift(hex: string, amount: number): string {
  const target = amount >= 0 ? 255 : 0;
  const weight = Math.abs(amount);
  const moved = channels(hex).map((channel) =>
    Math.round(channel + (target - channel) * weight),
  );
  return `#${moved.map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Whether white or near-black is readable on the current accent.
 *
 * A tenant may well pick a pale brand yellow, and white text on it is
 * unreadable — so the label colour follows the accent rather than being fixed.
 */
export function readableOnAccent(): string {
  return readableOn(palette.accent);
}
