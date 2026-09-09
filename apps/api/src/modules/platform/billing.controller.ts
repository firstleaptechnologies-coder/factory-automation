import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { PERMISSIONS } from '@fas/shared';
import type { Request } from 'express';
import { PlatformBillingService } from './billing.service';
import { RazorpayService } from './razorpay/razorpay.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { VoidInvoiceDto } from './dto/billing.dto';

/**
 * Bills, and the money against them.
 *
 * The webhook is the only route in the product that is public and still
 * trusted. It has to be: Razorpay is calling us, and it holds no token of
 * ours. What it holds instead is a signature over the exact bytes it sent,
 * checked here before anything reads the body.
 */
@Controller('platform/billing')
export class PlatformBillingController {
  constructor(
    private readonly billing: PlatformBillingService,
    private readonly razorpay: RazorpayService,
  ) {}

  @Get('gateway')
  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_VIEW)
  gateway() {
    return this.billing.gateway();
  }

  @Get('invoices')
  @RequirePermissions(PERMISSIONS.PLATFORM_TENANT_VIEW)
  invoices(@Query('tenantId') tenantId?: string) {
    return this.billing.invoices({ tenantId });
  }

  /** Work out this month's bills now, rather than waiting for the morning. */
  @Post('run')
  @RequirePermissions(PERMISSIONS.PLATFORM_PRICING_MANAGE)
  run() {
    return this.billing.runBilling();
  }

  @Post('invoices/:id/issue')
  @RequirePermissions(PERMISSIONS.PLATFORM_PRICING_MANAGE)
  issue(@Param('id') id: string) {
    return this.billing.issue(id);
  }

  @Post('invoices/:id/void')
  @RequirePermissions(PERMISSIONS.PLATFORM_PRICING_MANAGE)
  voidInvoice(@Param('id') id: string, @Body() dto: VoidInvoiceDto) {
    return this.billing.voidInvoice(id, dto.reason);
  }

  /**
   * Razorpay, telling us what happened.
   *
   * Public because the caller is Razorpay and holds no token of ours. Trusted
   * because of the signature, and for no other reason — the body is not read
   * until it verifies.
   *
   * It answers 200 to anything it has already seen or cannot act on. Razorpay
   * retries anything that is not a 2xx, so returning an error for "I do not
   * know this invoice" would have them redeliver it every hour until somebody
   * noticed. What we could not act on is recorded and shows on the screen.
   */
  @Public()
  @Post('razorpay/webhook')
  async webhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature: string,
    @Headers('x-razorpay-event-id') eventId: string,
    @Body() body: { event?: string; payload?: Record<string, unknown> },
  ) {
    const raw = request.rawBody;
    if (!raw) {
      // Without the raw bytes there is nothing to verify against, and a
      // webhook that cannot be verified must never be acted on.
      throw new BadRequestException('Unreadable request');
    }

    if (!this.razorpay.verifyWebhook(raw, signature)) {
      // Deliberately says nothing about why. An attacker probing a signature
      // learns nothing from "wrong length" that they do not learn from silence.
      throw new BadRequestException('Not verified');
    }

    if (!eventId) throw new BadRequestException('No event id');

    return this.billing.handleWebhook({
      eventId,
      event: body.event ?? 'unknown',
      payload: body.payload ?? {},
    });
  }
}
