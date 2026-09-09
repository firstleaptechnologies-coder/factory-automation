'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { inkOn } from '@fas/shared';
import { api } from './api';
import { useAuth } from './auth';

const ACCENT_KEY = 'fas.accent';
const DEFAULT_ACCENT = '#FF6B1A';

interface ThemeState {
  accent: string;
  setAccent: (hex: string) => void;
}

const ThemeContext = createContext<ThemeState | undefined>(undefined);

/**
 * Paints the web in the tenant's own accent.
 *
 * Only the accent moves. On a soft-UI theme the greys are structural — they are
 * what makes a surface look pressed out of the ground — so the whole ramp is
 * derived from one colour the client picks, and written onto the CSS variables
 * every component already reads.
 *
 * The colour is cached in localStorage and applied before the first paint, so a
 * branded workspace does not flash our orange on every navigation.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [accent, setAccentState] = useState(DEFAULT_ACCENT);

  const adopt = useCallback((hex: string) => {
    const normalised = normaliseHex(hex);
    if (!normalised) return;
    paint(normalised);
    setAccentState(normalised);
  }, []);

  useEffect(() => {
    const cached = window.localStorage.getItem(ACCENT_KEY);
    if (cached) adopt(cached);
  }, [adopt]);

  useEffect(() => {
    if (!user || user.isPlatform) return;
    api
      .firmTheme()
      .then(({ accent: fromServer }) => {
        if (!fromServer) return;
        window.localStorage.setItem(ACCENT_KEY, fromServer);
        adopt(fromServer);
      })
      // A desk that cannot reach the server keeps what it was last painted in.
      .catch(() => undefined);
  }, [user, adopt]);

  const setAccent = useCallback(
    (hex: string) => {
      const normalised = normaliseHex(hex);
      if (!normalised) return;
      window.localStorage.setItem(ACCENT_KEY, normalised);
      adopt(normalised);
    },
    [adopt],
  );

  const value = useMemo(() => ({ accent, setAccent }), [accent, setAccent]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const context = useContext(ThemeContext);
  return context ?? { accent: DEFAULT_ACCENT, setAccent: () => undefined };
}

/** Writes the derived ramp onto :root, where the stylesheet reads it. */
function paint(accent: string) {
  const root = document.documentElement.style;
  root.setProperty('--accent', accent);
  root.setProperty('--accent-bright', shift(accent, 0.18));
  root.setProperty('--accent-deep', shift(accent, -0.12));
  root.setProperty('--accent-glow', withAlpha(accent, 0.45));
  root.setProperty('--glow', `0 6px 18px ${withAlpha(accent, 0.45)}`);
  root.setProperty('--glow-soft', `0 4px 12px ${withAlpha(accent, 0.3)}`);
  root.setProperty(
    '--grad-accent',
    `linear-gradient(145deg, ${shift(accent, 0.18)}, ${accent} 55%, ${shift(accent, -0.12)})`,
  );
  root.setProperty(
    '--grad-accent-soft',
    `linear-gradient(145deg, ${shift(accent, 0.08)}, ${shift(accent, -0.07)})`,
  );
  // A client may pick a pale brand yellow, on which white text is unreadable.
  root.setProperty('--text-on-accent', readableOn(accent));
}

/** Accepts #rgb and #rrggbb; anything else is refused rather than guessed at. */
export function normaliseHex(input: string): string | null {
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

/*
 * Whichever ink the shop can actually read on their colour.
 *
 * Measured rather than estimated: this used to weigh the channels by perceived
 * brightness and flip at a threshold, which reads a saturated yellow and a
 * saturated blue as the same lightness and hands them the same ink.
 */
function readableOn(hex: string): string {
  return inkOn(hex);
}
