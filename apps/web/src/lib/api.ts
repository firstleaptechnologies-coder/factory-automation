'use client';

import {ApiClient} from '@decor/shared';

const TOKEN_KEY = 'decor.token';

/**
 * Where a rejected request should leave the user.
 *
 * Separated from the act of navigating so the decision can be reasoned about
 * on its own: sending someone on the login screen back to the login screen
 * reloads the page and loses whatever they had typed.
 */
export function redirectAfterUnauthorized(pathname: string): string | null {
  return pathname === '/login' ? null : '/login';
}

/** The token is dropped whether or not we navigate — it is no longer valid. */
export function handleUnauthorized(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
  const destination = redirectAfterUnauthorized(window.location.pathname);
  if (destination) window.location.href = destination;
}

export const api = new ApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api',
  onUnauthorized: handleUnauthorized,
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
