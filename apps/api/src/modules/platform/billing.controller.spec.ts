import { BadRequestException } from '@nestjs/common';
import { PlatformBillingController } from './billing.controller';

const billing = {
  gateway: jest.fn(() => ({ provider: 'razorpay', connected: true, webhooksVerifiable: true })),
  invoices: jest.fn(async () => []),
  runBilling: jest.fn(async () => ({ written: 1, skipped: 0 })),
  issue: jest.fn(async () => ({ id: 'inv_1' })),
  voidInvoice: jest.fn(async () => ({ id: 'inv_1' })),
  handleWebhook: jest.fn(async () => ({ handled: true })),
};

const razorpay = { verifyWebhook: jest.fn(() => true) };

const controller = new PlatformBillingController(billing as never, razorpay as never);

const raw = Buffer.from(JSON.stringify({ event: 'payment_link.paid', payload: { a: 1 } }));
const request = (over: Record<string, unknown> = {}) => ({ rawBody: raw, ...over }) as never;
const body = { event: 'payment_link.paid', payload: { a: 1 } };

beforeEach(() => {
  jest.clearAllMocks();
  razorpay.verifyWebhook.mockReturnValue(true);
});

describe('the webhook', () => {
  it('acts on one Razorpay signed', async () => {
    await controller.webhook(request(), 'a-signature', 'ev_1', body);

    expect(billing.handleWebhook).toHaveBeenCalledWith({
      eventId: 'ev_1',
      event: 'payment_link.paid',
      payload: { a: 1 },
    });
  });

  /*
   * The signature is over the bytes that were sent. Verifying anything else —
   * a re-serialised object, a parsed body — is a check that fails open the day
   * their encoder changes key order.
   */
  it('checks the raw bytes, not the parsed body', async () => {
    await controller.webhook(request(), 'a-signature', 'ev_1', body);

    expect(razorpay.verifyWebhook).toHaveBeenCalledWith(raw, 'a-signature');
  });

  it('refuses one that does not verify, and does not act on it', async () => {
    razorpay.verifyWebhook.mockReturnValue(false);

    await expect(
      controller.webhook(request(), 'forged', 'ev_1', body),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(billing.handleWebhook).not.toHaveBeenCalled();
  });

  // Without the raw bytes there is nothing to verify against, and a webhook
  // that cannot be verified must never be acted on.
  it('refuses one whose bytes were not kept', async () => {
    await expect(
      controller.webhook(request({ rawBody: undefined }), 'a-signature', 'ev_1', body),
    ).rejects.toThrow(/Unreadable/);
    expect(billing.handleWebhook).not.toHaveBeenCalled();
  });

  // Acting exactly once is keyed on their event id. Without one there is
  // nothing to be idempotent about.
  it('refuses one with no event id to be idempotent on', async () => {
    await expect(
      controller.webhook(request(), 'a-signature', '', body),
    ).rejects.toThrow(/No event id/);
    expect(billing.handleWebhook).not.toHaveBeenCalled();
  });

  // An attacker probing a signature learns nothing from silence.
  it('says nothing about why it refused', async () => {
    razorpay.verifyWebhook.mockReturnValue(false);

    await expect(controller.webhook(request(), 'forged', 'ev_1', body)).rejects.toThrow(
      'Not verified',
    );
  });

  /*
   * Razorpay retries anything that is not a 2xx. Answering with an error for
   * "I do not know this invoice" has them redeliver it every hour until
   * somebody notices.
   */
  it('answers normally for an event it could not act on', async () => {
    billing.handleWebhook.mockResolvedValue({ handled: false, reason: 'no such invoice' } as never);

    await expect(
      controller.webhook(request(), 'a-signature', 'ev_1', body),
    ).resolves.toEqual({ handled: false, reason: 'no such invoice' });
  });

  it('survives a body with neither an event nor a payload', async () => {
    await controller.webhook(request(), 'a-signature', 'ev_1', {});

    expect(billing.handleWebhook).toHaveBeenCalledWith({
      eventId: 'ev_1',
      event: 'unknown',
      payload: {},
    });
  });
});

describe('the rest of it', () => {
  it('says whether a gateway is connected', () => {
    expect(controller.gateway()).toMatchObject({ connected: true });
  });

  it('lists invoices, optionally for one workspace', async () => {
    await controller.invoices('t1');
    expect(billing.invoices).toHaveBeenCalledWith({ tenantId: 't1' });
  });

  it('works out the month’s bills on request', async () => {
    await controller.run();
    expect(billing.runBilling).toHaveBeenCalled();
  });

  it('sends one', async () => {
    await controller.issue('inv_1');
    expect(billing.issue).toHaveBeenCalledWith('inv_1');
  });

  it('withdraws one, with the reason', async () => {
    await controller.voidInvoice('inv_1', { reason: 'billed the wrong tier' });
    expect(billing.voidInvoice).toHaveBeenCalledWith('inv_1', 'billed the wrong tier');
  });
});
