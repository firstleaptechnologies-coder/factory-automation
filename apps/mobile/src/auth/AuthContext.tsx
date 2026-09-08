import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser, ModuleKey } from '@decor/shared';
import { hasModule } from '@decor/shared';
import { api, setUnauthorizedHandler } from '../api/client';

const TOKEN_KEY = 'decor.token';
const USER_KEY = 'decor.user';
const WORKSPACE_KEY = 'decor.workspace';

interface AuthState {
  user: AuthUser | null;
  /** Remembered between sessions so the shop types it once, not daily. */
  workspace: string | null;
  loading: boolean;
  signIn: (workspace: string, identifier: string, password: string) => Promise<void>;
  signInAsPlatform: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Forget the workspace too, for a device moving between businesses. */
  forgetWorkspace: () => Promise<void>;
  can: (permission: string) => boolean;
  /**
   * Whether the workspace bought this part of the product.
   *
   * Beside `can`, not instead of it: the plan decides what the business has,
   * the role decides who inside it may touch it.
   */
  has: (module: ModuleKey) => boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    api.setToken(null);
    setUser(null);
    // The workspace deliberately survives sign-out: the next person at this
    // device is almost always from the same shop.
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
  }, [signOut]);

  useEffect(() => {
    (async () => {
      try {
        const [[, token], [, cached], [, savedWorkspace]] = await AsyncStorage.multiGet([
          TOKEN_KEY,
          USER_KEY,
          WORKSPACE_KEY,
        ]);
        if (savedWorkspace) setWorkspace(savedWorkspace);

        if (token) {
          api.setToken(token);
          if (cached) setUser(JSON.parse(cached) as AuthUser);
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

  const persist = useCallback(
    async (token: string, nextUser: AuthUser, slug?: string) => {
      setUser(nextUser);
      const entries: [string, string][] = [
        [TOKEN_KEY, token],
        [USER_KEY, JSON.stringify(nextUser)],
      ];
      if (slug) {
        setWorkspace(slug);
        entries.push([WORKSPACE_KEY, slug]);
      }
      await AsyncStorage.multiSet(entries);
    },
    [],
  );

  const signIn = useCallback(
    async (slug: string, identifier: string, password: string) => {
      const result = await api.login(slug, identifier, password);
      // The workspace comes back beside the user; the menu needs both.
      await persist(
        result.accessToken,
        { ...result.user, workspace: result.workspace },
        result.workspace?.slug ?? slug,
      );
    },
    [persist],
  );

  const signInAsPlatform = useCallback(
    async (email: string, password: string) => {
      const result = await api.platformLogin(email, password);
      await persist(result.accessToken, result.user);
    },
    [persist],
  );

  const forgetWorkspace = useCallback(async () => {
    setWorkspace(null);
    await AsyncStorage.removeItem(WORKSPACE_KEY);
    await signOut();
  }, [signOut]);

  /**
   * Screens ask what the person may do, never what they are called. A tenant
   * can rename or recombine roles freely; the permission keys do not move.
   */
  const can = useCallback(
    (permission: string) => Boolean(user?.permissions?.includes(permission)),
    [user],
  );

  const has = useCallback(
    (module: ModuleKey) => hasModule(user?.workspace?.modules, module),
    [user],
  );

  const value = useMemo(
    () => ({
      user,
      workspace,
      loading,
      signIn,
      signInAsPlatform,
      signOut,
      forgetWorkspace,
      can,
      has,
    }),
    [user, workspace, loading, signIn, signInAsPlatform, signOut, forgetWorkspace, can, has],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
