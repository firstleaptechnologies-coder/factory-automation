import { Controller, Get, Param } from '@nestjs/common';
import { PERMISSIONS } from '@decor/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { HistoryService } from './history.service';

/**
 * What happened to this, and who did it.
 *
 * One route per thing rather than one route taking an entity name, so each
 * carries the permission that already governs seeing the thing itself — being
 * able to read an order's history is being able to read the order.
 */
@Controller('history')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get('orders/:id')
  @RequirePermissions(PERMISSIONS.ORDER_VIEW)
  order(@Param('id') id: string) {
    return this.history.forOrder(id);
  }

  @Get('leads/:id')
  @RequirePermissions(PERMISSIONS.LEAD_VIEW)
  lead(@Param('id') id: string) {
    return this.history.forLead(id);
  }

  @Get('quotes/:id')
  @RequirePermissions(PERMISSIONS.ESTIMATE_VIEW)
  quote(@Param('id') id: string) {
    return this.history.forEntity('Estimate', id);
  }

  @Get('clients/:id')
  @RequirePermissions(PERMISSIONS.CLIENT_VIEW)
  client(@Param('id') id: string) {
    return this.history.forEntity('Client', id);
  }

  @Get('expenses/:id')
  @RequirePermissions(PERMISSIONS.EXPENSE_VIEW)
  expense(@Param('id') id: string) {
    return this.history.forEntity('Expense', id);
  }

  /** The money on one order: what was taken, corrected, or reversed. */
  @Get('payments/:orderId')
  @RequirePermissions(PERMISSIONS.PAYMENT_VIEW)
  payments(@Param('orderId') orderId: string) {
    return this.history.forPayments(orderId);
  }
}
