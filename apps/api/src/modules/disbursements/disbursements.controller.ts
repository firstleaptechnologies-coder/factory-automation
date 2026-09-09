import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MODULES, PERMISSIONS } from '@fas/shared';
import { DisbursementsService } from './disbursements.service';
import {
  CategoryDto,
  CreateDisbursementDto,
  DisbursementQueryDto,
  LabelDto,
  ReverseDisbursementDto,
  SettleDisbursementDto,
  UpdateDisbursementDto,
} from './dto/disbursement.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule } from '../../common/decorators/module.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@RequireModule(MODULES.FINANCE)
@Controller('disbursements')
export class DisbursementsController {
  constructor(private readonly disbursements: DisbursementsService) {}

  /** What this tenant calls these charges — drives every heading in the app. */
  @RequirePermissions(PERMISSIONS.DISBURSEMENT_VIEW)
  @Get('label')
  async label() {
    return { label: await this.disbursements.label() };
  }

  @RequirePermissions(PERMISSIONS.DISBURSEMENT_MANAGE)
  @Patch('label')
  setLabel(@Body() dto: LabelDto) {
    return this.disbursements.setLabel(dto.label);
  }

  @RequirePermissions(PERMISSIONS.DISBURSEMENT_VIEW)
  @Get('categories')
  listCategories(@Query('includeInactive') includeInactive?: string) {
    return this.disbursements.listCategories(includeInactive === 'true');
  }

  @RequirePermissions(PERMISSIONS.DISBURSEMENT_MANAGE)
  @Post('categories')
  createCategory(@Body() dto: CategoryDto) {
    return this.disbursements.createCategory(dto);
  }

  @RequirePermissions(PERMISSIONS.DISBURSEMENT_MANAGE)
  @Delete('categories/:id')
  deactivateCategory(@Param('id') id: string) {
    return this.disbursements.deactivateCategory(id);
  }

  @RequirePermissions(PERMISSIONS.DISBURSEMENT_VIEW)
  @Get()
  ledger(@Query() query: DisbursementQueryDto) {
    return this.disbursements.ledger(query);
  }

  @RequirePermissions(PERMISSIONS.DISBURSEMENT_VIEW)
  @Get('order/:orderId')
  forOrder(@Param('orderId') orderId: string) {
    return this.disbursements.forOrder(orderId);
  }

  @RequirePermissions(PERMISSIONS.DISBURSEMENT_MANAGE)
  @Post('order/:orderId')
  create(
    @Param('orderId') orderId: string,
    @Body() dto: CreateDisbursementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.disbursements.create(orderId, dto, user?.id);
  }

  @RequirePermissions(PERMISSIONS.DISBURSEMENT_MANAGE)
  @Post(':id/settle')
  settle(
    @Param('id') id: string,
    @Body() dto: SettleDisbursementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.disbursements.settle(id, dto, user?.id);
  }

  /**
   * Takes a settled payout back.
   *
   * A planned one is cancelled with DELETE instead: an intention is not a
   * movement of money, and there is nothing to take back.
   */
  @RequirePermissions(PERMISSIONS.DISBURSEMENT_MANAGE)
  @Post(':id/reverse')
  reverse(
    @Param('id') id: string,
    @Body() dto: ReverseDisbursementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.disbursements.reverse(id, dto.reason, user?.id);
  }

  @RequirePermissions(PERMISSIONS.DISBURSEMENT_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDisbursementDto) {
    return this.disbursements.update(id, dto);
  }

  @RequirePermissions(PERMISSIONS.DISBURSEMENT_MANAGE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.disbursements.remove(id);
  }
}
