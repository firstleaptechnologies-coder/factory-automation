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

export const palette = {
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
export const depth = {
  sm: { offset: 3, blur: 6 },
  md: { offset: 6, blur: 12 },
  lg: { offset: 9, blur: 18 },
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

/** Pick legible text for an arbitrary configured status colour. */
export function readableOn(background: string): string {
  const hex = background.replace('#', '');
  if (hex.length !== 6) return palette.text;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1A1D20' : palette.white;
}
