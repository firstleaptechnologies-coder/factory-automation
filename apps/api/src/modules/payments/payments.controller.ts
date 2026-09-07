import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PaymentsService } from './payments.service';
import {
  CashPositionQueryDto,
  RecordDepositDto,
  RecordPaymentDto,
} from './dto/payment.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('orders/:orderId/payments')
  summary(@Param('orderId') orderId: string) {
    return this.payments.summary(orderId);
  }

  @Roles(UserRole.SALES, UserRole.MANAGER, UserRole.ADMIN)
  @Post('orders/:orderId/payments')
  record(
    @Param('orderId') orderId: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.payments.record(orderId, dto, user?.id);
  }

  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Delete('payments/:paymentId')
  remove(@Param('paymentId') paymentId: string) {
    return this.payments.remove(paymentId);
  }

  @Roles(UserRole.SALES, UserRole.MANAGER, UserRole.ADMIN)
  @Post('payments/deposits')
  deposit(@Body() dto: RecordDepositDto, @CurrentUser() user: AuthUser) {
    return this.payments.deposit(dto, user?.id);
  }

  /** Shop-wide cash and online totals. */
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Get('payments/cash-position')
  cashPosition(@Query() query: CashPositionQueryDto) {
    return this.payments.cashPosition(query);
  }

  /** What is still in hand, order by order. */
  @Roles(UserRole.MANAGER, UserRole.ADMIN)
  @Get('payments/cash-in-hand')
  cashInHand() {
    return this.payments.cashInHandByOrder();
  }
}
