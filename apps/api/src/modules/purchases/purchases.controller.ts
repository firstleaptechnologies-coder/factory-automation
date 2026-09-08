import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MODULES, PERMISSIONS } from '@decor/shared';
import { PurchasesService } from './purchases.service';
import { StockService } from '../stock/stock.service';
import {
  BillDto,
  PayPurchaseDto,
  PurchaseDto,
  PurchaseQueryDto,
  ReceiveDto,
  StockMoveDto,
  StockQueryDto,
  WasteQueryDto,
} from './dto/purchase.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule } from '../../common/decorators/module.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@RequireModule(MODULES.PURCHASING)
@Controller()
export class PurchasesController {
  constructor(
    private readonly purchases: PurchasesService,
    private readonly stock: StockService,
  ) {}

  // -- the rack -------------------------------------------------------------

  /**
   * What is on the rack.
   *
   * Readable by anybody who may see stock, including the floor: whether there
   * is board to start on is a question production asks before anybody else.
   */
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Get('stock')
  levels(@Query() query: StockQueryDto) {
    return this.stock.levels(query);
  }

  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Get('stock/waste')
  waste(@Query() query: WasteQueryDto) {
    return this.stock.waste(query);
  }

  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Get('stock/:materialId/moves')
  moves(@Param('materialId') materialId: string) {
    return this.stock.moves(materialId);
  }

  /** Issuing, the offcut back, the waste, a count. Never a delivery. */
  @RequirePermissions(PERMISSIONS.STOCK_MOVE)
  @Post('stock/moves')
  record(@Body() dto: StockMoveDto, @CurrentUser() user?: AuthUser) {
    return this.stock.record(dto, user?.id);
  }

  // -- purchases ------------------------------------------------------------

  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  @Get('purchases')
  list(@Query() query: PurchaseQueryDto) {
    return this.purchases.list(query);
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  @Get('purchases/:id')
  get(@Param('id') id: string) {
    return this.purchases.get(id);
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_MANAGE)
  @Post('purchases')
  create(@Body() dto: PurchaseDto, @CurrentUser() user?: AuthUser) {
    return this.purchases.create(dto, user?.id);
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_MANAGE)
  @Patch('purchases/:id')
  update(@Param('id') id: string, @Body() dto: PurchaseDto) {
    return this.purchases.update(id, dto);
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_MANAGE)
  @Post('purchases/:id/place')
  place(@Param('id') id: string) {
    return this.purchases.place(id);
  }

  /** A delivery. Stock arrives here and nowhere else. */
  @RequirePermissions(PERMISSIONS.PURCHASE_MANAGE)
  @Post('purchases/:id/receive')
  receive(@Param('id') id: string, @Body() dto: ReceiveDto, @CurrentUser() user?: AuthUser) {
    return this.purchases.receive(id, dto, user?.id);
  }

  /** The vendor's own paperwork, once it arrives. */
  @RequirePermissions(PERMISSIONS.PURCHASE_MANAGE)
  @Post('purchases/:id/bill')
  bill(@Param('id') id: string, @Body() dto: BillDto) {
    return this.purchases.bill(id, dto);
  }

  /**
   * Pays it, and posts it.
   *
   * Gated apart from ordering: deciding what to buy and handing over the money
   * are different decisions, often different people.
   */
  @RequirePermissions(PERMISSIONS.PURCHASE_PAY)
  @Post('purchases/:id/pay')
  pay(@Param('id') id: string, @Body() dto: PayPurchaseDto, @CurrentUser() user?: AuthUser) {
    return this.purchases.pay(id, dto, user?.id);
  }

  /** Cancels one nothing has arrived against. */
  @RequirePermissions(PERMISSIONS.PURCHASE_MANAGE)
  @Delete('purchases/:id')
  cancel(@Param('id') id: string) {
    return this.purchases.cancel(id);
  }
}
