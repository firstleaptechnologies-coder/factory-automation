'use client';

import {ApiClient} from '@decor/shared';

const TOKEN_KEY = 'decor.token';

export const api = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api',
  onUnauthorized: () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
  },
});

/**
 * Hydrate at module load, not in an effect.
 *
 * Page components call the API from their own hooks, which run before the auth
 * provider's effect gets a chance to install the token. Restoring it here — a
 * synchronous localStorage read, before any component renders — is what stops
 * a page refresh from firing an unauthenticated request and bouncing a
 * signed-in user back to the login screen.
 */
function hydrateToken(): void {
  if (typeof window === 'undefined') return;
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token) api.setToken(token);
}

hydrateToken();

export function loadToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  if (token) api.setToken(token);
  return token;
}

export function saveToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
  api.setToken(token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  api.setToken(null);
}
