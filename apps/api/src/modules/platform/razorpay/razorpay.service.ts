import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Razorpay, as much of it as we need.
 *
 * Written against their HTTP API rather than their SDK: what we use is three
 * calls and one signature check, and a dependency that ships its own HTTP
 * client, its own retry policy and its own idea of what an error is would be
 * more surface than the thing it wraps.
 *
 * Two things here are the whole reason this file is separate and tested:
 *
 *  - **Money crosses this boundary in paise.** Razorpay takes the smallest
 *    currency unit, always, and a rupee figure passed straight through bills a
 *    client one hundredth of what they owe. Nothing about the response says
 *    so; it succeeds.
 *  - **A webhook is an unauthenticated request from the internet.** It is
 *    trusted because it carries a signature over the exact bytes that were
 *    sent, checked against a secret only we and Razorpay have. Verifying a
 *    re-serialised body instead of the raw one is the standard way this is got
 *    wrong, and it fails open the day a key order changes.
 */

export interface PaymentLink {
  id: string;
  shortUrl: string;
}

@Injectable()
export class RazorpayService {
  private readonly log = new Logger(RazorpayService.name);

  constructor(private readonly config: ConfigService) {}

  private get keyId() {
    return this.config.get<string>('RAZORPAY_KEY_ID');
  }

  private get keySecret() {
    return this.config.get<string>('RAZORPAY_KEY_SECRET');
  }

  private get webhookSecret() {
    return this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
  }

  private get baseUrl() {
    return this.config.get<string>('RAZORPAY_API_URL') ?? 'https://api.razorpay.com/v1';
  }

  /**
   * Is there an account behind this at all?
   *
   * Asked rather than assumed, so a platform with no keys says "no gateway is
   * connected" on the screen instead of failing halfway through issuing a bill
   * and leaving an invoice that claims to have been sent.
   */
  configured(): boolean {
    return Boolean(this.keyId && this.keySecret);
  }

  /** Whether a webhook could even be checked. Separate: it is a separate key. */
  canVerifyWebhooks(): boolean {
    return Boolean(this.webhookSecret);
  }

  /**
   * Rupees to paise.
   *
   * Two rounds, not one, and both are needed. `Math.round(x * 100)` alone
   * truncates 0.1 + 0.2 — which a float holds as 0.30000000000000004 — and
   * multiplying first can also land *below* the value it should round up
   * from: 1.005 * 100 is 100.49999999999999, so a single round bills 100 paise
   * where 101 is owed. Fixing the product to two places first pins it to the
   * decimal somebody actually agreed to, and then it is rounded.
   *
   * Invoice amounts come from a Decimal(12,2) column and so cannot have a
   * third place — but they reach here through JavaScript arithmetic, which is
   * exactly where the third place appears.
   */
  static toPaise(rupees: number): number {
    return Math.round(Number((rupees * 100).toFixed(2)));
  }

  /** And back, for anything we are told rather than ask for. */
  static toRupees(paise: number): number {
    return Math.round(paise) / 100;
  }

  /**
   * Somewhere for a client to pay one invoice.
   *
   * A payment link rather than a subscription. Razorpay subscriptions bind a
   * customer to a fixed plan and charge it on their schedule, which is a poor
   * fit for a bill that is a tier plus whatever modules the workspace holds
   * this month — that changes, and it changes because we changed it. A link
   * per invoice keeps the amount ours to decide and Razorpay's job to collect.
   */
  async createPaymentLink(input: {
    amountRupees: number;
    description: string;
    reference: string;
    customer: { name: string; email?: string | null; phone?: string | null };
    notes?: Record<string, string>;
  }): Promise<PaymentLink> {
    const body = {
      amount: RazorpayService.toPaise(input.amountRupees),
      currency: 'INR',
      description: input.description,
      // Ours. It comes back on the webhook, which is how a payment finds the
      // invoice it belongs to without trusting anything in the amount.
      reference_id: input.reference,
      customer: {
        name: input.customer.name,
        ...(input.customer.email ? { email: input.customer.email } : {}),
        ...(input.customer.phone ? { contact: input.customer.phone } : {}),
      },
      notify: { sms: false, email: false },
      reminder_enable: true,
      notes: input.notes ?? {},
    };

    const response = await this.post<{ id: string; short_url: string }>('/payment_links', body);
    return { id: response.id, shortUrl: response.short_url };
  }

  /** Cancel a link nobody should pay any more. */
  async cancelPaymentLink(linkId: string): Promise<void> {
    await this.post(`/payment_links/${linkId}/cancel`, {});
  }

  /**
   * Did Razorpay send this?
   *
   * Over the raw bytes of the request, never over a re-serialised object: the
   * signature is a hash of exactly what was transmitted, and JSON round-trips
   * do not preserve key order or number formatting. Compared in constant time,
   * because a comparison that returns early leaks the signature one byte at a
   * time to anybody willing to send enough requests.
   */
  verifyWebhook(rawBody: Buffer | string, signature: string | undefined): boolean {
    const secret = this.webhookSecret;
    if (!secret || !signature) return false;

    const expected = createHmac('sha256', secret)
      .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
      .digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature, 'utf8');
    // timingSafeEqual throws on a length mismatch, which would itself be a
    // signal. A wrong length is simply a wrong signature.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.configured()) {
      throw new ServiceUnavailableException(
        'No payment gateway is connected. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      );
    }

    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      // Razorpay's own words, kept: "amount must be at least 100" is a thing
      // somebody can act on, and "request failed" is not. The key is never in
      // here, and must never be logged beside it.
      const reason = readError(text) ?? `${response.status} ${response.statusText}`;
      this.log.error(`Razorpay ${path} refused: ${reason}`);
      throw new ServiceUnavailableException(`The payment gateway refused: ${reason}`);
    }

    return JSON.parse(text) as T;
  }
}

/** Razorpay's error shape, defensively. A gateway may also return a proxy's HTML. */
function readError(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { error?: { description?: string } };
    return parsed.error?.description ?? null;
  } catch {
    return null;
  }
}
