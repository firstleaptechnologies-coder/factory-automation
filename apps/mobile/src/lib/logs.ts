import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../api/client';

const KEY = 'decor.logs.pending';

/** Sent in one go. More than this and the oldest are dropped. */
const MAX_BATCH = 50;
/** How many are held while offline before the oldest are let go. */
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
 * What this device saw, kept until it can be told.
 *
 * A crash on a shop floor is otherwise something somebody describes over the
 * phone the next day, from memory. The queue is written to storage as it grows,
 * so what happened survives the app being killed — which is exactly the case
 * worth reporting — and is sent when the network comes back.
 *
 * Nothing here is a substitute for handling an error in front of the person: it
 * is what lets somebody else find out what they saw.
 */
export async function logEvent(
  level: LogEntry['level'],
  message: string,
  context?: Record<string, unknown>,
): Promise<void> {
  queue.push({ level, message: String(message).slice(0, 2000), at: new Date().toISOString(), context });
  if (queue.length > MAX_HELD) queue = queue.slice(-MAX_HELD);
  await persist();

  // An error is worth the round trip now; the rest can wait for company.
  if (level === 'error' || queue.length >= 10) void flushLogs();
}

/** Send what is queued. Anything that does not go stays queued. */
export async function flushLogs(): Promise<void> {
  if (sending || queue.length === 0) return;
  sending = true;
  const batch = queue.slice(0, MAX_BATCH);

  try {
    await api.sendLogs({ client: 'app', platform: Platform.OS, entries: batch });
    queue = queue.slice(batch.length);
    await persist();
  } catch {
    // Offline, or not signed in yet. They keep.
  } finally {
    sending = false;
  }
}

/** Pick up whatever the last run could not send. */
export async function restoreLogs(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) queue = [...(JSON.parse(saved) as LogEntry[]), ...queue].slice(-MAX_HELD);
  } catch {
    // A device that will not read its own storage still gets a working app.
  }
}

/**
 * Report a crash before the app goes down with it.
 *
 * The previous handler is kept and still called, so the red screen in
 * development and the ordinary crash behaviour in release are unchanged.
 */
export function installCrashReporting(): void {
  const globals = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
    };
  };
  const utils = globals.ErrorUtils;
  if (!utils?.setGlobalHandler) return;

  const previous = utils.getGlobalHandler?.();
  utils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    void logEvent('error', `${error?.name ?? 'Error'}: ${error?.message ?? error}`, {
      fatal: Boolean(isFatal),
      stack: String(error?.stack ?? '').slice(0, 2000),
    });
    previous?.(error, isFatal);
  });
}

/** Only for tests: start from nothing. */
export function resetLogs(): void {
  queue = [];
  sending = false;
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // Not worth failing anything over.
  }
}
