import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { InventoryService } from './inventory.service';
import {
  AdjustStockDto,
  CloseStockUnitDto,
  CreateLocationDto,
  IssueToJobDto,
  ReceiveStockDto,
  StockQueryDto,
  TransferStockDto,
} from './dto/inventory.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('locations')
  listLocations() {
    return this.inventory.listLocations();
  }

  @Roles(UserRole.MANAGER, UserRole.STORE)
  @Post('locations')
  createLocation(@Body() dto: CreateLocationDto) {
    return this.inventory.createLocation(dto);
  }

  @Get('stock')
  list(@Query() query: StockQueryDto) {
    return this.inventory.list(query);
  }

  @Get('stock/summary')
  summary() {
    return this.inventory.summary();
  }

  @Get('stock/:id')
  findOne(@Param('id') id: string) {
    return this.inventory.findOne(id);
  }

  @Get('stock/:id/movements')
  movements(@Param('id') id: string) {
    return this.inventory.movements(id);
  }

  @Roles(UserRole.STORE, UserRole.MANAGER)
  @Post('receive')
  receive(@Body() dto: ReceiveStockDto, @CurrentUser() user: AuthUser) {
    return this.inventory.receive(dto, user?.id);
  }

  @Roles(UserRole.STORE, UserRole.MANAGER, UserRole.OPERATOR)
  @Post('issue')
  issue(@Body() dto: IssueToJobDto, @CurrentUser() user: AuthUser) {
    return this.inventory.issueToJob(dto, user?.id);
  }

  @Roles(UserRole.STORE, UserRole.MANAGER, UserRole.OPERATOR)
  @Post('close-sheet')
  close(@Body() dto: CloseStockUnitDto, @CurrentUser() user: AuthUser) {
    return this.inventory.closeStockUnit(dto, user?.id);
  }

  @Roles(UserRole.STORE, UserRole.MANAGER)
  @Post('transfer')
  transfer(@Body() dto: TransferStockDto, @CurrentUser() user: AuthUser) {
    return this.inventory.transfer(dto, user?.id);
  }

  @Roles(UserRole.STORE, UserRole.MANAGER)
  @Post('adjust')
  adjust(@Body() dto: AdjustStockDto, @CurrentUser() user: AuthUser) {
    return this.inventory.adjust(dto, user?.id);
  }
}
