import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlatformInvoiceStatus, Prisma, TenantStatus } from '@prisma/client';
import { MODULE_CATALOGUE, billFor, rupees } from '@fas/shared';
import type { ModuleKey } from '@fas/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';
import { RazorpayService } from './razorpay/razorpay.service';

/**
 * Turning what a workspace is on into a bill, and a bill into money.
 *
 * Four rules hold this together, and each of them exists because the obvious
 * version is wrong:
 *
 *  - **An invoice is written once.** The lines are frozen into the row as they
 *    stood the day it was issued. A bill that recomputes itself from today's
 *    tier would restate what somebody was charged in March every time the
 *    price list changed.
 *  - **A month can only be billed once**, and that is enforced by a unique
 *    index on `(tenantId, period)` rather than by this code being careful. Two
 *    instances waking on the same morning is the normal case, not the edge.
 *  - **Nothing internal is billed.** Ours is ACTIVE and on every module, which
 *    is exactly what a paying client looks like from here.
 *  - **A payment is recorded from the webhook, never from the browser.** What
 *    the client's browser says happened is a claim; what Razorpay signs is
 *    evidence.
 */
/** What a client should read on a bill, rather than the key we store. */
const MODULE_LABELS = Object.fromEntries(
  MODULE_CATALOGUE.map((one) => [one.key, one.label]),
) as Partial<Record<ModuleKey, string>>;

@Injectable()
export class PlatformBillingService {
  private readonly log = new Logger(PlatformBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly razorpay: RazorpayService,
  ) {}

  private get db() {
    return this.prisma.platform;
  }

