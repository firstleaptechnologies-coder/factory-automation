'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_UNIT, type LengthUnit, isLengthUnit } from '@fas/shared';

const KEY = 'fas.unit';

/**
 * The display unit, remembered between visits.
 *
 * Sizes are always stored in millimetres; this only decides what a screen
 * shows. Someone who thinks in feet should not have to re-pick it on every
 * page — which is what the browser made them do, because each screen held its
 * own `useState` and nothing wrote the choice down.
 *
 * The same key and the same default as the app's `useDisplayUnit`, so a shop
 * that works on both does not have to say it twice.
 *
 * It starts on the default and adopts the stored value in an effect rather
 * than reading storage while rendering: the server renders this too, and a
 * first paint that disagrees with the markup is a hydration error.
 */
export function useDisplayUnit(): [LengthUnit, (unit: LengthUnit) => void] {
  const [unit, setUnitState] = useState<LengthUnit>(DEFAULT_UNIT);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (isLengthUnit(stored)) setUnitState(stored);
    } catch {
      // A browser refusing storage is a browser that sees the default.
    }
  }, []);

  const setUnit = useCallback((next: LengthUnit) => {
    setUnitState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      // The choice still holds for this page; it just will not outlive it.
    }
  }, []);

  return [unit, setUnit];
}
