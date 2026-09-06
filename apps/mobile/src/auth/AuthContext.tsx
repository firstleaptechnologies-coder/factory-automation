import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {AuthUser} from '@decor/shared';
import {api, setUnauthorizedHandler} from '../api/client';

const TOKEN_KEY = 'decor.token';
const USER_KEY = 'decor.user';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    api.setToken(null);
    setUser(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
  }, [signOut]);

  // Restore the shift's session so an operator is not re-typing a password
  // every time the tablet sleeps.
  useEffect(() => {
    (async () => {
      try {
        const [[, token], [, cached]] = await AsyncStorage.multiGet([
          TOKEN_KEY,
          USER_KEY,
        ]);
        if (token) {
          api.setToken(token);
          if (cached) setUser(JSON.parse(cached) as AuthUser);
          // Confirm the token is still good; a stale one signs us out quietly.
          const fresh = await api.me();
          setUser(fresh);
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(fresh));
        }
      } catch {
        await signOut();
      } finally {
        setLoading(false);
      }
    })();
  }, [signOut]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const result = await api.login(identifier, password);
    setUser(result.user);
    await AsyncStorage.multiSet([
      [TOKEN_KEY, result.accessToken],
      [USER_KEY, JSON.stringify(result.user)],
    ]);
  }, []);

  const value = useMemo(
    () => ({user, loading, signIn, signOut}),
    [user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
