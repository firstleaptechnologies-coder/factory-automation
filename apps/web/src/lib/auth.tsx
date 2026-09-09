'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser, ModuleKey } from '@fas/shared';
import { hasModule } from '@fas/shared';
import { api, clearToken, loadToken, saveToken } from './api';

const WORKSPACE_KEY = 'decor.workspace';

interface AuthState {
  user: AuthUser | null;
  /** Remembered between sessions so the shop types it once, not daily. */
  workspace: string | null;
  loading: boolean;
  signIn: (workspace: string, identifier: string, password: string) => Promise<void>;
  signInAsPlatform: (email: string, password: string) => Promise<void>;
  /**
   * Open a workspace to help whoever is in it.
   *
   * Swaps this browser's session for a short-lived one inside that shop. The
   * banner stays up the whole time, because a support session that looks like
   * an ordinary one is how a shop ends up believing its own admin did
   * something.
   */
  openWorkspace: (tenantId: string, reason: string) => Promise<void>;
  signOut: () => void;
  /** Forget the workspace too, for a browser moving between businesses. */
  forgetWorkspace: () => void;
  /** Whether the signed-in user's role allows something. */
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
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem(WORKSPACE_KEY);
    if (saved) setWorkspace(saved);

    const token = loadToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(
    async (slug: string, identifier: string, password: string) => {
      const result = await api.login(slug, identifier, password);
      saveToken(result.accessToken);
      window.localStorage.setItem(WORKSPACE_KEY, slug);
      setWorkspace(slug);
      // The workspace comes back beside the user; the menu needs both.
      setUser({ ...result.user, workspace: result.workspace });
      router.push('/');
    },
    [router],
  );

  const signInAsPlatform = useCallback(
    async (email: string, password: string) => {
      const result = await api.platformLogin(email, password);
      saveToken(result.accessToken);
      setUser(result.user);
      router.push('/platform/tenants');
    },
    [router],
  );

  const openWorkspace = useCallback(
    async (tenantId: string, reason: string) => {
      const session = await api.openWorkspace(tenantId, reason);
      saveToken(session.accessToken);
      setWorkspace(session.workspace.slug);
      setUser(await api.me());
      router.push('/');
    },
    [router],
  );

  const signOut = useCallback(() => {
    clearToken();
    setUser(null);
    // The workspace deliberately survives sign-out: the next person at this
    // desk is almost always from the same shop.
    router.push('/login');
  }, [router]);

  const forgetWorkspace = useCallback(() => {
    window.localStorage.removeItem(WORKSPACE_KEY);
    setWorkspace(null);
  }, []);

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
      openWorkspace,
      signOut,
      forgetWorkspace,
      can,
      has,
    }),
    [
      user,
      workspace,
      loading,
      signIn,
      signInAsPlatform,
      openWorkspace,
      signOut,
      forgetWorkspace,
      can,
      has,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