  /** The month a date falls in, as its first day in UTC. */
  static periodOf(when: Date): Date {
    return new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), 1));
  }

  /**
   * Write this month's invoices for everybody due one today.
   *
   * Due today means their billing day is today — or has already passed this
   * month and they were missed, which happens when an instance was down on the
   * morning it should have run. Catching up is safe precisely because the
   * month is unique per workspace.
   */
  async runBilling(now = new Date()): Promise<{ written: number; skipped: number }> {
    const period = PlatformBillingService.periodOf(now);
    const today = now.getUTCDate();

    const [tenants, tiers, prices] = await Promise.all([
      this.db.tenant.findMany({
        where: { isInternal: false, status: TenantStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          plan: true,
          modules: true,
          billingDay: true,
        },
      }),
      this.subscriptions.tiers(),
      this.subscriptions.modulePrices(),
    ]);

    const tierByKey = new Map(tiers.map((one) => [one.key, one]));
    const priceMap = Object.fromEntries(prices.map((one) => [one.moduleKey, one.monthlyPrice]));

    let written = 0;
    let skipped = 0;

    for (const tenant of tenants) {
      // No billing day is not "bill them today". It is a workspace nobody has
      // finished setting up, and billing it on whatever day the job happened
      // to run would set their date by accident.
      if (!tenant.billingDay) {
        skipped += 1;
        continue;
      }
      if (tenant.billingDay > today) continue;

      const tier = tenant.plan ? tierByKey.get(tenant.plan) : undefined;
      const bill = billFor(
        tier
          ? {
              key: tier.key,
              label: tier.label,
              blurb: tier.blurb ?? '',
              monthlyPrice: tier.monthlyPrice,
              includedModules: tier.includedModules as never,
            }
          : undefined,
        tenant.modules ?? [],
        priceMap,
        /*
         * The names a client would recognise, frozen in with the amounts. Left
         * out, a line reads `hr` on a bill somebody's accountant is looking
         * at — and the labels have to be captured here rather than resolved
         * when the invoice is displayed, or renaming a module in the catalogue
         * would rewrite what an old bill said.
         */
        MODULE_LABELS,
      );

      // Nothing owed is not an invoice. A bill for zero is a demand for
      // nothing, and it reads to a client as a mistake we made.
      if (bill.monthlyTotal <= 0) {
        skipped += 1;
        continue;
      }

      try {
        await this.db.platformInvoice.create({
          data: {
            tenantId: tenant.id,
            period,
            lines: bill.lines as unknown as Prisma.InputJsonValue,
            amount: bill.monthlyTotal,
            status: PlatformInvoiceStatus.DRAFT,
          },
        });
        written += 1;
      } catch (error) {
        // The unique index doing its job: this month is already billed. That
        // is the expected outcome of a second run, not a failure.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }

    return { written, skipped };
  }

  /**
   * Send an invoice: make somewhere to pay it, and record where.
   *
   * The link is created before the row is marked issued, and the row carries
   * Razorpay's id. A link created and not recorded is a client who can pay a
   * bill we will not recognise — so if the write fails after the link exists,
   * the link is cancelled rather than left live.
   */
  async issue(invoiceId: string) {
    const invoice = await this.db.platformInvoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) throw new NotFoundException('No such invoice');
    if (invoice.status === PlatformInvoiceStatus.PAID) {
      throw new BadRequestException('That invoice is already paid');
    }
    if (invoice.status === PlatformInvoiceStatus.VOID) {
      throw new BadRequestException('That invoice was cancelled');
    }

    const tenant = await this.db.tenant.findUnique({ where: { id: invoice.tenantId } });
    if (!tenant) throw new NotFoundException('No such workspace');

    const amount = Number(invoice.amount);
    const month = invoice.period.toISOString().slice(0, 7);

    const link = await this.razorpay.createPaymentLink({
      amountRupees: amount,
      description: `FAS — ${tenant.name}, ${month}`,
      reference: invoice.id,
      customer: {
        name: tenant.contactName ?? tenant.name,
        email: tenant.contactEmail,
        phone: tenant.contactPhone,
      },
      notes: { invoiceId: invoice.id, tenantId: tenant.id, period: month },
    });

    try {
      return await this.db.platformInvoice.update({
        where: { id: invoice.id },
        data: {
          status: PlatformInvoiceStatus.ISSUED,
          razorpayLinkId: link.id,
          paymentUrl: link.shortUrl,
          issuedAt: new Date(),
          failureReason: null,
        },
      });
    } catch (error) {
      // A live link nobody can reconcile is worse than no link. Cancelling can
      // itself fail — the gateway may be why we are here — so it is logged
      // loudly rather than swallowed.
      await this.razorpay
        .cancelPaymentLink(link.id)
        .catch((cancelError) =>
          this.log.error(
            `Left a live Razorpay link ${link.id} for invoice ${invoice.id}: ${String(cancelError)}`,
          ),
        );
      throw error;
    }
  }

  /** Withdraw a bill. Never deleted — one that was sent and withdrawn happened. */
  async voidInvoice(invoiceId: string, reason: string) {
    const invoice = await this.db.platformInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('No such invoice');
    if (invoice.status === PlatformInvoiceStatus.PAID) {
      throw new BadRequestException(
        'That invoice is paid. Money that came in is refunded, not un-billed',
      );
    }

    if (invoice.razorpayLinkId) {
      await this.razorpay.cancelPaymentLink(invoice.razorpayLinkId).catch((error) => {
        // A link that will not cancel must not stop us marking the bill
        // withdrawn — but somebody has to know it is still live.
        this.log.error(`Could not cancel Razorpay link ${invoice.razorpayLinkId}: ${String(error)}`);
      });
    }

    return this.db.platformInvoice.update({
      where: { id: invoice.id },
      data: { status: PlatformInvoiceStatus.VOID, failureReason: reason },
    });
  }

  /**
   * A webhook from Razorpay, recorded and then acted on.
   *
   * Recorded first, and keyed on their event id, so a delivery we already
   * handled is a no-op rather than a second payment. Razorpay retries anything
   * it did not get a 2xx for, so being sent the same event twice is the normal
   * case.
   *
   * The signature is checked by the controller, on the raw bytes. By the time
   * anything reaches here it is known to have come from Razorpay — but not
   * that it is about an invoice we have, which is checked below.
   */
  async handleWebhook(input: {
    eventId: string;
    event: string;
    payload: Record<string, unknown>;
  }): Promise<{ handled: boolean; reason?: string }> {
    try {
      await this.db.platformBillingEvent.create({
        data: {
          eventId: input.eventId,
          event: input.event,
          payload: input.payload as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Seen before. Answering 200 is what stops Razorpay retrying for ever.
        return { handled: false, reason: 'already seen' };
      }
      throw error;
    }

    try {
      const outcome = await this.act(input.event, input.payload);
      await this.db.platformBillingEvent.update({
        where: { eventId: input.eventId },
        data: { handledAt: new Date() },
      });
      return outcome;
    } catch (error) {
      // The event stays recorded, unhandled, with why. Re-raising would make
      // Razorpay retry, which for a bug in our own code retries the bug.
      await this.db.platformBillingEvent.update({
        where: { eventId: input.eventId },
        data: { error: String(error) },
      });
      this.log.error(`Razorpay ${input.event} (${input.eventId}) failed: ${String(error)}`);
      return { handled: false, reason: 'failed' };
    }
  }

  private async act(
    event: string,
    payload: Record<string, unknown>,
  ): Promise<{ handled: boolean; reason?: string }> {
    const link = reach(payload, ['payment_link', 'entity']) as
      | { id?: string; reference_id?: string; amount?: number }
      | undefined;
    const payment = reach(payload, ['payment', 'entity']) as
      | { id?: string; amount?: number; error_description?: string }
      | undefined;

    // Ours, sent out with the link and returned with the event. Matching on it
    // rather than on an amount: two workspaces owing the same money in the
    // same month is ordinary, and would otherwise settle the wrong bill.
    const invoiceId = link?.reference_id;
    if (!invoiceId) return { handled: false, reason: 'no invoice reference' };

    const invoice = await this.db.platformInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return { handled: false, reason: 'no such invoice' };

    if (event === 'payment_link.paid') {
      if (invoice.status === PlatformInvoiceStatus.PAID) {
        return { handled: false, reason: 'already paid' };
      }

      /*
       * What arrived, against what was asked for.
       *
       * A part payment is not a paid invoice. Marking it paid would report an
       * invoice as settled for less than was collected, which is the one thing
       * this product does not do anywhere — not to a shop's client, and not to
       * ours. It is recorded, and it stays owing.
       */
      const paid = rupees(RazorpayService.toRupees(payment?.amount ?? link?.amount ?? 0));
      const owed = rupees(Number(invoice.amount));

      if (paid < owed) {
        await this.db.platformInvoice.update({
          where: { id: invoice.id },
          data: {
            status: PlatformInvoiceStatus.FAILED,
            razorpayPaymentId: payment?.id ?? null,
            failureReason: `Paid ₹${paid} against ₹${owed}. Still owing ₹${rupees(owed - paid)}.`,
          },
        });
        return { handled: true, reason: 'short payment' };
      }

      await this.db.platformInvoice.update({
        where: { id: invoice.id },
        data: {
          status: PlatformInvoiceStatus.PAID,
          razorpayPaymentId: payment?.id ?? null,
          paidAt: new Date(),
          failureReason: null,
        },
      });
      return { handled: true };
    }

    if (event === 'payment.failed' || event === 'payment_link.cancelled') {
      // The invoice still stands. Only the attempt did not.
      if (invoice.status === PlatformInvoiceStatus.PAID) {
        return { handled: false, reason: 'already paid' };
      }
      await this.db.platformInvoice.update({
        where: { id: invoice.id },
        data: {
          status: PlatformInvoiceStatus.FAILED,
          failureReason: payment?.error_description ?? 'The payment did not go through',
        },
      });
      return { handled: true };
    }

    return { handled: false, reason: 'not a kind we act on' };
  }

  /** Every invoice, newest first, for the billing screen. */
  async invoices(query: { tenantId?: string; status?: PlatformInvoiceStatus } = {}) {
    const rows = await this.db.platformInvoice.findMany({
      where: {
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });

    const tenants = await this.db.tenant.findMany({
      where: { id: { in: [...new Set(rows.map((one) => one.tenantId))] } },
      select: { id: true, name: true, slug: true },
    });
    const byId = new Map(tenants.map((one) => [one.id, one]));

    return rows.map((row) => ({
      ...row,
      amount: Number(row.amount),
      workspace: byId.get(row.tenantId) ?? null,
    }));
  }

  /** Whether a gateway is connected at all, for a screen that must not pretend. */
  gateway() {
    return {
      provider: 'razorpay',
      connected: this.razorpay.configured(),
      webhooksVerifiable: this.razorpay.canVerifyWebhooks(),
    };
  }
}

/** Reads a nested key without asserting the shape of somebody else's payload. */
function reach(source: unknown, path: string[]): unknown {
  let at: unknown = source;
  for (const key of path) {
    if (!at || typeof at !== 'object') return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return at;
}
