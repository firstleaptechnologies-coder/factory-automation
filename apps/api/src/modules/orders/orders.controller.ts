import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { OrdersService } from './orders.service';
import { CreateOrderDto, OrderQueryDto, UpdateOrderStatusDto } from './dto/order.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: OrderQueryDto) {
    return this.orders.list(query);
  }

  @Get('pending-planning')
  pendingForPlanning() {
    return this.orders.pendingForPlanning();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }

  @Roles(UserRole.SALES, UserRole.MANAGER)
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto);
  }

  @Roles(UserRole.SALES, UserRole.MANAGER, UserRole.PLANNER)
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.setStatus(id, dto);
  }
}
