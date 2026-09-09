import { flushLogs, installCrashReporting, logEvent, resetLogs, restoreLogs } from './logs';

const mockSendLogs = jest.fn();
jest.mock('../api/client', () => ({
  api: { sendLogs: (...args: unknown[]) => mockSendLogs(...args) },
}));

const store: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => store[key] ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    store[key] = value;
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  resetLogs();
  for (const key of Object.keys(store)) delete store[key];
  mockSendLogs.mockResolvedValue({ recorded: 1 });
});

describe('what the device saw', () => {
  it('sends an error straight away', async () => {
    await logEvent('error', 'Could not punch');
    await Promise.resolve();

    const batch = mockSendLogs.mock.calls[0][0];
    expect(batch.client).toBe('app');
    expect(batch.entries[0]).toMatchObject({ level: 'error', message: 'Could not punch' });
  });

  it('holds an ordinary note until there is company', async () => {
    await logEvent('info', 'Signed in');
    await Promise.resolve();
    // A round trip per line would cost more than it is worth.
    expect(mockSendLogs).not.toHaveBeenCalled();
  });

  it('keeps what could not be sent', async () => {
    mockSendLogs.mockRejectedValue(new Error('offline'));
    await logEvent('error', 'Could not punch');
    await flushLogs();

    mockSendLogs.mockResolvedValue({ recorded: 1 });
    await flushLogs();

    // The whole point: a workshop with no signal still reports what happened.
    expect(mockSendLogs.mock.calls.at(-1)?.[0].entries[0].message).toBe('Could not punch');
  });

  it('picks up what the last run could not send', async () => {
    store['fas.logs.pending'] = JSON.stringify([
      { level: 'error', message: 'Crashed on punch', at: '2026-09-08T09:00:00.000Z' },
    ]);

    await restoreLogs();
    await flushLogs();

    // The app being killed is exactly the case worth reporting.
    expect(mockSendLogs.mock.calls[0][0].entries[0].message).toBe('Crashed on punch');
  });

  it('says when it happened on the device', async () => {
    await logEvent('error', 'Boom');
    await Promise.resolve();
    expect(mockSendLogs.mock.calls[0][0].entries[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('a crash', () => {
  it('is reported, and still crashes', () => {
    const previous = jest.fn();
    const globals = globalThis as unknown as Record<string, unknown>;
    let installed: ((error: Error, fatal?: boolean) => void) | undefined;
    globals.ErrorUtils = {
      getGlobalHandler: () => previous,
      setGlobalHandler: (handler: (error: Error, fatal?: boolean) => void) => {
        installed = handler;
      },
    };

    installCrashReporting();
    const error = new Error('undefined is not a function');
    installed?.(error, true);

    // The red screen in development and the crash in release are unchanged.
    expect(previous).toHaveBeenCalledWith(error, true);
    delete globals.ErrorUtils;
  });

  it('does nothing where there is no handler to wrap', () => {
    const globals = globalThis as unknown as Record<string, unknown>;
    delete globals.ErrorUtils;
    expect(() => installCrashReporting()).not.toThrow();
  });
});
