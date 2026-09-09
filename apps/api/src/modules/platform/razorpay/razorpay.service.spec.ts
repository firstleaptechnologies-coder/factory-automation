import { createHmac } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { RazorpayService } from './razorpay.service';

const SECRET = 'a-webhook-secret';

const build = (env: Record<string, string | undefined> = {}) =>
  new RazorpayService({
    get: (key: string) =>
      ({
        RAZORPAY_KEY_ID: 'rzp_test_key',
        RAZORPAY_KEY_SECRET: 'rzp_test_secret',
        RAZORPAY_WEBHOOK_SECRET: SECRET,
        RAZORPAY_API_URL: 'https://api.example.test/v1',
        ...env,
      })[key],
  } as never);

/*
 * The bug that costs a hundred times the money and reports success.
 *
 * Razorpay takes the smallest currency unit, always. A rupee figure passed
 * straight through bills a client one paise in the rupee, the call returns
 * 200, and the only sign is a bank statement three weeks later.
 */
describe('rupees to paise', () => {
  it('multiplies by a hundred', () => {
    expect(RazorpayService.toPaise(8000)).toBe(800000);
  });

  it('carries the paise somebody actually owes', () => {
    expect(RazorpayService.toPaise(1234.56)).toBe(123456);
  });

  // 0.1 + 0.2 is 0.30000000000000004 in a float. Truncating that bills 29
  // paise instead of 30 — every month, quietly, for ever.
  it('rounds rather than truncates a float that cannot be represented', () => {
    expect(RazorpayService.toPaise(0.1 + 0.2)).toBe(30);
    expect(RazorpayService.toPaise(1.005)).toBe(101);
  });

  it('comes back the same way', () => {
    expect(RazorpayService.toRupees(800000)).toBe(8000);
    expect(RazorpayService.toRupees(123456)).toBe(1234.56);
  });

  it('is nothing for nothing', () => {
    expect(RazorpayService.toPaise(0)).toBe(0);
  });
});

describe('knowing whether there is an account behind this', () => {
  it('says so when there is', () => {
    expect(build().configured()).toBe(true);
  });

  it('says so when there is not', () => {
    expect(build({ RAZORPAY_KEY_SECRET: undefined }).configured()).toBe(false);
  });

  // Separate keys, separate answers: an account can be connected while nobody
  // has set up webhooks, and that combination collects money it never records.
  it('tracks the webhook secret apart from the keys', () => {
    expect(build({ RAZORPAY_WEBHOOK_SECRET: undefined }).canVerifyWebhooks()).toBe(false);
    expect(build({ RAZORPAY_WEBHOOK_SECRET: undefined }).configured()).toBe(true);
  });
});

describe('verifying a webhook', () => {
  const body = JSON.stringify({ event: 'payment_link.paid', payload: {} });
  const sign = (payload: string, secret = SECRET) =>
    createHmac('sha256', secret).update(payload).digest('hex');

  it('accepts what Razorpay signed', () => {
    expect(build().verifyWebhook(body, sign(body))).toBe(true);
  });

  it('accepts it as raw bytes, which is how it arrives', () => {
    expect(build().verifyWebhook(Buffer.from(body, 'utf8'), sign(body))).toBe(true);
  });

  it('refuses a signature made with another secret', () => {
    expect(build().verifyWebhook(body, sign(body, 'someone-elses'))).toBe(false);
  });

  /*
   * The reason the raw bytes are kept rather than the parsed object. JSON
   * round-trips do not preserve key order or number formatting, so a signature
   * checked against a re-serialised body is one that fails the day their
   * encoder changes — or that somebody works out how to make pass.
   */
  it('refuses a body that was re-serialised, however equal it looks', () => {
    const resent = JSON.stringify(JSON.parse(body), ['payload', 'event']);

    expect(resent).not.toBe(body);
    expect(build().verifyWebhook(resent, sign(body))).toBe(false);
  });

  it('refuses a body somebody changed a digit in', () => {
    expect(build().verifyWebhook(body.replace('paid', 'fail'), sign(body))).toBe(false);
  });

  it('refuses a request with no signature at all', () => {
    expect(build().verifyWebhook(body, undefined)).toBe(false);
  });

  // A wrong length is a wrong signature, not an exception. timingSafeEqual
  // throws on mismatched lengths, and a thrown error is itself a signal.
  it('refuses a signature of the wrong length without throwing', () => {
    expect(() => build().verifyWebhook(body, 'short')).not.toThrow();
    expect(build().verifyWebhook(body, 'short')).toBe(false);
  });

  // With no secret there is nothing to check against, and a webhook that
  // cannot be verified must never be treated as verified.
  it('refuses everything when no webhook secret is set', () => {
    const unconfigured = build({ RAZORPAY_WEBHOOK_SECRET: undefined });

    expect(unconfigured.verifyWebhook(body, sign(body))).toBe(false);
  });
});

