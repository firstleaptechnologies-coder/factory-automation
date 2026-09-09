import { flushLogs, installErrorReporting, logEvent, resetLogs, restoreLogs } from './logs';

const sendLogs = jest.fn();
jest.mock('./api', () => ({ api: { sendLogs: (...args: unknown[]) => sendLogs(...args) } }));

beforeEach(() => {
  jest.clearAllMocks();
  resetLogs();
  window.localStorage.clear();
  sendLogs.mockResolvedValue({ recorded: 1 });
});

describe('what the browser saw', () => {
  it('sends an error straight away', async () => {
    await logEvent('error', 'Could not save the order');

    expect(sendLogs.mock.calls[0][0].client).toBe('web');
    expect(sendLogs.mock.calls[0][0].entries[0]).toMatchObject({
      level: 'error',
      message: 'Could not save the order',
    });
  });

  it('holds an ordinary note until there is company', async () => {
    await logEvent('info', 'Opened the board');
    expect(sendLogs).not.toHaveBeenCalled();
  });

  it('keeps what could not be sent', async () => {
    sendLogs.mockRejectedValue(new Error('offline'));
    await logEvent('error', 'Could not save');

    sendLogs.mockResolvedValue({ recorded: 1 });
    await flushLogs();

    expect(sendLogs.mock.calls.at(-1)?.[0].entries[0].message).toBe('Could not save');
  });

  it('picks up what the last page could not send', async () => {
    window.localStorage.setItem(
      'fas.logs.pending',
      JSON.stringify([{ level: 'error', message: 'Crashed', at: '2026-09-08T09:00:00.000Z' }]),
    );

    restoreLogs();
    await flushLogs();

    // Reloading is what people do when something breaks; it should not take
    // the evidence with it.
    expect(sendLogs.mock.calls[0][0].entries[0].message).toBe('Crashed');
  });

  it('survives a browser that refuses storage', async () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => restoreLogs()).not.toThrow();
    getItem.mockRestore();
  });
});

describe('what the page could not handle', () => {
  it('reports a thrown error', async () => {
    const stop = installErrorReporting();
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'x is not a function', filename: 'app.js', lineno: 4 }),
    );
    await Promise.resolve();

    expect(sendLogs.mock.calls[0][0].entries[0].message).toBe('x is not a function');
    stop();
  });

  it('reports a promise nobody caught', async () => {
    const stop = installErrorReporting();
    const event = new Event('unhandledrejection') as Event & { reason?: unknown };
    event.reason = new Error('Failed to fetch');
    window.dispatchEvent(event);
    await Promise.resolve();

    // In a product this full of fetches, that is where most of them are.
    expect(sendLogs.mock.calls[0][0].entries[0].message).toBe('Failed to fetch');
    stop();
  });

  it('stops listening when it is taken down', async () => {
    const stop = installErrorReporting();
    stop();
    window.dispatchEvent(new ErrorEvent('error', { message: 'after' }));
    await Promise.resolve();
    expect(sendLogs).not.toHaveBeenCalled();
  });
});
