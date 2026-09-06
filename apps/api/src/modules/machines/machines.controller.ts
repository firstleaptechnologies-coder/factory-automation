import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { MachinesService } from './machines.service';
import { CreateMachineDto, UpdateMachineStatusDto } from './dto/machine.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('machines')
export class MachinesController {
  constructor(private readonly machines: MachinesService) {}

  @Get()
  list() {
    return this.machines.list();
  }

  @Get('board')
  board() {
    return this.machines.board();
  }

  @Get('downtime-reasons')
  downtimeReasons() {
    return this.machines.listDowntimeReasons();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.machines.findOne(id);
  }

  @Roles(UserRole.MANAGER)
  @Post()
  create(@Body() dto: CreateMachineDto) {
    return this.machines.create(dto);
  }

  @Roles(UserRole.MANAGER, UserRole.OPERATOR, UserRole.PLANNER)
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMachineStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.machines.setStatus(id, dto, user?.id);
  }
}
