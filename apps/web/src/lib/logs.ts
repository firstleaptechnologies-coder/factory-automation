'use client';

import { api } from './api';

const KEY = 'decor.logs.pending';

/** Sent in one go. */
const MAX_BATCH = 50;
/** Held while offline before the oldest are let go. */
const MAX_HELD = 200;

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  at: string;
  context?: Record<string, unknown>;
}

let queue: LogEntry[] = [];
let sending = false;

/**
 * What this browser saw, kept until it can be told.
 *
 * The same queue the app keeps, for the same reason: an error somebody hit at
 * the desk is otherwise described over the phone the next day. Held in
 * localStorage so a reload — which is what people do when something breaks —
 * does not take the evidence with it.
 */
export async function logEvent(
  level: LogEntry['level'],
  message: string,
  context?: Record<string, unknown>,
): Promise<void> {
  queue.push({ level, message: String(message).slice(0, 2000), at: new Date().toISOString(), context });
  if (queue.length > MAX_HELD) queue = queue.slice(-MAX_HELD);
  persist();

  if (level === 'error' || queue.length >= 10) await flushLogs();
}

export async function flushLogs(): Promise<void> {
  if (sending || queue.length === 0) return;
  sending = true;
  const batch = queue.slice(0, MAX_BATCH);

  try {
    await api.sendLogs({ client: 'web', platform: browser(), entries: batch });
    queue = queue.slice(batch.length);
    persist();
  } catch {
    // Offline, or not signed in yet. They keep.
  } finally {
    sending = false;
  }
}

/** Pick up whatever the last page could not send. */
export function restoreLogs(): void {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved) queue = [...(JSON.parse(saved) as LogEntry[]), ...queue].slice(-MAX_HELD);
  } catch {
    // A browser that refuses storage still gets a working app.
  }
}

/**
 * Report what the page could not handle itself.
 *
 * Both halves matter: `error` catches what was thrown, and
 * `unhandledrejection` catches the promise nobody caught — which, in a product
 * this full of fetches, is where most of them are.
 */
export function installErrorReporting(): () => void {
  const onError = (event: ErrorEvent) => {
    void logEvent('error', `${event.message}`, {
      source: `${event.filename ?? ''}:${event.lineno ?? 0}`,
      stack: String(event.error?.stack ?? '').slice(0, 2000),
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason as { message?: string; stack?: string } | string;
    void logEvent('error', typeof reason === 'string' ? reason : reason?.message ?? 'Unhandled rejection', {
      stack: String((reason as { stack?: string })?.stack ?? '').slice(0, 2000),
    });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}

/** Only for tests: start from nothing. */
export function resetLogs(): void {
  queue = [];
  sending = false;
}

function persist(): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // Not worth failing anything over.
  }
}

/** Enough to tell one browser from another without storing a fingerprint. */
function browser(): string {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/edg/i.test(agent)) return 'edge';
  if (/chrome/i.test(agent)) return 'chrome';
  if (/safari/i.test(agent)) return 'safari';
  if (/firefox/i.test(agent)) return 'firefox';
  return 'browser';
}
