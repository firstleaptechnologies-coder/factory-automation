'use client';

import { useEffect } from 'react';
import { flushLogs, installErrorReporting, restoreLogs } from '@/lib/logs';

/**
 * Installed once, at the top of the app.
 *
 * Renders nothing: it is here so that what this browser could not handle is
 * told to somebody who can act on it, rather than only to the console of the
 * person it happened to.
 */
export function ErrorReporting() {
  useEffect(() => {
    restoreLogs();
    void flushLogs();
    return installErrorReporting();
  }, []);

  return null;
}