describe('talking to Razorpay', () => {
  const ok = (payload: unknown) =>
    jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(payload),
    })) as never;

  beforeEach(() => {
    (global as { fetch?: unknown }).fetch = undefined;
  });

  const link = () => ({
    amountRupees: 8000,
    description: 'FAS — Decor Bucket, 2026-09',
    reference: 'inv_1',
    customer: { name: 'Decor Bucket', email: 'a@b.in', phone: null },
  });

  it('sends the amount in paise, not rupees', async () => {
    const fetchMock = ok({ id: 'plink_1', short_url: 'https://rzp.io/i/abc' });
    global.fetch = fetchMock;

    await build().createPaymentLink(link());

    const body = JSON.parse((fetchMock as jest.Mock).mock.calls[0][1].body as string);
    expect(body.amount).toBe(800000);
    expect(body.currency).toBe('INR');
  });

  /*
   * Ours, sent out and returned on the webhook. Matching a payment on an
   * amount instead would settle the wrong bill the first time two workspaces
   * owe the same money in the same month — which is ordinary, not rare.
   */
  it('carries our own invoice id, so a payment can find its bill', async () => {
    const fetchMock = ok({ id: 'plink_1', short_url: 'https://rzp.io/i/abc' });
    global.fetch = fetchMock;

    await build().createPaymentLink(link());

    const body = JSON.parse((fetchMock as jest.Mock).mock.calls[0][1].body as string);
    expect(body.reference_id).toBe('inv_1');
  });

  it('leaves out a contact detail the workspace has not given', async () => {
    const fetchMock = ok({ id: 'plink_1', short_url: 'https://rzp.io/i/abc' });
    global.fetch = fetchMock;

    await build().createPaymentLink(link());

    const body = JSON.parse((fetchMock as jest.Mock).mock.calls[0][1].body as string);
    expect(body.customer).toEqual({ name: 'Decor Bucket', email: 'a@b.in' });
  });

  it('hands back where the client pays', async () => {
    global.fetch = ok({ id: 'plink_1', short_url: 'https://rzp.io/i/abc' });

    await expect(build().createPaymentLink(link())).resolves.toEqual({
      id: 'plink_1',
      shortUrl: 'https://rzp.io/i/abc',
    });
  });

  // "Request failed" is not something anybody can act on. "amount must be at
  // least 100" is.
  it('passes on what Razorpay actually said was wrong', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ error: { description: 'amount must be at least 100' } }),
    })) as never;

    await expect(build().createPaymentLink(link())).rejects.toThrow(/amount must be at least 100/);
  });

  it('survives a gateway that returns a proxy’s HTML instead of JSON', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => '<html>502</html>',
    })) as never;

    await expect(build().createPaymentLink(link())).rejects.toThrow(/502 Bad Gateway/);
  });

  /*
   * Without keys there is no account to charge against. Refusing here is what
   * stops an invoice being marked sent with nowhere to pay it.
   */
  it('refuses to try at all when no account is connected', async () => {
    global.fetch = jest.fn() as never;
    const unconfigured = build({ RAZORPAY_KEY_ID: undefined });

    await expect(unconfigured.createPaymentLink(link())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
