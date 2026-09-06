import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ProductionService } from './production.service';
import {
  AssignJobDto,
  CreateJobDto,
  JobProgressDto,
  JobQueryDto,
  PauseJobDto,
  QualityCheckDto,
  ResequenceDto,
} from './dto/job.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('jobs')
export class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Get()
  list(@Query() query: JobQueryDto) {
    return this.production.list(query);
  }

  @Get('my-queue')
  myQueue(@CurrentUser() user: AuthUser) {
    return this.production.myQueue(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.production.findOne(id);
  }

  @Roles(UserRole.PLANNER, UserRole.MANAGER)
  @Post()
  create(@Body() dto: CreateJobDto) {
    return this.production.create(dto);
  }

  @Roles(UserRole.PLANNER, UserRole.MANAGER)
  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignJobDto) {
    return this.production.assign(id, dto);
  }

  @Roles(UserRole.PLANNER, UserRole.MANAGER)
  @Post('resequence')
  resequence(@Body() dto: ResequenceDto) {
    return this.production.resequence(dto);
  }

  @Roles(UserRole.OPERATOR, UserRole.PLANNER, UserRole.MANAGER)
  @Post(':id/start')
  start(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.production.start(id, user?.id);
  }

  @Roles(UserRole.OPERATOR, UserRole.PLANNER, UserRole.MANAGER)
  @Post(':id/pause')
  pause(@Param('id') id: string, @Body() dto: PauseJobDto, @CurrentUser() user: AuthUser) {
    return this.production.pause(id, dto, user?.id);
  }

  @Roles(UserRole.OPERATOR, UserRole.PLANNER, UserRole.MANAGER)
  @Patch(':id/progress')
  progress(@Param('id') id: string, @Body() dto: JobProgressDto) {
    return this.production.progress(id, dto);
  }

  @Roles(UserRole.OPERATOR, UserRole.PLANNER, UserRole.MANAGER)
  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.production.complete(id, user?.id);
  }

  @Roles(UserRole.QC, UserRole.MANAGER, UserRole.OPERATOR)
  @Post(':id/quality-check')
  qualityCheck(
    @Param('id') id: string,
    @Body() dto: QualityCheckDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.production.recordQualityCheck(id, dto, user?.id);
  }
}
