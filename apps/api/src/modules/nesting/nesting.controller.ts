import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { NestPlanStatus, UserRole } from '@prisma/client';
import { NestingService } from './nesting.service';
import {
  CreateNestPlanDto,
  PreviewNestDto,
  UpdateNestStatusDto,
} from './dto/nest.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('nesting')
export class NestingController {
  constructor(private readonly nesting: NestingService) {}

  @Get('plans')
  list(@Query('status') status?: NestPlanStatus) {
    return this.nesting.list(status);
  }

  @Get('plans/:id')
  findOne(@Param('id') id: string) {
    return this.nesting.findOne(id);
  }

  @Roles(UserRole.PLANNER, UserRole.MANAGER, UserRole.SALES)
  @Post('preview')
  preview(@Body() dto: PreviewNestDto) {
    return this.nesting.preview(dto);
  }

  @Roles(UserRole.PLANNER, UserRole.MANAGER)
  @Post('plans')
  create(@Body() dto: CreateNestPlanDto) {
    return this.nesting.create(dto);
  }

  @Roles(UserRole.PLANNER, UserRole.MANAGER)
  @Patch('plans/:id/status')
  setStatus(@Param('id') id: string, @Body() dto: UpdateNestStatusDto) {
    return this.nesting.setStatus(id, dto);
  }
}
