import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { DEFAULT_ACCENT, applyAccent, palette } from '../theme';

const ACCENT_KEY = 'decor.accent';

interface ThemeState {
  accent: string;
  /** Bumped whenever the accent changes; used to remount the tree. */
  revision: number;
  setAccent: (hex: string) => Promise<void>;
}

const ThemeContext = createContext<ThemeState | undefined>(undefined);

/**
 * Paints the app in the tenant's own accent.
 *
 * The colour is cached on the device and applied on launch, so a shop that has
 * branded the app does not see it flash our orange first. It is then refreshed
 * from the server once there is somebody signed in, because an admin may have
 * changed it from another device.
 *
 * Applying an accent mutates the shared palette — every StyleSheet in the app
 * already holds a reference to it — so the tree is remounted by key afterwards
 * rather than hoping styles re-evaluate on their own.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [accent, setAccentState] = useState(palette.accent);
  const [revision, setRevision] = useState(0);

  const adopt = useCallback((hex: string) => {
    if (!hex || hex === palette.accent) return;
    applyAccent(hex);
    setAccentState(palette.accent);
    setRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    (async () => {
      const cached = await AsyncStorage.getItem(ACCENT_KEY);
      if (cached) adopt(cached);
    })();
  }, [adopt]);

  useEffect(() => {
    if (!user || user.isPlatform) return;
    (async () => {
      try {
        const { accent: fromServer } = await api.firmTheme();
        if (!fromServer) return;
        await AsyncStorage.setItem(ACCENT_KEY, fromServer);
        adopt(fromServer);
      } catch {
        // A shop with no connection keeps whatever it was last painted in.
      }
    })();
  }, [user, adopt]);

  const setAccent = useCallback(
    async (hex: string) => {
      await AsyncStorage.setItem(ACCENT_KEY, hex);
      adopt(hex);
    },
    [adopt],
  );

  const value = useMemo(
    () => ({ accent, revision, setAccent }),
    [accent, revision, setAccent],
  );

  return (
    <ThemeContext.Provider value={value}>
      {/* Remounting on the accent is what makes captured StyleSheets pick it
          up. It happens only when an admin changes the colour, so the cost is
          a redraw nobody is mid-gesture through. */}
      <React.Fragment key={revision}>{children}</React.Fragment>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const context = useContext(ThemeContext);
  if (!context) {
    // Usable outside the provider, so a screen rendered before it still works.
    return {
      accent: palette.accent || DEFAULT_ACCENT,
      revision: 0,
      setAccent: async () => {},
    };
  }
  return context;
}
