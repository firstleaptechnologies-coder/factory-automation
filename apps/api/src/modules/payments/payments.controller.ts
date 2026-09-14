import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MODULES, PERMISSIONS } from '@fas/shared';
import { PaymentsService } from './payments.service';
import {
  CashPositionQueryDto,
  RecordDepositDto,
  RecordPaymentDto,
  ReversePaymentDto,
  TransactionQueryDto,
} from './dto/payment.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule } from '../../common/decorators/module.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

/*
 * Guarded by permission rather than by role name.
 *
 * Which people in a shop may take money, bank it, or see the float is that
 * shop's own decision — roles are theirs to rename and recombine, and the
 * permissions on the role are what the product is written against. Guarding
 * these routes by the names of the roles we happen to seed meant a tenant that
 * reorganised its people got the wrong answer, and that somebody in Sales could
 * bank cash through the API although nothing had granted them that.
 */
@RequireModule(MODULES.FINANCE)
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @RequirePermissions(PERMISSIONS.PAYMENT_VIEW)
  @Get('orders/:orderId/payments')
  summary(@Param('orderId') orderId: string) {
    return this.payments.summary(orderId);
  }

  @RequirePermissions(PERMISSIONS.PAYMENT_RECORD)
  @Post('orders/:orderId/payments')
  record(
    @Param('orderId') orderId: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.record(orderId, dto, user?.id);
  }

  /**
   * Take a receipt back.
   *
   * A POST rather than a DELETE, because nothing is deleted: the correction is
   * a new row that takes the old one back, and it needs a reason to carry.
   */
  @RequirePermissions(PERMISSIONS.PAYMENT_DELETE)
  @Post('payments/:paymentId/reverse')
  reverse(
    @Param('paymentId') paymentId: string,
    @Body() dto: ReversePaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.reverse(paymentId, dto.reason, user?.id);
  }

  @RequirePermissions(PERMISSIONS.CASH_DEPOSIT)
  @Post('payments/deposits')
  deposit(@Body() dto: RecordDepositDto, @CurrentUser() user: AuthUser) {
    return this.payments.deposit(dto, user?.id);
  }

  /**
   * Every movement of money except a payout, filterable.
   *
   * Payouts are deliberately elsewhere: they have a ledger of their own, and
   * folding them in here would be the netting-off the books must not do.
   */
  @RequirePermissions(PERMISSIONS.CASH_POSITION_VIEW)
  @Get('payments/transactions')
  transactions(@Query() query: TransactionQueryDto) {
    return this.payments.transactions(query);
  }

  /** Shop-wide cash and online totals. */
  @RequirePermissions(PERMISSIONS.CASH_POSITION_VIEW)
  @Get('payments/cash-position')
  cashPosition(@Query() query: CashPositionQueryDto) {
    return this.payments.cashPosition(query);
  }

  /** What is still in hand, order by order. */
  /**
   * What the shop is owed, and by whom.
   *
   * Gated with the cash position rather than with an order's own payments: it
   * is the whole book at once, which is the owner's question and not the
   * floor's.
   */
  @RequirePermissions(PERMISSIONS.CASH_POSITION_VIEW)
  @Get('payments/outstanding')
  outstanding() {
    return this.payments.outstanding();
  }

  @RequirePermissions(PERMISSIONS.CASH_POSITION_VIEW)
  @Get('payments/cash-in-hand')
  cashInHand() {
    return this.payments.cashToBank();
  }
}
