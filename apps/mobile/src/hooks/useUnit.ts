import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_UNIT, LengthUnit, isLengthUnit } from '@decor/shared';

const KEY = 'decor.unit';

/**
 * The display unit, remembered across launches.
 *
 * Sizes are always stored in millimetres; this only decides what the screen
 * shows. Someone who thinks in feet should not have to re-pick it every time
 * they open the app.
 */
export function useDisplayUnit(): [LengthUnit, (unit: LengthUnit) => void] {
  const [unit, setUnitState] = useState<LengthUnit>(DEFAULT_UNIT);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((stored) => {
        if (isLengthUnit(stored)) setUnitState(stored);
      })
      .catch(() => undefined);
  }, []);

  const setUnit = useCallback((next: LengthUnit) => {
    setUnitState(next);
    void AsyncStorage.setItem(KEY, next);
  }, []);

  return [unit, setUnit];
}
